import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import './hero.css';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const Hero = () => {
  const step1Ref = useRef(null);
  const step2Ref = useRef(null);
  const step3Ref = useRef(null);
  const aboutSectionRef = useRef(null);
  const contactSectionRef = useRef(null);

  useEffect(() => {
    // GSAP Animations for the "How ByteMe Works" section
    // Step 1: Upload Your PDFs
    gsap.fromTo(step1Ref.current,
      { opacity: 0, y: 50 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: step1Ref.current,
          start: 'top 80%',
          toggleActions: 'play none none reverse',
        },
      }
    );

    // Step 2: Select Text
    gsap.fromTo(step2Ref.current,
      { opacity: 0, y: 50 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: step2Ref.current,
          start: 'top 80%',
          toggleActions: 'play none none reverse',
        },
      }
    );

    // Step 3: Generate Insights & Recommendations
    gsap.fromTo(step3Ref.current,
      { opacity: 0, y: 50 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: step3Ref.current,
          start: 'top 80%',
          toggleActions: 'play none none reverse',
        },
      }
    );

    // Smooth scroll to sections when hash links are clicked
    const handleHashChange = () => {
      const id = window.location.hash.substring(1);
      const element = document.getElementById(id);
      if (element) {
        gsap.to(window, {
          duration: 1.2,
          scrollTo: {
            y: element,
            offsetY: 80
          },
          ease: 'power3.out'
        });
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    if (window.location.hash) {
      handleHashChange();
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    };
  }, []);

  return (
    <div className="hero-page">
      {/* Top Section: Website Name, Tagline, Description, Get Started Button */}
      <section className="hero-top-section">
        <h1 className="hero-title">ByteMe</h1>
        <p className="hero-tagline">
          Your Intelligent Document Analysis Hub
        </p>
        <p className="hero-description">
          Seamlessly connect insights across your PDFs. Upload, analyze, and discover hidden connections with AI-powered recommendations and insights.
        </p>
        <Link to="/upload" className="get-started-btn">
          Get Started
        </Link>
      </section>

      {/* Middle Section: How ByteMe Works - Step-by-step layout */}
      <section className="hero-how-it-works-section">
        <h2 className="how-it-works-title">How ByteMe Works</h2>
        <p className="how-it-works-subtitle">
          Experience the power of AI-driven PDF analysis through our intuitive workflow
        </p>

        <div className="how-it-works-grid">
          {/* Step 1: Upload Your PDFs */}
          <div className="how-it-works-step left-align" ref={step1Ref}>
            <div className="step-icon-container">
              <span className="step-number">Step 1</span>
              <span className="step-icon">⬆️</span>
            </div>
            <h3>Upload Your PDFs</h3>
            <p>Drag and drop bulk source documents and fresh working PDFs into our secure platform.</p>
          </div>
          <div className="step-image-container">
            <div className="upload-mockup-box">
              <div className="mockup-line-lg"></div>
              <div className="mockup-line-md"></div>
              <div className="mockup-line-sm"></div> {/* Added smaller line */}
              <div className="mockup-upload-icon">⬆️</div>
            </div>
          </div>

          {/* Step 2: Select Text */}
          <div className="step-image-container right-align">
            <div className="select-text-mockup-box">
              <div className="mockup-line-lg"></div>
              <div className="mockup-line-md"></div>
              <div className="mockup-line-sm"></div> {/* Added smaller line */}
              <div className="mockup-cursor-icon">👆</div>
            </div>
          </div>
          <div className="how-it-works-step right-align" ref={step2Ref}>
            <div className="step-icon-container">
              <span className="step-number">Step 2</span>
              <span className="step-icon">✍️</span>
            </div>
            <h3>Select Text</h3>
            <p>Highlight any text from your fresh PDFs to analyze and find connections.</p>
          </div>

          {/* Step 3: Generate Insights & Recommendations */}
          <div className="how-it-works-step left-align" ref={step3Ref}>
            <div className="step-icon-container">
              <span className="step-number">Step 3</span>
              <span className="step-icon">💡</span>
            </div>
            <h3>Generate Insights & Recommendations</h3>
            <p>Instantly get AI-powered recommendations from bulk PDFs and generate quick insights.</p>
          </div>
          <div className="step-image-container">
            <div className="insights-mockup-box">
              <div className="mockup-line-lg"></div>
              <div className="mockup-line-md"></div>
              <div className="mockup-line-sm"></div> {/* Added smaller line */}
              <div className="mockup-chart-icon">📊</div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Section: Other Functionalities */}
      <section className="hero-features-section">
        <h2 className="features-title">Beyond Recommendations</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3><span className="feature-icon">✨</span> Generate Insights</h3>
            <p>Extract key facts, "Did You Know?" snippets, and summaries from selected text instantly.</p>
          </div>
          <div className="feature-card">
            <h3><span className="feature-icon">🎧</span> Podcast Mode</h3>
            <p>Listen to your selected text with our integrated text-to-speech, perfect for on-the-go learning.</p>
          </div>
          <div className="feature-card">
            <h3><span className="feature-icon">💾</span> Task History</h3>
            <p>Your work is saved! Revisit previous analysis sessions and continue from where you left off.</p>
          </div>
        </div>
      </section>

      {/* About Section: Part of Hero Page, scrolled to via Navbar */}
      <section id="about-section" className="hero-about-section" ref={aboutSectionRef}>
        <h2 className="about-title">About ByteMe</h2>
        <p className="about-description">
          ByteMe is a cutting-edge document intelligence tool developed as part of the **Adobe National Hackathon**. Our mission is to empower users with advanced AI capabilities to quickly understand, connect, and derive insights from vast amounts of PDF documents. We believe in making complex data analysis accessible and intuitive for everyone.
        </p>
      </section>

      {/* Contact Section: Part of Hero Page, scrolled to via Navbar */}
      <section id="contact-section" className="hero-contact-section" ref={contactSectionRef}>
        <h2 className="contact-title">Get in Touch</h2>
        <p className="contact-description">
          Have questions, feedback, or just want to say hello? We'd love to hear from you!
        </p>
        <div className="contact-info">
          <p><span className="contact-icon">📧</span> Email: <a href="mailto:support@byteme.com">support@byteme.com</a></p>
          <p><span className="contact-icon">🔗</span> LinkedIn: <a href="https://www.linkedin.com/company/byteme" target="_blank" rel="noopener noreferrer">ByteMe LinkedIn</a></p>
          <p><span className="contact-icon">🐦</span> Twitter: <a href="https://twitter.com/byteme_ai" target="_blank" rel="noopener noreferrer">@byteme_ai</a></p>
        </div>
      </section>
    </div>
  );
};

export default Hero;
