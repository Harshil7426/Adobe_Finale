import os
import shutil
import uvicorn
from pathlib import Path
from fastapi import FastAPI, UploadFile, HTTPException, Form, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from typing import List, Dict
from pydantic import BaseModel
from datetime import datetime
import model 
import json
import google.generativeai as genai
import re

# Set the path to the 'task' directory relative to the project root.
TASK_DIR = Path(__file__).parent.parent / "task"
FRONTEND_BUILD_DIR = Path(__file__).parent.parent / "frontend/dist"

TASK_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5178"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RecommendationRequest(BaseModel):
    task_name: str
    query_text: str

# Configure the Gemini API with your API key
# ⚠️ WARNING: This is a security risk. Do not commit this file to a public repository.
GEMINI_API_KEY = "AIzaSyD-tsMc87ta5Dpa7DUQu-PWr2F1Dv3hJcU"

try:
    genai.configure(api_key=GEMINI_API_KEY)
    GEMINI_MODEL = genai.GenerativeModel('gemini-1.5-flash-latest')
except Exception as e:
    print(f"Error configuring Gemini API: {e}")
    GEMINI_MODEL = None

# In main.py
def refine_with_gemini(text: str, query: str) -> Dict:
    """
    Sends the raw text and query to the Gemini API for summarization and reason generation.
    Returns a dictionary with 'section' and 'reason'.
    """
    if not GEMINI_MODEL:
        return {
            "section": text[:200].strip() + "...",
            "reason": f"Gemini API not available. This is a generic reason for '{query}'."
        }

    prompt = f"""
    You are an AI assistant that summarizes document sections based on a user's query.
    
    The user's query is: "{query}"
    
    The document section is: "{text}"
    
    Instruction: Summarize the document section in 1-2 sentences, focusing on its relevance to the user's query. Then, provide a different one-sentence, concise reason for why this specific section was chosen.
    
    Example Output:
    Summary: The research paper proposes a hybrid malware classification model using Random Forest and XGBoost algorithms.
    Reason: This section was chosen because it directly mentions the machine learning models specified in the user's query.

    Your output must start with "Summary: " followed by the summary, and then a new line with "Reason: " followed by the reason.
    """

    try:
        response = GEMINI_MODEL.generate_content(prompt)
        raw_output = response.text.strip()
        
        # Robust parsing to handle non-JSON output
        summary = "Summary could not be generated."
        reason = "Reason could not be generated."
        
        if raw_output:
            lines = raw_output.split('\n')
            if len(lines) >= 2:
                if lines[0].startswith("Summary:"):
                    summary = lines[0][len("Summary:"):].strip()
                if lines[1].startswith("Reason:"):
                    reason = lines[1][len("Reason:"):].strip()
        
        return {
            "section": summary,
            "reason": reason
        }
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return {
            "section": text[:200].strip() + "...",
            "reason": f"Failed to get a specific reason from Gemini for '{query}'."
        }

@app.post("/upload_task")
async def upload_task(task_name: str = Form(...), bulk_files: List[UploadFile] = File(...), fresh_file: UploadFile = File(...)):
    """
    Handles the upload of bulk and fresh PDF files and saves them
    to a directory named by the user.
    """
    try:
        sanitized_task_name = Path(task_name).name
        if not sanitized_task_name:
            raise HTTPException(status_code=400, detail="Invalid task name.")

        task_path = TASK_DIR / sanitized_task_name
        
        if task_path.exists() and task_path.is_dir():
            raise HTTPException(status_code=400, detail=f"Task '{sanitized_task_name}' already exists. Please choose a different name.")
        
        bulk_dir = task_path / "bulk"
        fresh_dir = task_path / "fresh"
        bulk_dir.mkdir(parents=True, exist_ok=True)
        fresh_dir.mkdir(parents=True, exist_ok=True)

        temp_bulk_dir = task_path / "temp_bulk"
        temp_bulk_dir.mkdir(parents=True, exist_ok=True)
        
        fresh_file_path = fresh_dir / fresh_file.filename
        with open(fresh_file_path, "wb") as buffer:
            shutil.copyfileobj(fresh_file.file, buffer)
            
        for file in bulk_files:
            bulk_file_path = temp_bulk_dir / file.filename
            with open(bulk_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        
        (task_path / 'status.txt').write_text('processing')
        (task_path / 'created_at.txt').write_text(datetime.now().isoformat())
        
        model.embed_documents(sanitized_task_name, temp_bulk_dir, task_path)
        
        for file in os.listdir(temp_bulk_dir):
            shutil.move(temp_bulk_dir / file, bulk_dir / file)
        shutil.rmtree(temp_bulk_dir)
        
        (task_path / 'status.txt').write_text('ready')
                
        return {"status": "success", "task_name": sanitized_task_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

@app.post("/get_recommendations")
async def get_recommendations_endpoint(request_body: RecommendationRequest):
    """
    Takes selected text, runs the semantic search, and refines the output with Gemini.
    """
    try:
        task_path = TASK_DIR / request_body.task_name
        
        raw_recommendations = model.get_recommendations(request_body.task_name, request_body.query_text, task_path)
        
        final_recommendations = []
        for rec in raw_recommendations:
            # Use the LLM to refine the section and reason
            refined_data = refine_with_gemini(rec['section'], request_body.query_text)
            
            final_recommendations.append({
                "pdf_name": rec['pdf_name'],
                "page_number": rec['page_number'],
                "section": refined_data['section'],
                "reason": refined_data['reason']
            })

        recommendations_path = task_path / "recommendations.json"
        with open(recommendations_path, "w") as f:
            json.dump(final_recommendations, f, indent=4)

        return JSONResponse(content={"recommendations": final_recommendations})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation retrieval failed: {str(e)}")

@app.get("/tasks")
async def get_tasks():
    """Returns a list of all created tasks."""
    tasks = []
    if not TASK_DIR.exists():
        return []

    for task_name in os.listdir(TASK_DIR):
        task_path = TASK_DIR / task_name
        if task_path.is_dir():
            bulk_files = os.listdir(task_path / "bulk") if (task_path / "bulk").is_dir() else []
            fresh_files = os.listdir(task_path / "fresh") if (task_path / "fresh").is_dir() else []
            
            status_file = task_path / 'status.txt'
            status = status_file.read_text().strip() if status_file.exists() else 'processing'
            
            created_at_file = task_path / 'created_at.txt'
            created_at = created_at_file.read_text().strip() if created_at_file.exists() else None
            
            tasks.append({
                "task_name": task_name,
                "bulk_files": bulk_files,
                "fresh_files": fresh_files,
                "status": status,
                "created_at": created_at
            })
    return tasks

@app.get("/pdfs/{task_name}/{filename}")
async def get_pdf(task_name: str, filename: str):
    pdf_path_fresh = TASK_DIR / task_name / "fresh" / filename
    pdf_path_bulk = TASK_DIR / task_name / "bulk" / filename
    
    if pdf_path_fresh.exists() and pdf_path_fresh.is_file():
        return FileResponse(pdf_path_fresh, media_type="application/pdf")
    
    if pdf_path_bulk.exists() and pdf_path_bulk.is_file():
        return FileResponse(pdf_path_bulk, media_type="application/pdf")
        
    raise HTTPException(status_code=404, detail="PDF not found.")

app.mount("/", StaticFiles(directory=FRONTEND_BUILD_DIR, html=True), name="static")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    return FileResponse(FRONTEND_BUILD_DIR / "index.html")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)