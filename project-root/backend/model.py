import os
import fitz  # PyMuPDF
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
from pathlib import Path
from chromadb import PersistentClient  # instead of chromadb.Client
import time
from typing import List, Dict, Any

# Initialize the embedding model to load it once
try:
    EMBEDDING_MODEL = SentenceTransformer('all-MiniLM-L6-v2')
except Exception as e:
    print(f"Error loading SentenceTransformer model: {e}")
    EMBEDDING_MODEL = None

def chunk_text(pdf_path: Path) -> List[Dict[str, Any]]:
    """Extracts and chunks text from a PDF page by page."""
    chunks = []
    try:
        doc = fitz.open(pdf_path)
        for page_num, page in enumerate(doc, start=1):
            text = page.get_text()
            if text.strip():
                chunks.append({
                    "text": text,
                    "pdf_name": pdf_path.name,
                    "page_number": page_num
                })
        doc.close()
    except Exception as e:
        print(f"Error parsing PDF {pdf_path}: {e}")
    return chunks

def embed_documents(task_name: str, bulk_dir: Path, task_path: Path):
    """
    Processes all PDFs in a directory, embeds them, and stores them in ChromaDB.
    The ChromaDB files are saved in a 'chroma' subdirectory within the task path.
    """
    if not EMBEDDING_MODEL:
        print("Embedding model not loaded. Skipping embedding process.")
        return

    print(f"Starting embedding process for task: {task_name}")
    start_time = time.time()
    
    # Initialize ChromaDB client to save data inside the task directory
    chroma_db_path = str(task_path / "chroma")
    client = PersistentClient(path=chroma_db_path)    
    # Create or get a collection for this specific task
    collection = client.get_or_create_collection(name=task_name)
    
    pdf_files = [f for f in os.listdir(bulk_dir) if f.lower().endswith(".pdf")]
    
    all_chunks = []
    for pdf_file in pdf_files:
        pdf_path = bulk_dir / pdf_file
        all_chunks.extend(chunk_text(pdf_path))
    
    if not all_chunks:
        print("No chunks to embed.")
        return

    texts = [c['text'] for c in all_chunks]
    metadatas = [
        {"pdf_name": c['pdf_name'], "page_number": c['page_number']}
        for c in all_chunks
    ]
    
    embeddings = EMBEDDING_MODEL.encode(texts, convert_to_tensor=False)
    
    ids = [f"{task_name}_{meta['pdf_name']}_page_{meta['page_number']}" for meta in metadatas]
    
    collection.add(
        embeddings=embeddings.tolist(),
        documents=texts,
        metadatas=metadatas,
        ids=ids
    )
    
    end_time = time.time()
    print(f"Embedded {len(all_chunks)} chunks for {task_name} in {end_time - start_time:.2f}s.")
    print(f"ChromaDB embeddings saved to: {chroma_db_path}")

def get_recommendations(task_name: str, query_text: str, task_path: Path) -> List[Dict[str, Any]]:
    """
    Performs a semantic search on a given task's documents and returns
    relevant sections.
    """
    if not EMBEDDING_MODEL:
        return []

    # Initialize ChromaDB client to load data from the task directory
    chroma_db_path = str(task_path / "chroma")
    client = chromadb.Client(Settings(persist_directory=chroma_db_path))
    
    try:
        collection = client.get_or_create_collection(name=task_name)
    except Exception as e:
        print(f"Error accessing collection '{task_name}': {e}")
        return []

    query_embedding = EMBEDDING_MODEL.encode([query_text], convert_to_tensor=False).tolist()

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=3,
        include=['documents', 'metadatas', 'distances']
    )
    
    recommendations = []
    for i in range(len(results['ids'][0])):
        mock_reason = f"This section is semantically relevant because it discusses concepts closely related to '{query_text}'. It provides key context and a clear overview of the topic."
        
        recommendations.append({
            "pdf_name": results['metadatas'][0][i]['pdf_name'],
            "section": results['documents'][0][i],
            "page_number": results['metadatas'][0][i]['page_number'],
            "reason": mock_reason
        })
    
    return recommendations
