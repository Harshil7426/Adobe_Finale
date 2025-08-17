import React, { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaFilePdf, FaChevronDown } from "react-icons/fa";
import "./Pdfviewer.css"
const ADOBE_EMBED_API_KEY = "3c812d3e7a214d06870ddcaeeb2add1a";

function PdfViewer({ freshPdf, bulkPdfs = [], onBack }) {
  const viewerRef = useRef(null);
  const apisRef = useRef(null);
  const [message, setMessage] = useState("PDF loaded. Select text to enable Generate.");
  const [selectedText, setSelectedText] = useState(""); // internal only
  const [generatedText, setGeneratedText] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false); // new
  const pollingRef = useRef(null);

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

            // Polling to get selected text (hidden)
            pollingRef.current = setInterval(async () => {
              try {
                const result = await apis.getSelectedContent();
                const text = result?.data || "";
                setSelectedText(text); // save internally
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

  const handleOptionClick = (type) => {
    if (!selectedText) {
      setMessage("Please select some text first.");
      return;
    }
    setGeneratedText(`${type} generated for your selection`);
    setMessage(`Generated: ${type}`);
    setDropdownOpen(false);
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

        {/* Generate Dropdown */}
        <div className="generate-dropdown-wrapper">
          <button
            className={`generate-btn ${!selectedText ? "disabled" : ""}`}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={!selectedText}
          >
            Generate <FaChevronDown size={12} />
          </button>

          {dropdownOpen && (
            <div className="dropdown-menu">
              <div onClick={() => handleOptionClick("Recommendation")}>Recommendation</div>
              <div onClick={() => handleOptionClick("Insights")}>Insights</div>
              <div onClick={() => handleOptionClick("Podcast")}>Podcast</div>
            </div>
          )}
        </div>

        <div className="message-box">{message}</div>
      </div>

      {/* Center Viewer */}
      <div className="center-viewer">
        <div ref={viewerRef} id="adobe-dc-view" className="viewer-box"></div>
      </div>

      {/* Right Panel */}
      <div className="right-panel">
        {generatedText && <p className="generated-output">{generatedText}</p>}
      </div>
    </div>
  );
}

export default PdfViewer;
