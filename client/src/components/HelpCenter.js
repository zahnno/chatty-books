import React from 'react';
import '../styles/staticPages.css';

const HelpCenter = () => {
  return (
    <div className="static-page">
      <div className="static-page-content">
        <h1>Help center</h1>
        
        <section className="help-section">
          <h2>Frequently asked questions</h2>
          
          <div className="faq-item">
            <h3>How do I get started?</h3>
            <p>Create an account, browse our collection of books, and start reading! You can interact with characters from the books through our AI-powered chat feature.</p>
          </div>

          <div className="faq-item">
            <h3>How does the character chat work?</h3>
            <p>Our AI technology allows characters to respond based on their personality and the book's context. Select a character from any book you're reading to start a conversation.</p>
          </div>

          <div className="faq-item">
            <h3>What payment methods do you accept?</h3>
            <p>We accept all major credit cards through our secure payment processor, Stripe.</p>
          </div>
        </section>

        <section className="help-section">
          <h2>Contact support</h2>
          <p>Need more help? Contact our support team:</p>
          <ul>
            <li>Email: <a href="mailto:support@chattybooks.com">support@chattybooks.com</a></li>
            <li>Response time: Within 24 hours</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default HelpCenter; 