import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './Navbar'; // Assuming you have a Navbar component
import Upload from './Upload'; // Your existing Upload component
import Hero from './hero'; // Import the new Hero component
import './Upload.css'; // All global and upload-specific styles are now here

// Set smooth scroll behavior globally for hash links
document.documentElement.style.scrollBehavior = 'smooth';

function App() {
  return (
    <Router>
      <div className="app-container">
        {/* Navbar will be rendered outside Routes if it's a persistent header */}
        <Navbar /> 

        <Routes>
          {/* Route for the Hero (Home) page */}
          <Route path="/" element={<Hero />} />
          
          {/* Route for the Upload page */}
          <Route path="/upload" element={<Upload />} />
          
          {/* About and Contact are now sections within the Hero page, no separate routes needed */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;
