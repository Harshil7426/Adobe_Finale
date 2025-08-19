import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
 FaCloudUploadAlt,
 FaMousePointer,
 FaLightbulb,
 FaMagic,
 FaHeadphones,
 FaHistory,
} from "react-icons/fa";
import "./hero.css";

// ---------------------------
// Framer Motion Variants
// ---------------------------

// Parent variant for card animation
const cardVariant = {
 hidden: { opacity: 0, y: 50 },
 show: {
  opacity: 1,
  y: 0,
  transition: {
   duration: 0.4,
   ease: "easeOut",
   when: "beforeChildren",
   staggerChildren: 0.05
  }
 },
};

// Child variant for content inside the card
const contentVariant = {
 hidden: { opacity: 0, y: 20 },
 show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// Variant for icon hover animation
const iconHover = {
 scale: 1.1,
 y: -5,
 transition: { type: "spring", stiffness: 300, damping: 10 }
};

// Variant for text hover animation
const textHover = {
 color: "var(--secondary-color)",
 transition: { duration: 0.2 }
};

// ---------------------------
// Component
// ---------------------------

const Hero = () => {
 return (
  <div className="hero-page-enhanced">
   {/* Hero Section */}
   <motion.section
    className="hero-top-section"
    initial="hidden"
    animate="show"
    variants={cardVariant}
   >
    <div className="hero-content">
     <motion.h1 className="hero-title" variants={contentVariant}>
      ByteMe
     </motion.h1>
     <motion.p className="hero-tagline" variants={contentVariant}>
      Your Intelligent Document Analysis Hub
     </motion.p>
     <motion.p className="hero-description" variants={contentVariant}>
      Upload, analyze, and discover hidden connections with AI-powered
      recommendations and insights.
     </motion.p>
     <motion.div variants={contentVariant}>
      <Link to="/upload" className="get-started-btn">
       Get Started
      </Link>
     </motion.div>
    </div>
    <motion.div className="hero-mockup-animation" variants={cardVariant}>
     {/* Mockup animation layers */}
     <div className="mockup-layer layer-1"></div>
     <div className="mockup-layer layer-2"></div>
     <div className="mockup-layer layer-3"></div>
    </motion.div>
   </motion.section>

   {/* How it Works Section */}
   <motion.section
    className="hero-how-it-works-section"
    initial="hidden"
    whileInView="show"
    viewport={{ once: true, amount: 0.3 }}
    variants={cardVariant}
   >
    <motion.h2 className="how-it-works-title" variants={contentVariant}>
     How It Works
    </motion.h2>
    <motion.p className="how-it-works-subtitle" variants={contentVariant}>
     Experience the power of AI-driven PDF analysis.
    </motion.p>

    <div className="how-it-works-grid">
     {[{
       title: "Upload Documents",
       desc: "Securely drag and drop your PDFs into our platform.",
       icon: <FaCloudUploadAlt />,
      }, {
       title: "Select & Analyze",
       desc: "Highlight text to get deep, AI-powered insights.",
       icon: <FaMousePointer />,
      }, {
       title: "Generate Insights",
       desc: "Instantly receive recommendations and summaries.",
       icon: <FaLightbulb />,
      }, ].map((item, idx) => (
       <motion.div
        key={idx}
        className="how-it-works-step"
        variants={cardVariant}
       >
        <motion.div
         className="step-content-hover-wrapper"
         style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
         <motion.div
          className="step-icon-container"
          variants={contentVariant}
          whileHover={iconHover}
         >
          <span className="step-number">0{idx + 1}</span>
          <div className="step-icon-wrapper">{item.icon}</div>
         </motion.div>
         <motion.h3 variants={contentVariant} whileHover={textHover}>
          {item.title}
         </motion.h3>
         <motion.p variants={contentVariant} whileHover={textHover}>
          {item.desc}
         </motion.p>
        </motion.div>
       </motion.div>
      ))}
    </div>
   </motion.section>

   {/* Features Section */}
   <motion.section
    className="hero-features-section"
    initial="hidden"
    whileInView="show"
    viewport={{ once: true, amount: 0.3 }}
    variants={cardVariant}
   >
    <motion.h2 className="features-title" variants={contentVariant}>
     Beyond Recommendations
    </motion.h2>
    <motion.p className="features-subtitle" variants={contentVariant}>
     Discover ByteMe's full suite of powerful features.
    </motion.p>
    <div className="features-grid">
     {[{
       title: "Key Insight Generation",
       desc: "Extract key facts, summaries, and topics instantly.",
       icon: <FaMagic />,
      }, {
       title: "Podcast Mode",
       desc: "Listen to documents with integrated text-to-speech.",
       icon: <FaHeadphones />,
      }, {
       title: "Task History",
       desc: "Revisit all previous analysis sessions anytime.",
       icon: <FaHistory />,
      }, ].map((f, i) => (
       <motion.div
        key={i}
        className="feature-card"
        variants={cardVariant}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
       >
        <motion.div className="feature-icon-wrapper" variants={contentVariant}>
         {f.icon}
        </motion.div>
        <motion.h3 variants={contentVariant}>{f.title}</motion.h3>
        <motion.p variants={contentVariant}>{f.desc}</motion.p>
       </motion.div>
      ))}
    </div>
   </motion.section>

   {/* About Section */}
   <motion.section
    id="about-section"
    className="hero-about-section"
    initial="hidden"
    whileInView="show"
    viewport={{ once: true, amount: 0.3 }}
    variants={cardVariant}
   >
    <motion.h2 className="about-title" variants={contentVariant}>About ByteMe</motion.h2>
    <motion.p className="about-description" variants={contentVariant}>
     ByteMe is a cutting-edge document intelligence tool developed for the
     Adobe National Hackathon. Our mission is to empower users with AI to
     quickly understand and connect vast amounts of information from PDFs.
    </motion.p>
   </motion.section>

   {/* Contact Section */}
   <motion.section
    id="contact-section"
    className="hero-contact-section"
    initial="hidden"
    whileInView="show"
    viewport={{ once: true, amount: 0.3 }}
    variants={cardVariant}
   >
    <motion.h2 className="contact-title" variants={contentVariant}>Get in Touch</motion.h2>
    <motion.p className="contact-description" variants={contentVariant}>
     Have questions, feedback, or just want to say hello? We'd love to hear
     from you!
    </motion.p>
    <motion.div className="contact-info" variants={contentVariant}>
     <p>
      <span className="contact-icon">📧</span> Email: harshilaminijs@gmail.com, aniketgaikwad2305@gmail.com
     </p> 
    </motion.div>
   </motion.section>
  </div>
 );
};

export default Hero;
