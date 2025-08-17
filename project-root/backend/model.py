import os
import time
from pathlib import Path
from typing import List, Dict, Any
import re
import fitz
from sentence_transformers import SentenceTransformer, CrossEncoder
from chromadb import PersistentClient
from langchain.text_splitter import RecursiveCharacterTextSplitter

# Initialize the embedding model to load it once (force CPU usage)
# Using a more robust model for better semantic understanding
try:
    EMBEDDING_MODEL = SentenceTransformer('BAAI/bge-large-en-v1.5', device='cpu')
except Exception as e:
    print(f"Error loading SentenceTransformer model: {e}")
    EMBEDDING_MODEL = None

# Initialize the re-ranker model once for efficiency
try:
    RERANKER_MODEL = CrossEncoder('BAAI/bge-reranker-base', device='cpu')
except Exception as e:
    print(f"Error loading CrossEncoder model: {e}")
    RERANKER_MODEL = None

def preprocess_text(text: str) -> str:
    """Cleans and normalizes text for better embedding quality."""
    text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
    text = re.sub(r'\n+', ' ', text).strip()
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def chunk_text(pdf_path: Path) -> List[Dict[str, Any]]:
    """
    Extracts and chunks text from a PDF using a recursive text splitter
    to respect sentence and paragraph boundaries.
    """
    chunks: List[Dict[str, Any]] = []
    try:
        doc = fitz.open(pdf_path)
        for page_num, page in enumerate(doc, start=1):
            text = page.get_text()
            cleaned_text = preprocess_text(text)

            if not cleaned_text:
                continue

            # Use a robust text splitter to create meaningful chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=500,  # Max number of characters in a chunk
                chunk_overlap=50, # Overlap for context
                separators=["\n\n", "\n", " ", ""] # Hierarchical separators
            )

            split_chunks = text_splitter.split_text(cleaned_text)

            for chunk_content in split_chunks:
                chunks.append({
                    "text": chunk_content,
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

    # Get embeddings for the query
    query_embedding = EMBEDDING_MODEL.encode([query_text], convert_to_tensor=False)
    
    # Step 1: Initial Retrieval (gets more than needed)
    results = collection.query(
        query_embeddings=query_embedding.tolist(),
        n_results=20, # Retrieve a larger number of candidates for re-ranking
        include=["documents", "metadatas", "distances"]
    )
    
    if not results or not results.get('ids') or not results['ids'] or not results['ids'][0]:
        print("No results found for the given query.")
        return []

    # Step 2: Re-ranking
    # Prepare pairs of (query, document) for the re-ranker model
    pairs = [[query_text, doc] for doc in results['documents'][0]]
    scores = RERANKER_MODEL.predict(pairs)
    
    # Combine original data with re-ranked scores
    ranked_candidates = []
    for i in range(len(scores)):
        ranked_candidates.append({
            "score": scores[i],
            "pdf_name": results['metadatas'][0][i].get('pdf_name', 'N/A'),
            "section": results['documents'][0][i],
            "page_number": results['metadatas'][0][i].get('page_number', 'N/A')
        })
    
    # Sort candidates by the new re-ranked score in descending order
    ranked_candidates.sort(key=lambda x: x['score'], reverse=True)
    
    # Step 3: Select the top 5 most relevant recommendations
    final_recommendations = []
    for candidate in ranked_candidates[:5]:
        final_recommendations.append({
            "pdf_name": candidate['pdf_name'],
            "section": candidate['section'],
            "page_number": candidate['page_number'],
            "reason": f"This section was highly ranked by the re-ranker model for its relevance to the query."
        })

    return final_recommendations