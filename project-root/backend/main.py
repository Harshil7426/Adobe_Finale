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
import re
import time
import random
import requests
import base64
import io
import struct

# Set the path to the 'task' directory relative to the project root.
TASK_DIR = Path(os.getenv("TASK_DIR", Path(__file__).parent.parent / "task"))
FRONTEND_BUILD_DIR = Path(os.getenv("FRONTEND_BUILD_DIR", Path(__file__).parent.parent / "frontend/dist"))

TASK_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5178",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
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

class GenerateAudioRequest(BaseModel):
    script: str
    voice_name: str = "en-US-JennyNeural"

# --- LLM and TTS Configuration (now primarily via environment variables) ---
LLM_PROVIDER = os.getenv("LLM_PROVIDER")
if not LLM_PROVIDER:
    print("Warning: LLM_PROVIDER environment variable not set. LLM functionality may be limited.")

TTS_PROVIDER = os.getenv("TTS_PROVIDER")
AZURE_TTS_KEY = os.getenv("AZURE_TTS_KEY")
AZURE_TTS_REGION = os.getenv("AZURE_TTS_REGION", "centralindia")
AZURE_TTS_ENDPOINT_ENV = os.getenv("AZURE_TTS_ENDPOINT")

AZURE_TTS_TOKEN_ENDPOINT = None
AZURE_TTS_SPEECH_ENDPOINT = None
if TTS_PROVIDER == "azure":
    if not AZURE_TTS_KEY:
        print("Error: AZURE_TTS_KEY not found for Azure TTS. TTS functionality will be disabled.")
    else:
        AZURE_TTS_TOKEN_ENDPOINT = AZURE_TTS_ENDPOINT_ENV if AZURE_TTS_ENDPOINT_ENV else f"https://{AZURE_TTS_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
        AZURE_TTS_SPEECH_ENDPOINT = f"https://{AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
else:
    print(f"TTS_PROVIDER is not 'azure' (current: {TTS_PROVIDER}). Azure TTS will be disabled.")


def pcm_to_wav(pcm_data: bytes, sample_rate: int = 16000, channels: int = 1, bit_depth: int = 16) -> bytes:
    """Converts raw PCM audio data to WAV format."""
    byte_depth = bit_depth // 8
    data_size = len(pcm_data)
    
    wav_header = b'RIFF'
    wav_header += struct.pack('<I', 36 + data_size)
    wav_header += b'WAVE'
    
    wav_header += b'fmt '
    wav_header += struct.pack('<I', 16)
    wav_header += struct.pack('<H', 1)
    wav_header += struct.pack('<H', channels)
    wav_header += struct.pack('<I', sample_rate)
    wav_header += struct.pack('<I', sample_rate * channels * byte_depth)
    wav_header += struct.pack('<H', channels * byte_depth)
    wav_header += struct.pack('<H', bit_depth)
    
    wav_header += b'data'
    wav_header += struct.pack('<I', data_size)
    wav_header += pcm_data
    
    return wav_header


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
            # Use model.py's get_llm_response for refinement
            messages = [
                {"role": "user", "content": f"""
                You are an AI assistant that provides a specific reason for a document's relevance to a query.
                The original query is: "{request_body.query_text}"
                The relevant document section is: "{rec['section']}"
                Please provide a one-sentence, specific reason why this document section is relevant to the query.
                The reason must be unique and different for every recommendation.
                """}
            ]
            try:
                curated_reason = model.get_llm_response(messages)
            except Exception as e:
                print(f"Error calling LLM for refinement: {e}. Falling back to generic reason.")
                curated_reason = "This section is relevant as it contains information related to the query's topic."

            final_recommendations.append({
                "pdf_name": rec['pdf_name'],
                "page_number": rec['page_number'],
                "section": rec['section'],
                "reason": curated_reason
            })

        recommendations_path = task_path / "recommendations.json"
        with open(recommendations_path, "w") as f:
            json.dump(final_recommendations, f, indent=4)

        return JSONResponse(content={"recommendations": final_recommendations})
    except Exception as e:
        print(f"Error generating recommendations: {e}")
        raise HTTPException(status_code=500, detail=f"Recommendation retrieval failed: {str(e)}")


@app.post("/get_insights")
async def get_insights_endpoint(request_body: InsightsRequest):
    """
    Generates insights (facts, did-you-knows) based on selected text and recommendations using LLM.
    Saves the insights to insights.json.
    """
    try:
        if not LLM_PROVIDER:
            return JSONResponse(content={"insights": {"facts": ["LLM not configured."], "didYouKnows": []}}, status_code=503)

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
        messages = [{"role": "user", "content": insights_prompt}]
        raw_text_response = model.get_llm_response(messages)
        
        json_match = re.search(r"```json\s*(\{.*\})\s*```", raw_text_response, re.DOTALL)
        
        insights_data = {"facts": [], "didYouKnows": []}
        
        if json_match:
            json_string = json_match.group(1)
            try:
                insights_data = json.loads(json_string)
                if not isinstance(insights_data, dict) or "facts" not in insights_data or "didYouKnows" not in insights_data:
                    insights_data = {"facts": [raw_text_response], "didYouKnows": []}
            except json.JSONDecodeError:
                insights_data = {"facts": [raw_text_response], "didYouKnows": []}
        else:
            try:
                insights_data = json.loads(raw_text_response)
                if not isinstance(insights_data, dict) or "facts" not in insights_data or "didYouKnows" not in insights_data:
                    insights_data = {"facts": [raw_text_response], "didYouKnows": []}
            except json.JSONDecodeError:
                insights_data = {"facts": [raw_text_response], "didYouKnows": []}


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
    Generates a single-person podcast script based on selected text, recommendations, and insights using LLM.
    Saves the podcast script to podcast.json.
    """
    try:
        if not LLM_PROVIDER:
            return JSONResponse(content={"script": "Podcast generation failed. LLM not configured."}, status_code=503)
        
        podcast_prompt = f"""
        Create a concise, engaging, single-person podcast script (around 1-2 minutes).
        The script should provide a natural, conversational explanation of the user's query,
        seamlessly incorporating key findings from the provided recommendations and insights.
        Avoid explicit opening phrases like "Welcome to the show" or closing phrases like "That's all for today."
        Instead, make it flow like a real, continuous monologue.

        User's selected text: "{request_body.query_text}"
        Recommendations: {json.dumps(request_body.recommendations, indent=2)}
        Insights: {json.dumps(request_body.insights, indent=2)}
        """
        messages = [{"role": "user", "content": podcast_prompt}]
        podcast_script = model.get_llm_response(messages)

        task_path = TASK_DIR / request_body.task_name
        task_path.mkdir(parents=True, exist_ok=True)
        podcast_path = task_path / "podcast.json"
        with open(podcast_path, "w") as f:
            f.write(podcast_script)

        return JSONResponse(content={"script": podcast_script})

    except Exception as e:
        print(f"Error generating podcast script: {e}")
        raise HTTPException(status_code=500, detail=f"Podcast generation failed: {str(e)}")

@app.post("/generate_podcast_audio")
async def generate_podcast_audio_endpoint(request_body: GenerateAudioRequest):
    """
    Converts a given script to audio using Azure TTS and returns base64 encoded WAV.
    """
    if not AZURE_TTS_KEY or not AZURE_TTS_TOKEN_ENDPOINT or not AZURE_TTS_SPEECH_ENDPOINT:
        raise HTTPException(status_code=500, detail="Azure TTS API configuration missing or incomplete.")

    try:
        token_headers = {
            'Ocp-Apim-Subscription-Key': AZURE_TTS_KEY
        }
        token_response = requests.post(AZURE_TTS_TOKEN_ENDPOINT, headers=token_headers)
        token_response.raise_for_status()
        access_token = token_response.text

        speech_headers = {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'riff-16khz-16bit-mono-pcm',
            'User-Agent': 'FastAPIApp'
        }
        ssml_body = f"""
        <speak version='1.0' xml:lang='en-US'>
            <voice name='{request_body.voice_name}'>
                {request_body.script}
            </voice>
        </speak>
        """
        
        speech_response = requests.post(
            AZURE_TTS_SPEECH_ENDPOINT,
            headers=speech_headers,
            data=ssml_body.encode('utf-8')
        )
        speech_response.raise_for_status()

        wav_data = pcm_to_wav(speech_response.content, sample_rate=16000, channels=1, bit_depth=16)
        
        audio_base64 = base64.b64encode(wav_data).decode('utf-8')

        return JSONResponse(content={"audio_base64": audio_base64, "mime_type": "audio/wav"})

    except requests.exceptions.RequestException as e:
        print(f"Azure TTS API request failed: {e}")
        raise HTTPException(status_code=500, detail=f"Azure TTS API request failed: {str(e)}")
    except Exception as e:
        print(f"Error generating podcast audio: {e}")
        raise HTTPException(status_code=500, detail=f"Podcast audio generation failed: {str(e)}")


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
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
