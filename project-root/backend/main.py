import os
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Any

import uvicorn
from fastapi import FastAPI, UploadFile, HTTPException, Form, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import model

# Paths
TASK_DIR = Path(__file__).parent.parent / "task"
FRONTEND_BUILD_DIR = Path(__file__).parent.parent / "frontend" / "dist"
TASK_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5178",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5178",
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
    # Accept anything and coerce to a string server-side (robust to Adobe objects)
    query_text: Any


def _coerce_text(q: Any) -> str:
    """Turn various Adobe selection shapes into a plain string."""
    if q is None:
        return ""
    if isinstance(q, str):
        return q.strip()

    # Adobe can return { data: [ { text, pageNumber } ] } or just [ { text, pageNumber } ]
    if isinstance(q, dict):
        if 'data' in q:
            return _coerce_text(q['data'])
        if 'text' in q:
            return str(q['text']).strip()
        # last resort
        return str(q).strip()

    if isinstance(q, list):
        if not q:
            return ""
        first = q[0]
        if isinstance(first, dict) and 'text' in first:
            return str(first['text']).strip()
        return str(first).strip()

    return str(q).strip()


@app.post("/upload_task")
async def upload_task(
    task_name: str = Form(...),
    bulk_files: List[UploadFile] = File(...),
    fresh_file: UploadFile = File(...)
):
    """Handles the upload of bulk and fresh PDF files and saves them to a directory named by the user."""
    try:
        sanitized_task_name = Path(task_name).name
        if not sanitized_task_name:
            raise HTTPException(status_code=400, detail="Invalid task name.")

        task_path = TASK_DIR / sanitized_task_name

        if task_path.exists() and task_path.is_dir():
            raise HTTPException(status_code=400, detail=f"Task '{sanitized_task_name}' already exists. Please choose a different name.")

        # Create directories
        bulk_dir = task_path / "bulk"
        fresh_dir = task_path / "fresh"
        bulk_dir.mkdir(parents=True, exist_ok=True)
        fresh_dir.mkdir(parents=True, exist_ok=True)

        # Temporary dir for embedding
        temp_bulk_dir = task_path / "temp_bulk"
        temp_bulk_dir.mkdir(parents=True, exist_ok=True)

        # Save fresh
        fresh_file_path = fresh_dir / fresh_file.filename
        with open(fresh_file_path, "wb") as buffer:
            shutil.copyfileobj(fresh_file.file, buffer)

        # Save bulks to temp
        for file in bulk_files:
            bulk_file_path = temp_bulk_dir / file.filename
            with open(bulk_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

        # Mark processing
        (task_path / 'status.txt').write_text('processing')
        (task_path / 'created_at.txt').write_text(datetime.now().isoformat())

        # Embed
        model.embed_documents(sanitized_task_name, temp_bulk_dir, task_path)

        # Move to final bulk
        for file in os.listdir(temp_bulk_dir):
            shutil.move(str(temp_bulk_dir / file), str(bulk_dir / file))
        shutil.rmtree(temp_bulk_dir)

        # Mark ready
        (task_path / 'status.txt').write_text('ready')

        return {"status": "success", "task_name": sanitized_task_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

@app.post("/get_recommendations")
async def get_recommendations_endpoint(request_body: RecommendationRequest):
    try:
        print("Incoming request body:", request_body.dict())  # 👈 add this

        task_path = TASK_DIR / request_body.task_name
        if not task_path.exists():
            raise HTTPException(status_code=400, detail=f"Task '{request_body.task_name}' not found.")

        query_text_str = _coerce_text(request_body.query_text)
        print("Coerced query_text:", repr(query_text_str))  # 👈 add this

        if not query_text_str:
            raise HTTPException(status_code=400, detail="Empty query_text after coercion.")

        recommendations = model.get_recommendations(request_body.task_name, query_text_str, task_path)
        print("Generated recommendations:", recommendations)  # 👈 add this

        recommendations_path = task_path / "recommendations.json"
        with open(recommendations_path, "w", encoding="utf-8") as f:
            json.dump(recommendations, f, indent=4, ensure_ascii=False)

        return JSONResponse(content={"recommendations": recommendations})

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print("Full traceback:\n", traceback.format_exc())  # 👈 this will show exact error
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
