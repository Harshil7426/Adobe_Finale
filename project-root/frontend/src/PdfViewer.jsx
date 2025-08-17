import React, { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaFilePdf } from "react-icons/fa";
import "./Pdfviewer.css";

const ADOBE_EMBED_API_KEY = "3c812d3e7a214d06870ddcaeeb2add1a";

function PdfViewer({ freshPdf, bulkPdfs = [], onBack, taskName }) {
  const viewerRef = useRef(null);
  const apisRef = useRef(null);
  const [message, setMessage] = useState("PDF loaded. Select text to enable Generate.");
  const [selectedText, setSelectedText] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const pollingRef = useRef(null);

  console.log("Current taskName:", taskName);

  useEffect(() => {
    const initAdobeView = () => {
      if (viewerRef.current) {
        const adobeDCView = new window.AdobeDC.View({
          clientId: ADOBE_EMBED_API_KEY,
          divId: "adobe-dc-view",
        });

        const previewFilePromise = adobeDCView.previewFile(
          {
            content: { location: { url: freshPdf.url } },
            metaData: { fileName: freshPdf.name },
          },
          {
            embedMode: "FULL_WINDOW",
            showAnnotationTools: true,
            showLeftHandPanel: true,
            showDownloadPDF: true,
            showPrintPDF: true,
            showZoomControl: true,
          }
        );

        previewFilePromise.then((adobeViewer) => {
          adobeViewer.getAPIs().then((apis) => {
            apisRef.current = apis;

            // Poll for selected text
            pollingRef.current = setInterval(async () => {
              try {
                const result = await apis.getSelectedContent();
                // ✅ Extract plain string only
                const text = Array.isArray(result?.data)
                  ? result.data[0]?.text
                  : "";
                setSelectedText(text || "");
              } catch (err) {
                console.error("Polling error:", err);
              }
            }, 500);
          });
        });
      }
    };

    if (window.AdobeDC) initAdobeView();
    else {
      const script = document.createElement("script");
      script.src = "https://documentcloud.adobe.com/view-sdk/main.js";
      script.async = true;
      document.body.appendChild(script);
      script.onload = initAdobeView;
      return () => document.body.removeChild(script);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [freshPdf]);

  const handleGenerate = async () => {
    if (!selectedText || !taskName) {
      setMessage("Please select some text and ensure a task is loaded.");
      return;
    }

    try {
      setMessage("Generating recommendations...");

      console.log("Sending request:", {
        task_name: taskName,
        query_text: selectedText,
      });

      const response = await fetch("http://127.0.0.1:8000/get_recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_name: taskName,
          query_text: selectedText,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch recommendations");
      }

      const data = await response.json();
      setRecommendations(data.recommendations);
      setMessage("Recommendations generated.");
    } catch (err) {
      console.error("Error generating recommendations:", err);
      setMessage("Error generating recommendations.");
    }
  };

  return (
    <div className="pdf-page-container">
      {/* Left Sidebar */}
      <div className="sidebar">
        <button onClick={onBack} className="back-btn">
          <FaChevronLeft size={16} /> Back
        </button>

        <div className="bulk-pdf-list">
          {bulkPdfs.map((pdf, idx) => (
            <div key={idx} className="bulk-pdf-item">
              <FaFilePdf size={16} />
              <span>{pdf.name}</span>
            </div>
          ))}
        </div>

        {/* Generate Button */}
        <div className="generate-wrapper">
          <button
            className={`generate-btn ${!selectedText ? "disabled" : ""}`}
            onClick={handleGenerate}
            disabled={!selectedText}
          >
            Generate
          </button>
        </div>

        <div className="message-box">{message}</div>
      </div>

      {/* Center Viewer */}
      <div className="center-viewer">
        <div ref={viewerRef} id="adobe-dc-view" className="viewer-box"></div>
      </div>

      {/* Right Panel */}
      <div className="right-panel">
        {selectedText && (
          <div className="selected-text-box">
            <h4>Selected Text:</h4>
            <p>{selectedText}</p>
          </div>
        )}

        {recommendations.length > 0 ? (
          recommendations.map((rec, idx) => (
            <div key={idx} className="recommendation-card">
              <h4>{rec.pdf_name} (Page {rec.page_number})</h4>
              <p>
                <strong>Section:</strong> {rec.section}
              </p>
              <p>
                <strong>Reason:</strong> {rec.reason}
              </p>
            </div>
          ))
        ) : (
          <p className="generated-output">No recommendations yet.</p>
        )}
      </div>
    </div>
  );
}

export default PdfViewer;
