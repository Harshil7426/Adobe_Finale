import React, { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaFilePdf } from "react-icons/fa";

const ADOBE_EMBED_API_KEY = "3c812d3e7a214d06870ddcaeeb2add1a";

function PdfViewer({ freshPdf, bulkPdfs = [], onBack }) {
  const viewerRef = useRef(null);
  const apisRef = useRef(null);
  const [message, setMessage] = useState("Please select text in the PDF.");
  const [selectedText, setSelectedText] = useState("");
  const [generatedText, setGeneratedText] = useState("");

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
            setMessage("PDF loaded. Select text to see it appear here.");

            // ✅ Subscribe to text selection event
            adobeViewer.registerCallback(
              window.AdobeDC.View.Enum.CallbackType.TEXT_SELECTED,
              function (eventData) {
                const text = eventData?.data?.text || "";
                setSelectedText(text);
              },
              {}
            );
          });
        });
      }
    };

    if (window.AdobeDC) {
      initAdobeView();
    } else {
      const script = document.createElement("script");
      script.src = "https://documentcloud.adobe.com/view-sdk/main.js";
      script.async = true;
      document.body.appendChild(script);
      script.onload = initAdobeView;

      return () => {
        document.body.removeChild(script);
      };
    }
  }, [freshPdf]);

  const handleGenerate = () => {
    if (selectedText) {
      console.log("Generating with the text:", selectedText);
      setMessage(`Generating with the text: "${selectedText}"`);
      setGeneratedText(selectedText);
    } else {
      setMessage("Please select some text first.");
      setGeneratedText("");
    }
  };

  return (
    <div className="pdf-viewer-page">
      {/* Sidebar */}
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

        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={!selectedText}
        >
          Generate
        </button>

        <div className="selected-text-display">
          {generatedText && (
            <>
              <p>
                Generated Text: <strong>{generatedText}</strong>
              </p>
              <p className="selected-text-p">
                Selected Text: <strong>{selectedText}</strong>
              </p>
            </>
          )}
          {!generatedText && selectedText && (
            <p className="selected-text-p">
              Selected Text: <strong>{selectedText}</strong>
            </p>
          )}
          {!selectedText && <p>{message}</p>}
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="viewer-container">
        <div id="adobe-dc-view" ref={viewerRef} className="viewer-box"></div>
      </div>
    </div>
  );
}

export default PdfViewer;
