import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Upload from './Upload';
import Hero from './hero';
import './Upload.css';

document.documentElement.style.scrollBehavior = 'smooth';

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

function AppContent() {
  const location = useLocation();

  return (
    <div className="app-container">
      {/* Conditionally render Navbar only on the home page */}
      {location.pathname === '/' && <Navbar />}
      
      <Routes>
        <Route path="/" element={<Hero />} />
        <Route path="/upload" element={<Upload />} />
      </Routes>
    </div>
  );
}

export default App;
