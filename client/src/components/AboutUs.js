import React from 'react';
import '../styles/staticPages.css';

const AboutUs = () => {
  return (
    <div className="static-page">
      <div className="static-page-content">
        <h1>About us</h1>
        
        <section className="about-section">
          <h2>Our Mission</h2>
          <p>At Hayden Bulk Tech Labs, we're revolutionizing the way people experience literature through cutting-edge AI technology. Our mission is to bring books to life by enabling readers to interact with their favorite characters in meaningful and engaging ways.</p>
        </section>

        <section className="about-section">
          <h2>Our Story</h2>
          <p>Founded in 2025, Hayden Bulk Tech Labs emerged from a simple yet powerful idea: what if readers could have conversations with book characters? This idea led to the development of our innovative AI-powered platform that transforms reading into an interactive experience.</p>
        </section>

        <section className="about-section">
          <h2>Technology</h2>
          <p>We leverage advanced AI technology to create intelligent, context-aware character interactions. Our platform understands the nuances of each character's personality, background, and story context to deliver authentic conversations.</p>
        </section>

        <section className="about-section">
          <h2>Our Team</h2>
          <p>Our diverse team of engineers, AI researchers, and literature enthusiasts works tirelessly to push the boundaries of what's possible in digital reading experiences. We're united by our passion for storytelling and technology.</p>
        </section>
      </div>
    </div>
  );
};

export default AboutUs; 