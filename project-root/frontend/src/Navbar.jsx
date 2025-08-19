import React from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        {/* 'ByteMe' text, links to the home page */}
        <Link to="/">ByteMe</Link>
      </div>
      <ul className="navbar-links">
        {/* Navigation links */}
        <li><Link to="/upload">Upload</Link></li>
        <li><Link to="/about">About</Link></li>
        <li><Link to="/contact">Contact</Link></li>
      </ul>
    </nav>
  );
};

export default Navbar;
