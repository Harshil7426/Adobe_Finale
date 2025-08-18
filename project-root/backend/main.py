import os
import shutil
import uvicorn
from pathlib import Path
from fastapi import FastAPI, UploadFile, HTTPException, Form, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from typing import List, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import model 
import json
import google.generativeai as genai
import re 
import time
import random

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

class InsightsRequest(BaseModel):
    query_text: str
    recommendations: List[Dict[str, Any]]
    task_name: str 

class PodcastRequest(BaseModel):
    query_text: str
    recommendations: List[Dict[str, Any]]
    insights: Dict[str, Any]
    task_name: str 

# Configure the Gemini API with your API key
# ⚠️ WARNING: This is a security risk. Do not commit this file to a public repository.
GEMINI_API_KEY = "AIzaSyBZJlrA3Epd51H8HkhOM5JUXRtCnXDu3F8" # Your Gemini API Key

try:
    genai.configure(api_key=GEMINI_API_KEY)
    GEMINI_MODEL = genai.GenerativeModel('gemini-1.5-flash-latest')
except Exception as e:
    print(f"Error configuring Gemini API: {e}")
    GEMINI_MODEL = None

def refine_with_gemini(text: str, query: str) -> Dict:
    """
    Guarantees a reason is returned for a document's relevance,
    with a fallback to a simple reason if the Gemini API fails.
    """
    shortened_section = text[:200].strip() + "..."
    if len(text) <= 200:
        shortened_section = text.strip()

    fallback_reason = "This section is relevant as it contains information related to the query's topic."

    if not GEMINI_MODEL:
        return {
            "section": shortened_section,
            "reason": f"Gemini API is not available. {fallback_reason}"
        }

    reason_prompt = f"""
    You are an AI assistant that provides a specific reason for a document's relevance to a query.

    The original query is: "{query}"

    The relevant document section is: "{text}"

    Please provide a one-sentence, specific reason why this document section is relevant to the query. For example:
    "This section is relevant because it discusses the benefits of using an ensemble model, which is a key concept in the query."

    The reason must be unique and different for every recommendation.
    """

    try:
        response = GEMINI_MODEL.generate_content(reason_prompt)
        
        if hasattr(response, 'text') and response.text:
            curated_reason = response.text.strip()
            return {
                "section": shortened_section,
                "reason": curated_reason
            }
        else:
            print(f"Gemini API returned no text for the query: '{query}'.")
            return {
                "section": shortened_section,
                "reason": f"Gemini returned an empty response. {fallback_reason}"
            }
            
    except Exception as e:
        error_message = str(e)
        if "RESOURCE_EXHAUSTED" in error_message or "429" in error_message:
            print(f"API quota exceeded. Falling back to generic reason.")
            return {
                "section": shortened_section,
                "reason": fallback_reason
            }
        else:
            print(f"An unknown API error occurred: {e}")
            return {
                "section": shortened_section,
                "reason": f"An unknown API error occurred. {fallback_reason}"
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
        
        # ⭐ FIX: Call model.embed_documents to process and embed PDFs into ChromaDB
        model.embed_documents(sanitized_task_name, temp_bulk_dir, task_path)
        
        # After embedding, move files from temp_bulk to bulk
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
        
        # This line performs the semantic search based on the query text
        # and returns up to 5 relevant recommendations from the ChromaDB.
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
        print(f"Error generating recommendations: {e}") # Added more specific logging
        raise HTTPException(status_code=500, detail=f"Recommendation retrieval failed: {str(e)}")


@app.post("/get_insights")
async def get_insights_endpoint(request_body: InsightsRequest):
    """
    Generates insights (facts, did-you-knows) based on selected text and recommendations using Gemini API.
    Saves the insights to insights.json.
    """
    try:
        if not GEMINI_MODEL:
            return JSONResponse(content={"insights": {"facts": ["API not available."], "didYouKnows": []}}, status_code=503)

        insights_prompt = f"""
        Based on the user's selected text and the provided recommendations, generate interesting insights, facts, and "Did You Know?" points.
        
        User's selected text: "{request_body.query_text}"
        Recommendations: {json.dumps(request_body.recommendations, indent=2)}

        Provide your response as a JSON object with two keys: "facts" and "didYouKnows". Each key should be a list of strings.
        Example:
        {{
            "facts": ["Fact 1", "Fact 2"],
            "didYouKnows": ["Did you know 1?", "Did you know 2?"]
        }}
        """
        response = GEMINI_MODEL.generate_content(insights_prompt)
        raw_text_response = response.text
        
        # Use regex to extract only the JSON part from the response text
        # This handles cases where the model might wrap JSON in markdown fences or add extra characters.
        json_match = re.search(r"```json\s*(\{.*\})\s*```", raw_text_response, re.DOTALL)
        
        insights_data = {"facts": [], "didYouKnows": []} # Default empty structure
        
        if json_match:
            json_string = json_match.group(1) # Extract the content inside the first group
            try:
                insights_data = json.loads(json_string)
                # Ensure the structure matches what the frontend expects
                if not isinstance(insights_data, dict) or "facts" not in insights_data or "didYouKnows" not in insights_data:
                    # Fallback if the JSON structure is unexpected, try to extract text as a single fact
                    insights_data = {"facts": [json_string], "didYouKnows": []}
            except json.JSONDecodeError:
                # If the extracted string isn't valid JSON, treat the whole response as a single fact
                insights_data = {"facts": [raw_text_response], "didYouKnows": []} # Use raw_text_response here as fallback
        else:
            # If no JSON block is found, try to parse the entire response, or fallback to raw text
            try:
                insights_data = json.loads(raw_text_response)
                if not isinstance(insights_data, dict) or "facts" not in insights_data or "didYouKnows" not in insights_data:
                    insights_data = {"facts": [raw_text_response], "didYouKnows": []}
            except json.JSONDecodeError:
                insights_data = {"facts": [raw_text_response], "didYouKnows": []}


        # Save the insights to insights.json
        task_path = TASK_DIR / request_body.task_name
        task_path.mkdir(parents=True, exist_ok=True) 
        insights_path = task_path / "insights.json"
        with open(insights_path, "w") as f:
            json.dump(insights_data, f, indent=4)

        return JSONResponse(content={"insights": insights_data})

    except Exception as e:
        print(f"Error generating insights: {e}")
        raise HTTPException(status_code=500, detail=f"Insights generation failed: {str(e)}")


@app.post("/get_podcast_script")
async def get_podcast_script_endpoint(request_body: PodcastRequest):
    """
    Generates a two-person podcast script based on selected text, recommendations, and insights using Gemini API.
    Saves the podcast script to podcast.json.
    """
    try:
        if not GEMINI_MODEL:
            return JSONResponse(content={"script": "Podcast generation failed. API not available."}, status_code=503)
        
        podcast_prompt = f"""
        Create a script for a short, engaging, two-person podcast (1-2 minutes).
        The podcast should be a professional and beautifully curated explanation of the user's query,
        incorporating key findings from the provided recommendations and insights.

        The podcast should feature two distinct speakers, "Host A" and "Host B", with their names
        clearly preceding their dialogue.

        Podcast Title: "AI in Tech" (or a more relevant title if context allows)

        User's selected text: "{request_body.query_text}"
        Recommendations: {json.dumps(request_body.recommendations, indent=2)}
        Insights: {json.dumps(request_body.insights, indent=2)}

        The script should have a clear introduction, body, and conclusion. Use a professional and friendly tone.
        Example of dialogue format:
        Host A: Welcome to the show!
        Host B: Today, we're diving into...
        """
        response = GEMINI_MODEL.generate_content(podcast_prompt)
        podcast_script = response.text # Get the raw text from the model

        # Save the podcast script to podcast.json
        task_path = TASK_DIR / request_body.task_name
        task_path.mkdir(parents=True, exist_ok=True)
        podcast_path = task_path / "podcast.json"
        with open(podcast_path, "w") as f:
            f.write(podcast_script) # Save the plain text script

        return JSONResponse(content={"script": podcast_script})

    except Exception as e:
        print(f"Error generating podcast script: {e}")
        raise HTTPException(status_code=500, detail=f"Podcast generation failed: {str(e)}")


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
