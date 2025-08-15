import os
import shutil
from pathlib import Path
from fastapi import FastAPI, UploadFile, HTTPException, Form, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List
import uvicorn

# Set the path to the 'task' directory relative to the project root.
TASK_DIR = Path(__file__).parent.parent / "task"
FRONTEND_BUILD_DIR = Path(__file__).parent.parent /"frontend"/ "dist"

TASK_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()

origins = [
    "http://localhost:5176",
    "http://localhost:3000",
    "http://localhost:5179"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload_task")
async def upload_task(task_name: str = Form(...), bulk_files: List[UploadFile] = File(...), fresh_file: UploadFile = File(...)):
    """
    Handles the upload of bulk and fresh PDF files and saves them
    to a directory named by the user.
    """
    try:
        # Sanitize task_name to prevent path traversal and other issues
        sanitized_task_name = Path(task_name).name
        if not sanitized_task_name:
            raise HTTPException(status_code=400, detail="Invalid task name.")

        task_path = TASK_DIR / sanitized_task_name
        
        # Check if a directory with the same name already exists
        if task_path.exists() and task_path.is_dir():
            raise HTTPException(status_code=400, detail=f"Task '{sanitized_task_name}' already exists. Please choose a different name.")
        
        bulk_dir = task_path / "bulk"
        fresh_dir = task_path / "fresh"
        bulk_dir.mkdir(parents=True, exist_ok=True)
        fresh_dir.mkdir(parents=True, exist_ok=True)
        
        fresh_file_path = fresh_dir / fresh_file.filename
        with open(fresh_file_path, "wb") as buffer:
            shutil.copyfileobj(fresh_file.file, buffer)
            
        for file in bulk_files:
            bulk_file_path = bulk_dir / file.filename
            with open(bulk_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
                
        return {"status": "success", "task_name": sanitized_task_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

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
            tasks.append({
                "task_name": task_name,
                "bulk_files": bulk_files,
                "fresh_files": fresh_files
            })
    return tasks

# Serve the React frontend's static files
app.mount("/", StaticFiles(directory=FRONTEND_BUILD_DIR, html=True), name="static")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    return FileResponse(FRONTEND_BUILD_DIR / "index.html")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)