import os
import time
from pathlib import Path
from typing import List, Dict, Any

import fitz  # PyMuPDF
from sentence_transformers import SentenceTransformer
from chromadb import PersistentClient  # persist on disk

# Initialize the embedding model to load it once (force CPU usage)
try:
    EMBEDDING_MODEL = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
except Exception as e:
    print(f"Error loading SentenceTransformer model: {e}")
    EMBEDDING_MODEL = None


# In model.py

def chunk_text(pdf_path: Path) -> List[Dict[str, Any]]:
    """Extracts and chunks text from a PDF, splitting by paragraph."""
    chunks: List[Dict[str, Any]] = []
    try:
        doc = fitz.open(pdf_path)
        for page_num, page in enumerate(doc, start=1):
            text = page.get_text()
            
            # Split text by paragraphs (two or more newlines)
            paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]

            for para in paragraphs:
                chunks.append({
                    "text": para,
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

    all_chunks: List[Dict[str, Any]] = []
    for pdf_file in pdf_files:
        pdf_path = bulk_dir / pdf_file
        all_chunks.extend(chunk_text(pdf_path))

    if not all_chunks:
        print("No chunks to embed.")
        return

    texts = [c['text'] for c in all_chunks]
    metadatas = [{"pdf_name": c['pdf_name'], "page_number": c['page_number']} for c in all_chunks]

    embeddings = EMBEDDING_MODEL.encode(texts, convert_to_tensor=False)
    # if numpy array, give it .tolist()
    try:
        embeddings_list = embeddings.tolist()
    except AttributeError:
        embeddings_list = embeddings

    ids = [f"{task_name}_{meta['pdf_name']}_page_{meta['page_number']}" for meta in metadatas]

    collection.add(
        embeddings=embeddings_list,
        documents=texts,
        metadatas=metadatas,
        ids=ids
    )

    end_time = time.time()
    print(f"Embedded {len(all_chunks)} chunks for {task_name} in {end_time - start_time:.2f}s.")
    print(f"ChromaDB embeddings saved to: {chroma_db_path}")


def get_recommendations(task_name: str, query_text: str, task_path: Path) -> List[Dict[str, Any]]:
    """
    Performs a semantic search on a given task's documents and returns relevant sections.
    """
    if not EMBEDDING_MODEL:
        print("Embedding model not loaded in get_recommendations.")
        return []

    chroma_db_path = str(task_path / "chroma")
    client = PersistentClient(path=chroma_db_path)

    try:
        collection = client.get_or_create_collection(name=task_name)
    except Exception as e:
        print(f"Error accessing collection '{task_name}': {e}")
        return []

    query_text = (query_text or "").strip()
    if not query_text:
        print("Empty query_text provided to get_recommendations.")
        return []

    query_embedding = EMBEDDING_MODEL.encode([query_text], convert_to_tensor=False)
    try:
        query_embedding = query_embedding.tolist()
    except AttributeError:
        pass

    results = collection.query(
        query_texts=[query_text],
        n_results=5,
        include=["documents", "metadatas", "distances"]
    )


    # Guard against empty results
    if not results or not results.get('ids') or not results['ids'] or not results['ids'][0]:
        return []

    recommendations: List[Dict[str, Any]] = []
    for i in range(len(results['ids'][0])):
        reason = (
            f"This section is semantically relevant to '{query_text}' based on embedding similarity."
        )
        recommendations.append({
            "pdf_name": results['metadatas'][0][i].get('pdf_name', ''),
            "section": results['documents'][0][i],
            "page_number": results['metadatas'][0][i].get('page_number', None),
            "reason": reason
        })

    return recommendations
