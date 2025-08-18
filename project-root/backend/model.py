import os
import time
from pathlib import Path
from typing import List, Dict, Any
import re
import fitz
from sentence_transformers import SentenceTransformer
from chromadb import PersistentClient

# Initialize the embedding model to load it once (force CPU usage)
try:
    EMBEDDING_MODEL = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
except Exception as e:
    print(f"Error loading SentenceTransformer model: {e}")
    EMBEDDING_MODEL = None

def preprocess_text(text: str) -> str:
    """Cleans and normalizes text for better embedding quality."""
    text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
    text = re.sub(r'\n+', ' ', text).strip()
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def chunk_text(pdf_path: Path) -> List[Dict[str, Any]]:
    """Extracts and chunks text from a PDF, splitting by paragraph."""
    chunks: List[Dict[str, Any]] = []
    try:
        doc = fitz.open(pdf_path)
        for page_num, page in enumerate(doc, start=1):
            text = page.get_text()
            
            cleaned_text = preprocess_text(text)
            
            paragraphs = [p.strip() for p in cleaned_text.split('.') if p.strip()]

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

# In model.py

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

    chroma_db_path = str(task_path / "chroma")
    client = PersistentClient(path=chroma_db_path)
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

    # Batching logic starts here
    batch_size = 5000  # A safe batch size, slightly below the max limit
    num_batches = (len(all_chunks) + batch_size - 1) // batch_size
    
    print(f"Total chunks to embed: {len(all_chunks)}. Splitting into {num_batches} batches of size {batch_size}.")

    for i in range(num_batches):
        start_index = i * batch_size
        end_index = min((i + 1) * batch_size, len(all_chunks))
        
        batch_texts = texts[start_index:end_index]
        batch_metadatas = metadatas[start_index:end_index]
        
        # Embed the current batch
        embeddings = EMBEDDING_MODEL.encode(batch_texts, convert_to_tensor=False)
        try:
            embeddings_list = embeddings.tolist()
        except AttributeError:
            embeddings_list = embeddings

        batch_ids = [f"{task_name}_{meta['pdf_name']}_page_{meta['page_number']}_chunk_{j}" 
                     for j, meta in enumerate(batch_metadatas)]

        print(f"Adding batch {i+1}/{num_batches} with size {len(batch_texts)}...")
        
        # Add the batch to the collection
        collection.add(
            embeddings=embeddings_list,
            documents=batch_texts,
            metadatas=batch_metadatas,
            ids=batch_ids
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
        query_embeddings=query_embedding,
        n_results=5,
        include=["documents", "metadatas", "distances"]
    )
    
    if not results or not results.get('ids') or not results['ids'] or not results['ids'][0]:
        print("No results found for the given query.")
        return []

    recommendations: List[Dict[str, Any]] = []
    for i in range(len(results['ids'][0])):
        reason = (
            f"This section is semantically relevant to '{query_text}' based on embedding similarity."
        )
        recommendations.append({
            "pdf_name": results['metadatas'][0][i].get('pdf_name', 'N/A'),
            "section": results['documents'][0][i],
            "page_number": results['metadatas'][0][i].get('page_number', 'N/A'),
            "reason": reason
        })

    return recommendations
