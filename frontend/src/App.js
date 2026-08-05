import React, { useState, useEffect } from "react";
import axios from "axios";
import "./styles.css";

const TABS = [
  { key: "add", label: "Add Document" },
  { key: "delete", label: "Delete Document" },
  { key: "fetch", label: "Fetch Document" },
  { key: "ask", label: "Ask Question" },
];

function App() {
  const [activeTab, setActiveTab] = useState("ask");

  // Add Document
  const [docName, setDocName] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [overwrite, setOverwrite] = useState(false);

  // Fetch Document (own independent field, not tied to Add Document)
  const [fetchDocName, setFetchDocName] = useState("");
  const [documentContent, setDocumentContent] = useState("");

  // Ask Question — a running list so multiple Q&As can stack up
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState([]);
  const [activeHistoryId, setActiveHistoryId] = useState(null);

  // Shared / lists
  const [history, setHistory] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDocToDelete, setSelectedDocToDelete] = useState("");

  // ================= Loading states =================
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [loadingFetchDoc, setLoadingFetchDoc] = useState(false);

  // ================= Fetch Documents (dropdown list) =================
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
    setLoadingHistory(true);
    try {
      const response = await axios.get("http://127.0.0.1:8000/history");
      setHistory(response.data.history || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // ================= Add Document =================
  const addDocument = async () => {
    if (!docName.trim() || !pdfFile) {
      alert("Please provide document name and PDF file.");
      return;
    }

    setLoadingAdd(true);
    try {
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
      setDocName("");
      setPdfFile(null);
      setOverwrite(false);
      fetchDocumentsList();
      fetchHistory();
    } catch (error) {
      console.error("Error storing document:", error);
      alert(error.response?.data?.detail || "Error storing document.");
    } finally {
      setLoadingAdd(false);
    }
  };

  // ================= Delete Document =================
  const deleteDocument = async () => {
    setLoadingDelete(true);
    try {
      await axios.delete(
        `http://127.0.0.1:8000/delete_document/${selectedDocToDelete}`
      );
      alert("Document deleted successfully!");
      fetchDocumentsList();
      setSelectedDocToDelete("");
    } catch (error) {
      console.error("Error deleting document:", error);
    } finally {
      setLoadingDelete(false);
    }
  };

  // ================= Ask Question =================
  const askQuestion = async () => {
    if (!question.trim()) return;

    const askedQuestion = question.trim();
    setQuestion("");
    setActiveHistoryId(null); // asking fresh means we're no longer "viewing" a past item
    setLoadingAsk(true);
    try {
      const response = await axios.post("http://127.0.0.1:8000/ask", {
        question: askedQuestion,
      });
      setConversation((prev) => [
        ...prev,
        {
          question: askedQuestion,
          answer: response.data.answer,
          snippet: response.data.snippet,
        },
      ]);
      fetchHistory();
    } catch (error) {
      console.error("Error asking question:", error);
      setConversation((prev) => [
        ...prev,
        {
          question: askedQuestion,
          answer: "Something went wrong while fetching the answer.",
          snippet: "",
        },
      ]);
    } finally {
      setLoadingAsk(false);
    }
  };

  // ================= Open a specific history item =================
  const openHistoryItem = (item) => {
    setActiveTab("ask");
    setActiveHistoryId(item._id || item.question);
    setConversation([
      {
        question: item.question,
        answer: item.answer,
        snippet: item.snippet,
      },
    ]);
  };

  // ================= Start a fresh conversation =================
  const startNewConversation = () => {
    setConversation([]);
    setActiveHistoryId(null);
    setQuestion("");
  };

  // ================= Fetch Document (uses its own field) =================
  const fetchDocument = async () => {
    if (!fetchDocName.trim()) {
      alert("Please enter a document name to fetch.");
      return;
    }

    setLoadingFetchDoc(true);
    try {
      const response = await axios.get(
        `http://127.0.0.1:8000/get_document_chunks/${fetchDocName.trim()}`
      );
      setDocumentContent(response.data.content || "Document not found.");
    } catch (error) {
      setDocumentContent("Error fetching document.");
    } finally {
      setLoadingFetchDoc(false);
    }
  };

  useEffect(() => {
    fetchDocumentsList();
  }, []);

  // Small reusable spinner
  const Spinner = () => <span className="spinner" />;

  return (
    <div className="app-shell">
      {/* ================= SIDEBAR (HISTORY) ================= */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>History</h2>
          <button
            onClick={fetchHistory}
            className="icon-button"
            disabled={loadingHistory}
            title="Refresh history"
          >
            {loadingHistory ? <Spinner /> : "⟳"}
          </button>
        </div>

        <div className="history-list">
          {loadingHistory ? (
            <div className="inline-status">
              <Spinner /> Loading history...
            </div>
          ) : history.length > 0 ? (
            history.map((item, index) => (
              <div
                key={item._id || index}
                className={`history-item ${
                  activeHistoryId === (item._id || item.question) ? "active" : ""
                }`}
                onClick={() => openHistoryItem(item)}
              >
                <div className="history-question">{item.question}</div>
                <div className="history-answer">{item.answer}</div>
              </div>
            ))
          ) : (
            <div className="muted">No history yet.</div>
          )}
        </div>
      </aside>

      {/* ================= MAIN CONTENT ================= */}
      <main className="main-content">
        <header className="app-header">
          <h1>Document Q&amp;A</h1>
        </header>

        {/* ================= TABS ================= */}
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="content-container">
          {/* ================= ADD DOCUMENT ================= */}
          {activeTab === "add" && (
            <section className="card add-document-card">
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

              {documents.some(
                (doc) => doc.trim().toLowerCase() === docName.trim().toLowerCase()
              ) && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={() => setOverwrite(!overwrite)}
                  />
                  Overwrite existing document?
                </label>
              )}

              <button onClick={addDocument} className="button" disabled={loadingAdd}>
                {loadingAdd ? <Spinner /> : "Store Document"}
              </button>
            </section>
          )}

          {/* ================= DELETE DOCUMENT ================= */}
          {activeTab === "delete" && (
            <section className="card">
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
                disabled={!selectedDocToDelete || loadingDelete}
              >
                {loadingDelete ? <Spinner /> : "Delete"}
              </button>
            </section>
          )}

          {/* ================= FETCH DOCUMENT ================= */}
          {activeTab === "fetch" && (
            <section className="card">
              <h2 className="section-title">Fetch Document</h2>

              <input
                type="text"
                placeholder="Document Name to fetch"
                value={fetchDocName}
                onChange={(e) => setFetchDocName(e.target.value)}
                className="input"
              />

              <button
                onClick={fetchDocument}
                className="button"
                disabled={loadingFetchDoc}
              >
                {loadingFetchDoc ? <Spinner /> : "Fetch Document"}
              </button>

              {loadingFetchDoc && (
                <div className="inline-status">
                  <Spinner /> Loading document...
                </div>
              )}

              {!loadingFetchDoc && documentContent && (
                <div className="document-content">
                  <h3>Document Content</h3>
                  <div className="doc-text">{documentContent}</div>
                </div>
              )}
            </section>
          )}

          {/* ================= ASK QUESTION ================= */}
          {activeTab === "ask" && (
            <section className="card">
              <div className="ask-header">
                <h2 className="section-title">Ask Question</h2>
                {conversation.length > 0 && (
                  <button className="link-button" onClick={startNewConversation}>
                    + New conversation
                  </button>
                )}
              </div>

              {conversation.length > 0 && (
                <div className="conversation-list">
                  {conversation.map((turn, index) => (
                    <div key={index} className="conversation-turn">
                      <div className="turn-question">Q: {turn.question}</div>
                      <div className="response">
                        <h3>Answer</h3>
                        <p>{turn.answer}</p>
                        {turn.snippet && (
                          <>
                            <h4>Snippet</h4>
                            <p>{turn.snippet}</p>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {loadingAsk && (
                <div className="inline-status">
                  <Spinner /> Fetching answer...
                </div>
              )}

              <div className="ask-row">
                <input
                  type="text"
                  placeholder="Ask something..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && askQuestion()}
                  className="input"
                />
                <button onClick={askQuestion} className="button" disabled={loadingAsk}>
                  {loadingAsk ? <Spinner /> : "Ask"}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
