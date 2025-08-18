import React, { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaFilePdf } from "react-icons/fa";
import "./Pdfviewer.css";

const ADOBE_EMBED_API_KEY = "3c812d3e7a214d06870ddcaeeb2add1a";
const TRUNCATE_LIMIT = 22; // Set a character limit for truncation

// Helper function to truncate text
const truncateText = (text, limit) => {
  if (text.length <= limit) {
    return text;
  }
  return text.substring(0, limit) + "...";
};

function PdfViewer({ freshPdf, bulkPdfs = [], onBack, taskName }) {
  const viewerRef = useRef(null);
  const apisRef = useRef(null);
  const [message, setMessage] = useState("PDF loaded. Select text to enable Generate.");
  const [selectedText, setSelectedText] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [insights, setInsights] = useState(null);
  const [podcast, setPodcast] = useState(null);
  const pollingRef = useRef(null);

  // New state to manage the content and position of the hover element
  const [hoverContent, setHoverContent] = useState(null);

  // State for the recommended PDF viewer instance
  const [recommendedPdfViewerUrl, setRecommendedPdfViewerUrl] = useState(null);
  const recommendedViewerRef = useRef(null);

  console.log("Current taskName:", taskName);

  useEffect(() => {
    if (window.AdobeDC) {
      const mainAdobeDCView = new window.AdobeDC.View({
        clientId: ADOBE_EMBED_API_KEY,
        divId: "adobe-dc-view-main",
      });

      mainAdobeDCView.previewFile(
        {
          content: { location: { url: freshPdf.url } },
          metaData: { fileName: freshPdf.name },
        },
        {
          embedMode: "FULL_WINDOW", // Use SIZED_CONTAINER to fit in the grid
          showAnnotationTools: true,
          showLeftHandPanel: true,
          showDownloadPDF: true,
          showPrintPDF: true,
          showZoomControl: true,
        }
      ).then((adobeViewer) => {
        adobeViewer.getAPIs().then((apis) => {
          apisRef.current = apis;
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }
          pollingRef.current = setInterval(async () => {
            try {
              const result = await apis.getSelectedContent();
              const text = result?.data || "";
              setSelectedText(text);
            } catch (err) {
              console.error("Polling error:", err);
            }
          }, 500);
        });
      });
    } else {
      const script = document.createElement("script");
      script.src = "https://documentcloud.adobe.com/view-sdk/main.js";
      script.async = true;
      document.body.appendChild(script);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [freshPdf]);

  // Initialize the recommended PDF viewer
  useEffect(() => {
    if (window.AdobeDC && recommendedPdfViewerUrl) {
      const recommendedAdobeDCView = new window.AdobeDC.View({
        clientId: ADOBE_EMBED_API_KEY,
        divId: "adobe-dc-view-rec",
      });

      recommendedAdobeDCView.previewFile(
        {
          content: { location: { url: recommendedPdfViewerUrl.url } },
          metaData: { fileName: recommendedPdfViewerUrl.name },
        },
        {
          embedMode: "SIZED_CONTAINER", // Use SIZED_CONTAINER for a smaller viewer
          showAnnotationTools: false,
          showLeftHandPanel: false,
          showDownloadPDF: false,
          showPrintPDF: false,
          showZoomControl: true,
          showRightHandPanel: false,
        }
      ).then((adobeViewer) => {
        adobeViewer.getEventBus().then((eventBus) => {
          eventBus.on(window.AdobeDC.View.Enum.events.DOCUMENT_OPENED, () => {
            console.log("Recommended PDF loaded, navigating to page:", recommendedPdfViewerUrl.pageNumber);
            adobeViewer.getAPIs().then((apis) => {
              if (recommendedPdfViewerUrl.pageNumber) {
                apis.gotoLocation(
                  { pageNumber: recommendedPdfViewerUrl.pageNumber },
                  { zoom: 200 }
                );
              }
            });
          });
        });
      });
    }
  }, [recommendedPdfViewerUrl]);
  const handleGenerate = async () => {
    if (!selectedText || !taskName) {
      setMessage("Please select some text and ensure a task is loaded.");
      return;
    }

    try {
      setMessage("Generating recommendations...");
      const payload = {
        task_name: taskName,
        query_text: selectedText,
      };

      // Step 1: Get Recommendations
      const recResponse = await fetch("http://127.0.0.1:8000/get_recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!recResponse.ok) {
        throw new Error("Failed to fetch recommendations");
      }
      const recData = await recResponse.json();
      const recommendations = recData.recommendations;
      setRecommendations(recommendations);
      setMessage("Recommendations generated. Now creating insights and podcast script...");

      // Step 2: Get Insights
      const insightPayload = { query_text: selectedText, recommendations: recommendations };
      const insightResponse = await fetch("http://127.0.0.1:8000/get_insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(insightPayload),
      });

      if (!insightResponse.ok) {
        throw new Error("Failed to fetch insights");
      }
      const insightData = await insightResponse.json();
      setInsights(insightData.insights);

      // Step 3: Get Podcast Script - pass the generated insights
      const podcastPayload = {
        query_text: selectedText,
        recommendations: recommendations,
        insights: insightData.insights
      };

      const podcastResponse = await fetch("http://127.0.0.1:8000/get_podcast_script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(podcastPayload),
      });

      if (!podcastResponse.ok) {
        throw new Error("Failed to fetch podcast script");
      }
      const podcastData = await podcastResponse.json();
      setPodcast(podcastData.script);

      setMessage("All content generated successfully.");

    } catch (err) {
      console.error("Error generating content:", err);
      setMessage("Error generating content.");
    }
  };

  // Handler to open a recommended PDF
  const handleOpenRecommendation = (pdfName, pageNumber) => {
    // Correctly construct the URL for the recommended PDF
    const recommendedUrl = `http://127.0.0.1:8000/pdfs/${taskName}/${encodeURIComponent(pdfName)}`;

    // Update the state to load the new PDF in the secondary viewer
    setRecommendedPdfViewerUrl({ url: recommendedUrl, name: pdfName, pageNumber });
  };

  // New handler for bulk PDF list clicks
  const handleBulkPdfClick = (pdfName) => {
    const bulkUrl = `http://127.0.0.1:8000/pdfs/${taskName}/${encodeURIComponent(pdfName)}`;
    setRecommendedPdfViewerUrl({ url: bulkUrl, name: pdfName, pageNumber: 1 });
  };


  // New state to manage active tab
  const [activeView, setActiveView] = useState("recommendation");

  // Hover event handler functions
  const handleMouseEnter = (content, event) => {
    setHoverContent({
      text: content,
      x: event.clientX + 15,
      y: event.clientY + 15,
    });
  };

  const handleMouseLeave = () => {
    setHoverContent(null);
  };

  const renderContent = () => {
    switch (activeView) {
      case "recommendation":
        return recommendations.length > 0 ? (
          recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="recommendation-card"
              onClick={() => handleOpenRecommendation(rec.pdf_name, rec.page_number)}
            >
              <h4>
                <span
                  onMouseEnter={(e) => handleMouseEnter(rec.pdf_name, e)}
                  onMouseLeave={handleMouseLeave}
                >
                  {truncateText(rec.pdf_name, TRUNCATE_LIMIT)}
                </span>{" "}
                (Page {rec.page_number})
              </h4>
              <p>
                <strong>Section:</strong>{" "}
                <span
                  onMouseEnter={(e) => handleMouseEnter(rec.section, e)}
                  onMouseLeave={handleMouseLeave}
                >
                  {truncateText(rec.section, TRUNCATE_LIMIT)}
                </span>
              </p>
              <p>
                <strong>Reason:</strong>{" "}
                <span
                  onMouseEnter={(e) => handleMouseEnter(rec.reason, e)}
                  onMouseLeave={handleMouseLeave}
                >
                  {truncateText(rec.reason, TRUNCATE_LIMIT)}
                </span>
              </p>
            </div>
          ))
        ) : (
          <p className="generated-output">No recommendations yet.</p>
        );
      case "insight":
        return insights ? (
          <div className="insight-content">
            {insights.facts && (
              <div className="facts-section">
                <h3>Facts</h3>
                <ul>
                  {insights.facts.map((fact, index) => (
                    <li key={index}>{fact}</li>
                  ))}
                </ul>
              </div>
            )}
            {insights.didYouKnows && (
              <div className="did-you-know-section">
                <h3>Did You Know?</h3>
                <ul>
                  {insights.didYouKnows.map((dyk, index) => (
                    <li key={index}>{dyk}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="generated-output">No insights generated yet.</p>
        );
      case "podcast":
        return podcast ? (
          <div className="podcast-content">
            <h3>Podcast Script</h3>
            <p className="podcast-script">{podcast}</p>
          </div>
        ) : (
          <p className="generated-output">No podcast script generated yet.</p>
        );
      default:
        return null;
    }
  };

  return (
    <div className="pdf-page-container">
      {/* Left Sidebar */}
      <div className="sidebar">
        <button onClick={onBack} className="back-btn">
          <FaChevronLeft size={16} /> <strong>{taskName}</strong>
        </button>

        {/* New heading for the bulk PDF list */}
        <div className="rec">
          <h3 className="sidebar-heading">Recommendation Hub</h3>
          <div className="bulk-pdf-list">
            {bulkPdfs.map((pdf, idx) => (
              <div
                key={idx}
                className="bulk-pdf-item"
                onMouseEnter={(e) => handleMouseEnter(pdf.name, e)}
                onMouseLeave={handleMouseLeave}
                onClick={() => handleBulkPdfClick(pdf.name)}
              >
                <FaFilePdf size={16} />
                <span>{truncateText(pdf.name, TRUNCATE_LIMIT)}</span>
              </div>
            ))}
          </div>
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
        {selectedText && (
          <div className="selected-text-box">
            <h4>Selected Text:</h4>
            <p>{selectedText}</p>
          </div>
        )}
      </div>

      {/* Center Viewer (Main PDF) */}
      <div className="center-viewer">
        <div ref={viewerRef} id="adobe-dc-view-main" className="viewer-box"></div>
      </div>

      {/* Right Panel */}
      <div className="right-panel">
        <div className="follow-on">
          <div className="tabs-container">
            <button
              className={`tab ${activeView === 'recommendation' ? 'active' : ''}`}
              onClick={() => setActiveView('recommendation')}
            >
              Recommendation
            </button>
            <button
              className={`tab ${activeView === 'insight' ? 'active' : ''}`}
              onClick={() => setActiveView('insight')}
            >
              Insight
            </button>
            <button
              className={`tab ${activeView === 'podcast' ? 'active' : ''}`}
              onClick={() => setActiveView('podcast')}
            >
              Podcast
            </button>
          </div>

          <div className="content-container">
            {renderContent()}
          </div>
        </div>

        {/* Recommended PDF Viewer */}
        {recommendedPdfViewerUrl && (
          <div ref={recommendedViewerRef} id="adobe-dc-view-rec" className="viewer-box-rec"></div>
        )}
      </div>

      {/* The new hover element */}
      {hoverContent && (
        <div
          className="hover-box"
          style={{ top: hoverContent.y, left: hoverContent.x }}
        >
          {hoverContent.text}
        </div>
      )}
    </div>
  );
}

export default PdfViewer;