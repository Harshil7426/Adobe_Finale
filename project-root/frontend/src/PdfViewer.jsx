import React, { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaFilePdf, FaMicrophone, FaPauseCircle, FaPlayCircle, FaSpinner } from "react-icons/fa";
import "./Pdfviewer.css";
import './Upload.css'; 
const ADOBE_EMBED_API_KEY = "3c812d3e7a214d06870ddcaeeb2add1a";
const TRUNCATE_LIMIT = 22;

const truncateText = (text, limit) => {
  if (text.length <= limit) {
    return text;
  }
  return text.substring(0, limit) + "...";
};

const base64ToArrayBuffer = (base64) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
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

  const [hoverContent, setHoverContent] = useState(null);

  const [recommendedPdfViewerUrl, setRecommendedPdfViewerUrl] = useState(null);
  const recommendedViewerRef = useRef(null);
  const recommendationContentRef = useRef(null);

  const [audioData, setAudioData] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [progress, setProgress] = useState(0);
  const animationFrameRef = useRef(null);
  const playbackStartTimeRef = useRef(0); // New ref to store the start time of playback
  const pausedTimeRef = useRef(0); // New ref to store the paused time

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
          embedMode: "FULL_WINDOW",
          showAnnotationTools: true,
          showLeftHandPanel: true,
          showDownloadPDF: true,
          showPrintPDF: true,
          showZoomControl: true,
          showRightHandPanel: false,
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
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [freshPdf]);

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
          embedMode: "SIZED_CONTAINER",
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

      const recResponse = await fetch("http://127.0.0.1:8000/get_recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!recResponse.ok) {
        throw new Error("Failed to fetch recommendations");
      }
      const recData = await recResponse.json();
      const recommendations = Array.isArray(recData.recommendations) ? recData.recommendations : [];
      setRecommendations(recommendations);
      setMessage("Recommendations generated. Now creating insights and podcast script...");

      const insightPayload = {
        query_text: selectedText,
        recommendations: recommendations,
        task_name: taskName
      };
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

      const podcastPayload = {
        query_text: selectedText,
        recommendations: recommendations,
        insights: insightData.insights,
        task_name: taskName
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

      setMessage("Generating podcast audio...");
      setIsLoadingAudio(true);
      if (isPlaying) {
        stopAudio();
      }

      const audioPayload = {
        script: podcastData.script,
        voice_name: "en-US-JennyNeural"
      };

      const audioResponse = await fetch("http://127.0.0.1:8000/generate_podcast_audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audioPayload),
      });

      if (!audioResponse.ok) {
        throw new Error("Failed to generate podcast audio");
      }
      const audioResult = await audioResponse.json();
      const audioBuffer = base64ToArrayBuffer(audioResult.audio_base64);
      setAudioData(audioBuffer);
      setMessage("Podcast audio generated successfully. Click the play button.");

    } catch (err) {
      console.error("Error generating content:", err);
      setMessage("Error generating content or audio. Please try again.");
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleOpenRecommendation = (pdfName, pageNumber, sectionContent) => {
    const recommendedUrl = `http://127.0.0.1:8000/pdfs/${taskName}/${encodeURIComponent(pdfName)}`;
    setRecommendedPdfViewerUrl({ url: recommendedUrl, name: pdfName, pageNumber });
  };

  const handleBulkPdfClick = (pdfName) => {
    const bulkUrl = `http://127.0.0.1:8000/pdfs/${taskName}/${encodeURIComponent(pdfName)}`;
    setRecommendedPdfViewerUrl({ url: bulkUrl, name: pdfName, pageNumber: 1 });
  };

  const scrollRecommendations = (direction) => {
    if (recommendationContentRef.current) {
      const scrollAmount = recommendationContentRef.current.offsetWidth * 0.8;
      recommendationContentRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  const [activeView, setActiveView] = useState("recommendation");

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

  const updateProgressBar = () => {
    if (sourceNodeRef.current && audioContextRef.current && sourceNodeRef.current.buffer) {
      const currentTime = audioContextRef.current.currentTime - playbackStartTimeRef.current + pausedTimeRef.current;
      const duration = sourceNodeRef.current.buffer.duration;
      if (duration > 0) {
        setProgress((currentTime / duration) * 100);
      }
    }
    animationFrameRef.current = requestAnimationFrame(updateProgressBar);
  };

  const playAudio = async () => {
    if (!audioData) {
      setMessage("No audio to play. Generate podcast first.");
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Stop previous playback if any, but don't reset pausedTimeRef
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    try {
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData.slice(0));
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      // Start from pausedTimeRef.current if available, otherwise from 0
      source.start(0, pausedTimeRef.current); 
      playbackStartTimeRef.current = audioContextRef.current.currentTime; // Record current time as playback start
      
      setIsPlaying(true);
      sourceNodeRef.current = source;

      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(updateProgressBar);

      source.onended = () => {
        setIsPlaying(false);
        setProgress(0);
        pausedTimeRef.current = 0; // Reset paused time when audio ends
        sourceNodeRef.current = null;
        cancelAnimationFrame(animationFrameRef.current);
      };
    } catch (e) {
      console.error("Error decoding or playing audio:", e);
      setMessage("Error playing audio.");
      setIsPlaying(false);
      setProgress(0);
      pausedTimeRef.current = 0; // Reset on error
    }
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    // When pausing, store the current time
    if (audioContextRef.current) {
      pausedTimeRef.current += audioContextRef.current.currentTime - playbackStartTimeRef.current;
    }
    cancelAnimationFrame(animationFrameRef.current);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      playAudio();
    }
  };

  const handleProgressBarClick = (event) => {
    if (!audioData || !audioContextRef.current || !sourceNodeRef.current || !sourceNodeRef.current.buffer) {
      return;
    }

    const progressBar = event.currentTarget;
    const clickX = event.clientX - progressBar.getBoundingClientRect().left;
    const width = progressBar.offsetWidth;
    const clickRatio = clickX / width;
    const duration = sourceNodeRef.current.buffer.duration;
    const seekTime = duration * clickRatio;

    // Stop current playback
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Update pausedTimeRef to the new seekTime
    pausedTimeRef.current = seekTime;
    
    // Play from the new seek time
    playAudio();
  };


  const renderContent = () => {
    switch (activeView) {
      case "recommendation":
        return (
          <>
            <div className="recommendation-controls">
              <button className="scroll-arrow left" onClick={() => scrollRecommendations("left")}>
                <FaChevronLeft />
              </button>
              <div className="content-container recommendations-scroll-container" ref={recommendationContentRef}>
                {recommendations.length > 0 ? (
                  recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="recommendation-card"
                      onClick={() => handleOpenRecommendation(rec.pdf_name, rec.page_number, rec.section)}
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
                  <p className="generated-output">No recommendations yet. Select text and click 'Generate'.</p>
                )}
              </div>
              <button className="scroll-arrow right" onClick={() => scrollRecommendations("right")}>
                <FaChevronRight />
              </button>
            </div>
          </>
        );
      case "insight":
        return insights ? (
          <div className="insight-content-wrapper">
            <div className="insight-content">
              {insights.facts && insights.facts.length > 0 && (
                <div className="facts-section">
                  <h3>Facts</h3>
                  <ul>
                    {insights.facts.map((fact, index) => (
                      <li key={index}>{fact}</li>
                    ))}
                  </ul>
                </div>
              )}
              {insights.didYouKnows && insights.didYouKnows.length > 0 && (
                <div className="did-you-know-section">
                  <h3>Did You Know?</h3>
                  <ul>
                    {insights.didYouKnows.map((dyk, index) => (
                      <li key={index}>{dyk}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(!insights.facts || insights.facts.length === 0) &&
              (!insights.didYouKnows || insights.didYouKnows.length === 0) && (
                  <p>No specific facts or "Did You Know?" insights available.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="generated-output">No insights generated yet.</p>
        );
      case "podcast":
        return (
          <div className="podcast-content-wrapper">
            <div className="podcast-content">
              <h3>Podcast Audio</h3>
              {isLoadingAudio ? (
                <div className="audio-loading">
                  <FaSpinner className="spinner" />
                  <p>Generating audio...</p>
                </div>
              ) : audioData ? (
                <>
                  <FaMicrophone size={50} className={`mic-icon ${isPlaying ? 'playing' : ''}`} />
                  <div className="audio-controls">
                    <button onClick={togglePlayPause} className={`play-pause-btn ${isPlaying ? 'playing-animation' : ''}`}>
                      {isPlaying ? <FaPauseCircle size={40} /> : <FaPlayCircle size={40} />}
                    </button>
                    <div className="progress-container" onClick={handleProgressBarClick}>
                      <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="generated-output">Generate text and click 'Generate' to get podcast audio.</p>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="pdf-page-container">
      <div className="sidebar">
        <button onClick={onBack} className="back-btn">
          <FaChevronLeft size={16} /> <strong>{taskName}</strong>
        </button>

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

        <div className="generate-wrapper">
          <button
            className={`generate-btn ${!selectedText ? "disabled" : ""}`}
            onClick={handleGenerate}
            disabled={!selectedText || isLoadingAudio}
          >
            {isLoadingAudio ? 'Generating...' : 'Generate'}
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

      <div className="center-viewer">
        <div ref={viewerRef} id="adobe-dc-view-main" className="viewer-box"></div>
      </div>

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

            {renderContent()}
        </div>

        {recommendedPdfViewerUrl && (
          <div className="recommended-viewer-area">
            <div ref={recommendedViewerRef} id="adobe-dc-view-rec" className="viewer-box-rec"></div>
          </div>
        )}
      </div>

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
