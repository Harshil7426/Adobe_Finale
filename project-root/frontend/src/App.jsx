import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { FaFilePdf, FaTimes, FaUpload, FaPlay, FaChevronRight, FaChevronLeft, FaFileAlt, FaSpinner, FaPaperclip } from "react-icons/fa";
import PdfViewer from './PdfViewer';

const API_URL = 'http://localhost:8000';

const Toast = ({ message, show, onClose }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="toast-notification">
      <p>{message}</p>
    </div>
  );
};

function App() {
  const [bulkFiles, setBulkFiles] = useState([]);
  const [freshFile, setFreshFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [tasks, setTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showTaskNameModal, setShowTaskNameModal] = useState(false);
  const [tempTaskName, setTempTaskName] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(null);

  const bulkFileInputRef = useRef(null);
  const freshFileInputRef = useRef(null);
  const taskListRef = useRef(null);

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_URL}/tasks`);
      if (response.ok) {
        const data = await response.json();
        const sortedTasks = data.sort((a, b) => b.task_name.localeCompare(a.task_name));
        setTasks(sortedTasks);
      } else {
        console.error('Failed to fetch tasks.');
      }
    } catch (error) {
      console.error('An error occurred while fetching tasks:', error);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleUpload = () => {
    if (bulkFiles.length === 0 || !freshFile) {
      setUploadStatus('Please select both a fresh PDF and at least one bulk PDF.');
      return;
    }
    setShowTaskNameModal(true);
  };

  const handleConfirmUpload = async () => {
    if (!tempTaskName.trim()) {
      setUploadStatus('Task name cannot be empty.');
      return;
    }

    const formData = new FormData();
    for (const file of bulkFiles) {
      formData.append('bulk_files', file);
    }
    formData.append('fresh_file', freshFile);
    formData.append('task_name', tempTaskName);

    try {
      setIsUploading(true);
      setUploadStatus('Uploading...');
      setShowTaskNameModal(false);

      const response = await fetch(`${API_URL}/upload_task`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        setUploadStatus(`Success! New task created: ${data.task_name}`);
        setBulkFiles([]);
        setFreshFile(null);
        setTempTaskName('');
        fetchTasks();

        setToastMessage(`Task "${data.task_name}" started processing.`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3500);
      } else {
        setUploadStatus(`Error: ${data.detail}`);
      }
    } catch (error) {
      setUploadStatus(`An error occurred: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBulkFileChange = (e) => {
    const newFiles = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
    setBulkFiles(prevFiles => [...prevFiles, ...newFiles]);
    e.target.value = null;
  };

  const handleFreshFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setFreshFile(file);
    } else if (file) {
      alert('Please upload a valid PDF file.');
    }
    e.target.value = null;
  };

  const handleRemoveBulkFile = (fileName) => {
    setBulkFiles(prevFiles => prevFiles.filter(file => file.name !== fileName));
  };

  const handleRemoveFreshFile = () => {
    setFreshFile(null);
  };

  const handleStartTask = () => {
    if (activeTask && activeTask.status === 'ready') {
      setViewingPdf({
        freshPdf: {
          name: activeTask.fresh_files[0],
          url: `${API_URL}/pdfs/${activeTask.task_name}/${activeTask.fresh_files[0]}`
        },
        bulkPdfs: activeTask.bulk_files.map(file => ({
          name: file,
          url: `${API_URL}/pdfs/${activeTask.task_name}/bulk/${file}`
        }))
      });
    }
  };

  const scrollTasks = (direction) => {
    if (taskListRef.current) {
      const scrollAmount = 350;
      if (direction === 'left') {
        taskListRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        taskListRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  if (viewingPdf) {
    return <PdfViewer freshPdf={viewingPdf.freshPdf} bulkPdfs={viewingPdf.bulkPdfs} onBack={() => setViewingPdf(null)} />;
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <h1 className="main-title">Document Intelligence Hub</h1>
        <p className="subtitle">Transform your document analysis workflow with intelligent PDF processing and comparison</p>

        <div className="upload-section">
          <div className="upload-box-container">
            <div className="upload-box bulk-upload-box">
              <h3 className="box-title">Bulk PDFs</h3>
              <p className="box-description">Upload multiple PDF documents for comprehensive analysis</p>
              <div className="drop-zone" onClick={() => bulkFileInputRef.current.click()}>
                <FaUpload size={30} className="upload-icon" />
                <p>Drag and drop files here<br />or <span className="browse-link">click to browse</span></p>
                <input type="file" multiple ref={bulkFileInputRef} onChange={handleBulkFileChange} style={{display: 'none'}} accept=".pdf" />
              </div>
              <div className="file-preview-list">
                {bulkFiles.map(file => (
                  <div key={file.name} className="file-chip">
                    <FaFilePdf size={14} />
                    <span>{file.name}</span>
                    <FaTimes size={12} className="remove-icon" onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveBulkFile(file.name);
                    }} />
                  </div>
                ))}
              </div>
            </div>

            <div className="upload-box fresh-upload-box">
              <h3 className="box-title">Fresh PDF</h3>
              <p className="box-description">Upload a single fresh PDF document to compare against bulk files</p>
              <div className="drop-zone" onClick={() => freshFileInputRef.current.click()}>
                <FaUpload size={30} className="upload-icon" />
                <p>Drag and drop file here<br />or <span className="browse-link">click to browse</span></p>
                <input type="file" ref={freshFileInputRef} onChange={handleFreshFileChange} style={{display: 'none'}} accept=".pdf" />
              </div>
              {freshFile && (
                <div className="file-preview-list">
                  <div className="file-chip">
                    <FaFilePdf size={14} />
                    <span>{freshFile.name}</span>
                    <FaTimes size={12} className="remove-icon" onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFreshFile();
                    }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="action-buttons-container">
            <button className="btn create-task-btn" onClick={handleUpload} disabled={isUploading || bulkFiles.length === 0 || !freshFile}>
              {isUploading ? <FaSpinner className="spinner" /> : <FaPaperclip />} Upload Documents
            </button>
          </div>
          <p className="status-message">{uploadStatus}</p>
        </div>

        <div className="tasks-section">
          <div className="tasks-header">
            <div className="tasks-title-wrapper">
              <FaFileAlt size={28} className="tasks-icon" />
              <div>
                <h2 className="tasks-title">Tasks</h2>
                <p className="tasks-description">Manage your document analysis workflows</p>
              </div>
            </div>
            <div className="tasks-status-wrapper">
              <p className="tasks-count">{tasks.length} tasks</p>
              <button 
                className="btn start-analysis-btn" 
                onClick={handleStartTask} 
                disabled={!activeTask || activeTask.status !== 'ready'}
              >
                <FaPlay /> Start Analysis
              </button>
            </div>
          </div>
          
          <div className="task-list-wrapper">
            <button className="scroll-btn left" onClick={() => scrollTasks('left')}>
              <FaChevronLeft />
            </button>
            <div className="task-list" ref={taskListRef}>
              {tasks.length > 0 ? (
                tasks.map((task, index) => (
                  <div
                    key={index}
                    className={`task-card ${activeTask?.task_name === task.task_name ? 'active' : ''} ${task.status === 'processing' ? 'processing' : 'ready'}`}
                    onClick={() => setActiveTask(task)}
                  >
                    <div className="card-top">
                      <h3 className="task-card-title">{task.task_name.replace('_', ' ')}</h3>
                      <span className={`status-badge ${task.status === 'processing' ? 'processing' : 'ready'}`}>
                        {task.status === 'processing' ? <FaSpinner className="spinner-small" /> : 'Ready'}
                      </span>
                    </div>
                    <div className="card-meta">
                      <p>Aug 14, 2025, 08:34 AM</p>
                    </div>
                    <div className="card-file-list">
                      <div className="file-category">
                        <p className="file-category-title">Fresh PDF (1)</p>
                        <div className="file-info-chip">
                          <FaFilePdf size={14} />
                          <span>{task.fresh_files[0]}</span>
                        </div>
                      </div>
                      <div className="file-category">
                        <p className="file-category-title">Bulk PDFs ({task.bulk_files.length})</p>
                        {task.bulk_files.map(file => (
                          <div key={file} className="file-info-chip">
                            <FaFilePdf size={14} />
                            <span>{file}</span>
                          </div>
                        ))}
                      </div>
                      
                    </div>
                  </div>
                ))
              ) : (
                <p className="no-tasks-message">No tasks created yet. Upload documents to get started!</p>
              )}
            </div>
            {tasks.length > 3 && (
              <>
                <button className="absolute left-0 top-1/2 -translate-y-1/2 p-3 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-100 transition duration-300" onClick={() => scrollTasks('left')}>
                  <FaChevronLeft className="text-gray-600" />
                </button>
                <button className="absolute right-0 top-1/2 -translate-y-1/2 p-3 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-100 transition duration-300" onClick={() => scrollTasks('right')}>
                  <FaChevronRight className="text-gray-600" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {showTaskNameModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Name Your Task</h3>
            <p>Please provide a name for this document analysis task.</p>
            <input 
              type="text" 
              value={tempTaskName} 
              onChange={(e) => setTempTaskName(e.target.value)} 
              placeholder="e.g., Contract Analysis"
              className="modal-input"
            />
            <div className="modal-actions">
              <button className="btn modal-cancel-btn" onClick={() => setShowTaskNameModal(false)}>Cancel</button>
              <button className="btn modal-confirm-btn" onClick={handleConfirmUpload}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;