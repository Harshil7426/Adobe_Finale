# Adobe_Finale: Document Intelligence Hub  
by Team **Byte Me**  

---

## 📖 Project Overview  
*Adobe_Finale* is a full-stack web application built to transform how professionals interact with and analyze documents.  
It enables users to compare a *“fresh” PDF* against a collection of *“bulk” PDFs, using **semantic search* and *generative AI* to:  

- Discover relevant references.  
- Extract insights and hidden facts.  
- Automatically generate a *podcast script* summarizing findings.  

The platform provides a *professional-grade UI* and *intelligent document workflow* designed for researchers, analysts, and enterprises.  

---

## ✨ Key Features  
- *📑 Dual-Panel PDF Viewer* – Compare a fresh PDF with cross-referenced bulk documents.  
- *🔍 Semantic Search* – Powered by *ChromaDB* + *Sentence-Transformers* for contextual retrieval.  
- *🤖 Generative AI Integration* – Using *Google Gemini* to:  
  - Refine search results with one-line relevance reasons.  
  - Generate insights like “Did you know?” facts.  
  - Create a polished *Podcast Script* from findings.  
- *🎨 Dynamic UI/UX* – Responsive, animated, with a *document sidebar* and *content panel*.  
- *🗣️ Optional TTS Support* – Integrate *Azure Speech* for listening to generated podcasts.  

---

## 🛠️ Technical Stack  

### Frontend  
- *React.js* – Component-based UI  
- *Vite* – Lightning-fast dev and build tool  
- *Adobe PDF Embed API* – Smooth PDF rendering and interaction  
- *Framer Motion* – Animations & transitions  
- *React Scroll & React Icons* – Enhanced UI/UX  
- *CSS Modules* – Scoped, maintainable styling  

### Backend  
- *FastAPI* – Python-based, high-performance API framework  
- *Uvicorn* – ASGI server for FastAPI  
- *Pydantic* – Strict data validation  
- *Google Gemini API* – LLM for recommendations, insights, and scripts  
- *ChromaDB* – Vector database for semantic search  
- *Sentence-Transformers* – Embeddings for contextual search  
- *PyMuPDF* – High-speed PDF text extraction  

---

## 🚀 Getting Started  

### ✅ Prerequisites  
- *Python 3.10+*  
- *Node.js 18+*  
- *pip* & *npm* package managers  
- *Google Gemini API Key* (AI Studio) OR *Google Cloud Credentials*  

---
