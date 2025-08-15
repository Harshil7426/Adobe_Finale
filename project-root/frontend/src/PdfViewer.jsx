import React, { useState, useEffect, useRef } from "react";
import { FaChevronLeft, FaFilePdf } from "react-icons/fa";

const ADOBE_EMBED_API_KEY = "3c812d3e7a214d06870ddcaeeb2add1a";

function PdfViewer({ freshPdf, bulkPdfs = [], onBack }) {
  const viewerRef = useRef(null);

  useEffect(() => {
    const initAdobeView = () => {
      if (viewerRef.current) {
        const adobeDCView = new window.AdobeDC.View({
          clientId: ADOBE_EMBED_API_KEY,
          divId: "adobe-dc-view",
        });

        adobeDCView.previewFile(
          {
            content: { location: { url: freshPdf.url } },
            metaData: { fileName: freshPdf.name },
          },
          { embedMode: "FULL_WINDOW" }
        );
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

  return (
    <div className="pdf-page-container">
      {/* Left sidebar */}
      <div className="sidebar">
        <button onClick={onBack} className="back-btn">
          <FaChevronLeft size={16} /> Back
        </button>
        <div className="bulk-pdf-list">
          <h3 className="list-title">Bulk PDFs</h3>
          {bulkPdfs.map((pdf, idx) => (
            <div key={idx} className="bulk-pdf-item">
              <FaFilePdf size={16} />
              <span>{pdf.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Center PDF viewer */}
      <div className="center-viewer">
        <div id="adobe-dc-view" ref={viewerRef} className="viewer-box"></div>
      </div>

      {/* Right panel */}
      <div className="right-panel">
        <button className="generate-btn">Generate</button>
      </div>
    </div>
  );
}

export default PdfViewer;
