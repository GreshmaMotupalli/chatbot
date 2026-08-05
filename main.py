import os
import re
import numpy as np
import requests
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer
from pdfminer.high_level import extract_text

# ==========================================
# 1️⃣ Initialize FastAPI
# ==========================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 2️⃣ MongoDB Setup
# ==========================================
client = MongoClient("mongodb://localhost:27017")
db = client["rag_db"]
documents_collection = db["documents"]
history_collection = db["history"]

# ==========================================
# 3️⃣ Embedding Model (Normalized)
# ==========================================
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

# ==========================================
# 4️⃣ Ollama Config
# ==========================================
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "deepseek-r1:1.5b"

# ==========================================
# 5️⃣ Models
# ==========================================
class QueryInput(BaseModel):
    question: str

# ==========================================
# 6️⃣ Utility Functions
# ==========================================
def normalize_doc_name(name: str) -> str:
    return " ".join(name.strip().lower().split())

def chunk_text(text, chunk_size=400, overlap=100):
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
    return chunks

# ==========================================
# 7️⃣ API ROUTES
# ==========================================

# ✅ Check Document
@app.get("/check_document/{doc_name}")
def check_document(doc_name: str):
    norm = normalize_doc_name(doc_name)
    exists = documents_collection.find_one({"doc_name_normalized": norm})
    return {"exists": bool(exists)}

# ✅ Get All Documents
@app.get("/get_documents")
def get_documents():
    docs = documents_collection.distinct("doc_name")
    return {"documents": docs}

# ✅ Add Document
@app.post("/add_document")
async def add_document(
    file: UploadFile = File(...),
    doc_name: str = '',
    overwrite: bool = False
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files allowed")

    if not doc_name.strip():
        doc_name = os.path.splitext(file.filename)[0].strip()

    norm_name = normalize_doc_name(doc_name)
    existing = documents_collection.find_one({"doc_name_normalized": norm_name})

    if existing and not overwrite:
        raise HTTPException(
            status_code=409,
            detail="Document exists. Enable overwrite to replace."
        )

    if existing and overwrite:
        documents_collection.delete_many({"doc_name_normalized": norm_name})
        history_collection.delete_many({"source_normalized": norm_name})

    pdf_text = extract_text(file.file)

    if not pdf_text.strip():
        raise HTTPException(status_code=400, detail="No text found in PDF")

    chunks = chunk_text(pdf_text)

    for chunk in chunks:
        if chunk.strip():
            embedding = embedding_model.encode(
                chunk,
                normalize_embeddings=True
            ).tolist()

            documents_collection.insert_one({
                "doc_name": doc_name.strip(),
                "doc_name_normalized": norm_name,
                "content": chunk,
                "embedding": embedding
            })

    return {"message": "Document stored successfully"}

# ✅ Delete Document
@app.delete("/delete_document/{doc_name}")
async def delete_document(doc_name: str):
    norm = normalize_doc_name(doc_name)
    result = documents_collection.delete_many({"doc_name_normalized": norm})
    history_collection.delete_many({"source_normalized": norm})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    return {"message": "Document deleted successfully"}

# ==========================================
# 🔥 IMPROVED ASK ENDPOINT
# ==========================================
@app.post("/ask")
def ask_question(query: QueryInput):

    docs = list(documents_collection.find())

    if not docs:
        raise HTTPException(status_code=400, detail="No documents available")

    # Embed question (normalized)
    question_embedding = embedding_model.encode(
        query.question,
        normalize_embeddings=True
    )

    # Compute similarity scores
    scores = []

    for doc in docs:
        if "embedding" not in doc:
            continue

        doc_embedding = np.array(doc["embedding"])
        similarity = float(np.dot(question_embedding, doc_embedding))
        scores.append((similarity, doc))

    if not scores:
        raise HTTPException(status_code=400, detail="No valid embedded documents")

    # Sort by similarity
    scores.sort(key=lambda x: x[0], reverse=True)

    TOP_K = 3
    top_docs = scores[:TOP_K]
    best_score = top_docs[0][0]

    # Threshold check
    if best_score < 0.35:
        return {
            "answer": "The information is not available in the document.",
            "snippet": "N/A",
            "mode": "document-based",
            "similarity_score": float(best_score)
        }

    # Combine context — dedupe overlapping chunks so the same
    # sentences aren't repeated when adjacent chunks both score high
    seen = set()
    unique_chunks = []
    for _, doc in top_docs:
        content = doc["content"]
        if content in seen:
            continue
        seen.add(content)
        unique_chunks.append(content)

    context = "\n\n".join(unique_chunks)

    prompt = f"""
You are a strict document-based question answering system.

Instructions:
1. Answer ONLY using the context.
2. If answer exists, copy exact sentence from context.
3. Do not modify.
4. If not found, say exactly:
"The information is not available in the document."

Context:
{context}

Question:
{query.question}

Answer:
"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1}
            }
        )

        result = response.json()
        raw_answer = result.get("response", "").strip()

        # DeepSeek-R1 wraps internal reasoning in <think>...</think> —
        # strip it so only the final answer remains
        answer = re.sub(r"<think>.*?</think>", "", raw_answer, flags=re.DOTALL).strip()

        if not answer:
            answer = raw_answer.strip()  # fallback if the whole response was reasoning

        print("RAW OLLAMA RESPONSE:", raw_answer)  # temporary debug line

    except Exception as e:
        print("Ollama Error:", e)
        answer = "Model error. Check if Ollama is running."

    snippet = context[:500]

    # Store history
    history_collection.insert_one({
        "question": query.question,
        "answer": answer,
        "source": top_docs[0][1]["doc_name"],
        "source_normalized": top_docs[0][1].get(
            "doc_name_normalized",
            normalize_doc_name(top_docs[0][1]["doc_name"])
        ),
        "snippet": snippet
    })

    return {
        "answer": answer,
        "snippet": snippet,
        "mode": "document-based",
        "similarity_score": float(best_score)
    }

# ==========================================
# Get History
# ==========================================
@app.get("/history")
def get_history():
    history = list(history_collection.find())
    for entry in history:
        entry["_id"] = str(entry["_id"])
    return {"history": history}

# ==========================================
# Get Full Document
# ==========================================
@app.get("/get_document_chunks/{doc_name}")
async def get_document_chunks(doc_name: str):
    norm = normalize_doc_name(doc_name)
    chunks = list(documents_collection.find({"doc_name_normalized": norm}))

    if not chunks:
        raise HTTPException(status_code=404, detail="Document not found")

    full_content = "\n\n".join([c["content"] for c in chunks])
    return {"content": full_content}
