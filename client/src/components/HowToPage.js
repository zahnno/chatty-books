import React from 'react';
import './HowToPage.css';

const STEPS = [
  {
    title: 'Pick a book and start reading',
    body: 'Browse the collection, open a book, and read at your own pace. Your place is saved as you go.',
    video: '/searching-books.mp4',
  },
  {
    title: 'Chat with the characters',
    body: 'Open the characters in any book and start a conversation. They answer in their own voice, from inside the story.',
    video: '/find-characters-how-to.mp4',
  },
  {
    title: 'Turn a scene into a picture',
    body: 'Select any paragraph while reading to generate an illustration of the moment, then share it with the community.',
    video: '/image-gen-how-to.mp4',
  },
];

const HowToPage = () => {
  return (
    <div className="ui-page how-to-page">
      <header className="how-to-header">
        <span className="ui-section-eyebrow">How it works</span>
        <h1 className="ui-page-title">Read, talk, imagine</h1>
        <p className="ui-page-subtitle">Three things you can do with every book on Chatty Books.</p>
      </header>

      <ol className="how-to-steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="how-to-step">
            <div className="how-to-step-copy">
              <span className="how-to-step-number">{index + 1}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
            <div className="how-to-video">
              <video autoPlay loop muted playsInline>
                <source src={step.video} type="video/mp4" />
              </video>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default HowToPage;
