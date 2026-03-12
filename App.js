import React, { useState, useEffect } from "react";
import axios from "axios";
import "./styles.css";

function App() {
  const [docName, setDocName] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [snippet, setSnippet] = useState("");
  const [documentContent, setDocumentContent] = useState("");
  const [history, setHistory] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDocToDelete, setSelectedDocToDelete] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  // ================= Fetch Documents =================
  const fetchDocumentsList = async () => {
    try {
      const response = await axios.get("http://127.0.0.1:8000/get_documents");
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  // ================= Fetch History =================
  const fetchHistory = async () => {
    try {
      const response = await axios.get("http://127.0.0.1:8000/history");
      setHistory(response.data.history || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  // ================= Add Document =================
  const addDocument = async () => {
    try {
      if (!docName.trim() || !pdfFile) {
        alert("Please provide document name and PDF file.");
        return;
      }

      const checkResponse = await axios.get(
        `http://127.0.0.1:8000/check_document/${docName.trim()}`
      );

      const exists = checkResponse.data.exists;

      if (exists && !overwrite) {
        alert("Document already exists. Please check overwrite.");
        return;
      }

      const formData = new FormData();
      formData.append("doc_name", docName.trim());
      formData.append("file", pdfFile);

      await axios.post(
        `http://127.0.0.1:8000/add_document?overwrite=${overwrite}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      alert("Document stored successfully!");
      setOverwrite(false);
      fetchDocumentsList();
      fetchHistory();
    } catch (error) {
      console.error("Error storing document:", error);
      alert(error.response?.data?.detail || "Error storing document.");
    }
  };

  // ================= Delete Document =================
  const deleteDocument = async () => {
    try {
      await axios.delete(
        `http://127.0.0.1:8000/delete_document/${selectedDocToDelete}`
      );
      alert("Document deleted success!");
      fetchDocumentsList();
      setSelectedDocToDelete("");
    } catch (error) {
      console.error("Error deleting document:", error);
    }
  };

  // ================= Ask Question =================
  const askQuestion = async () => {
    try {
      const response = await axios.post("http://127.0.0.1:8000/ask", {
        question: question,
      });
      setAnswer(response.data.answer);
      setSnippet(response.data.snippet);
    } catch (error) {
      console.error("Error asking question:", error);
    }
  };

  // ================= Fetch Document =================
  const fetchDocument = async () => {
    try {
      const response = await axios.get(
        `http://127.0.0.1:8000/get_document_chunks/${docName.trim()}`
      );
      setDocumentContent(response.data.content || "Document not found.");
    } catch (error) {
      setDocumentContent("Error fetching document.");
    }
  };

  useEffect(() => {
    fetchDocumentsList();
  }, []);

  return (
    <div className="app-container">
      <div className="content-container">

        {/* ================= HISTORY ================= */}
        <div className="history-container">
          <h3 className="section-title">History</h3>
          <button onClick={fetchHistory} className="button">
            Fetch History
          </button>

          <div className="history-list">
            {history.length > 0 ? (
              history.map((item, index) => (
                <div key={index} className="history-item">
                  <div><strong>Question:</strong> {item.question}</div>
                  <hr />
                  <div><strong>Answer:</strong> {item.answer}</div>
                  <div><strong>Snippet:</strong> {item.snippet}</div>
                </div>
              ))
            ) : (
              <div>No history available.</div>
            )}
          </div>
        </div>

        {/* ================= FORM ================= */}
        <div className="form-container">

          {/* ---- ADD + DELETE SIDE BY SIDE ---- */}
          <div style={{ display: "flex", gap: "20px" }}>

            {/* ADD DOCUMENT */}
            <div style={{ flex: 1 }}>
              <h2 className="section-title">Add Document</h2>

              <input
                type="text"
                placeholder="Document Name"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="input"
              />

              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setPdfFile(e.target.files[0])}
                className="input"
              />

              {/* ✅ Overwrite checkbox with case-insensitive & trimmed check */}
              {documents.some(
                (doc) => doc.trim().toLowerCase() === docName.trim().toLowerCase()
              ) && (
                <label>
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={() => setOverwrite(!overwrite)}
                  />
                  Overwrite existing document?
                </label>
              )}

              <br />

              <button onClick={addDocument} className="button">
                Store Document
              </button>
            </div>

            {/* DELETE DOCUMENT */}
            <div style={{ flex: 1 }}>
              <h2 className="section-title">Delete Document</h2>

              <select
                value={selectedDocToDelete}
                onChange={(e) => setSelectedDocToDelete(e.target.value)}
                className="input"
              >
                <option value="">Select Document</option>
                {documents.map((doc, index) => (
                  <option key={index} value={doc}>
                    {doc}
                  </option>
                ))}
              </select>

              <button
                onClick={deleteDocument}
                className="button delete-button"
                disabled={!selectedDocToDelete}
              >
                Delete
              </button>
            </div>

          </div>

          <hr />

          {/* ================= ASK ================= */}
          <h2 className="section-title">Ask Question</h2>

          <input
            type="text"
            placeholder="Ask something..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="input"
          />

          <button onClick={askQuestion} className="button">
            Ask
          </button>

          {answer && (
            <div className="response">
              <h3>Answer:</h3>
              <p>{answer}</p>
              <h4>Snippet:</h4>
              <p>{snippet}</p>
            </div>
          )}

          <hr />

          {/* ================= FETCH ================= */}
          <h2 className="section-title">Fetch Document</h2>
          <button onClick={fetchDocument} className="button">
            Fetch Document
          </button>

          {documentContent && (
            <div className="document-content">
              <h3>Document Content:</h3>
              <div className="doc-text">
               {documentContent}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;