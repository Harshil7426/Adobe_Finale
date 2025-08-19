# Finale Model – Retrieval-Augmented Generation (RAG) Pipeline

This project represents a **significant upgrade** from the initial Round 1B prototype, evolving from a one-off script into a **scalable, API-driven Retrieval-Augmented Generation (RAG) system**.  

The final model is designed to:  
- Process and index documents efficiently.  
- Retrieve relevant context with high semantic accuracy.  
- Generate **context-aware responses** such as insights, recommendations, and long-form outputs.  

---

## 📌 System Workflow  

The pipeline operates in **two phases**:  

### **1. Preparation (Offline Indexing)**  
When users upload PDFs, the system processes them in the background.  

**Steps involved:**  
1. Extract text from PDFs using **PyMuPDF (fitz)**.  
2. Preprocess and chunk text into paragraphs.  
3. Convert each chunk into dense vector embeddings via **SentenceTransformers**.  
4. Store embeddings persistently in **ChromaDB** for future retrieval.  

> This indexing is performed only once per document, ensuring efficient query processing.  

---

### **2. Retrieval & Generation (Online Querying)**  
When a user submits a query:  
1. The query is converted into a semantic embedding.  
2. A vector similarity search is performed against **ChromaDB**.  
3. Top-k relevant chunks are retrieved.  
4. Retrieved context + query are passed to **Gemini (LLM)**.  
5. Gemini generates responses in the form of:  
   - Insights & curated recommendations  
   - Explanations & summaries  
   - Long-form outputs (e.g., **podcast scripts**)  

---

## 🧩 Tech Stack Used


The pipeline leverages **modern, high-performance libraries**:  

- **[FastAPI](https://fastapi.tiangolo.com/)** – Provides API endpoints (`/upload_task`, `/get_recommendations`, etc.) for UI–backend communication.  
- **[PyMuPDF (fitz)](https://pymupdf.readthedocs.io/)** – Extracts text from PDFs with high accuracy.  
- **[SentenceTransformers](https://www.sbert.net/)** – Converts text into semantic embeddings.  
- **[ChromaDB](https://www.trychroma.com/)** – Persistent vector database enabling fast semantic search.  
- **[Google Generative AI (Gemini)](https://ai.google/)** – Enhances retrieval with:  
  - Context-aware reasoning  
  - Insight generation  
  - Structured outputs  

---

## 🔄 Comparison: Round 1B vs Final Model  

| Feature            | Round 1B                          | Final Model                                    |
|--------------------|-----------------------------------|------------------------------------------------|
| **Execution Mode** | One-off CLI script                | Scalable **API-driven service**                |
| **Storage**        | In-memory (discarded after run)   | Persistent embeddings with **ChromaDB**        |
| **Retrieval**      | TF-IDF, spaCy, cross-encoder      | Semantic vector search with embeddings         |
| **Output**         | Raw text retrieval                | Context-aware generative responses via Gemini  |

The final model transforms the system from a **basic search tool** into a **knowledge assistant**.  

---

## 📈 Efficiency & Accuracy  

- **Speed:** Embeddings created once → queries answered instantly.  
- **Accuracy:** Semantic search captures **context & meaning**, not just keywords.  
- **Batch Processing:** Handles large documents with safe batch sizes.  
- **Resource-Friendly:** Runs on CPU, ensuring accessibility in hackathon environments.  

---

## 🔮 Future Improvements  

1. **Hybrid Search** – Combine semantic + keyword search (better for numbers, names, technical terms).  
2. **Smarter Chunking** – Move from paragraph-based to **semantic/hierarchical chunking**.  
3. **User Feedback Loop** – Collect ratings to fine-tune embeddings and retrieval quality.  
4. **Performance Optimization** – Use smaller models for initial filtering + larger models for reranking.  
5. **Multi-Modal Support** – Extend pipeline to handle **images, tables, and audio transcripts**.  

---

## 📊 System Flowchart  
![flow](https://github.com/user-attachments/assets/ecec2340-dfec-4577-a5da-ca53d45cf57f)


