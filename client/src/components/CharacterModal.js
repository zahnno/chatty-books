import React from 'react';
import { X, MessageCircle, Book, Heart, Target, User, Info, FileText, Camera, Award, AlertTriangle } from 'react-feather';
import { useNavigate } from 'react-router-dom';
import { useCharacterChatPrefetch } from '../hooks/useApi';
import { preloadCharacterChat } from '../utils/routePrefetch';
import './CharacterModal.css';
import { thumbUrl } from '@talkingbook/shared';

export default function CharacterModal({ character, onClose, isDarkMode }) {
  const navigate = useNavigate();
  const prefetchCharacterChat = useCharacterChatPrefetch();
  const bookId = character?.bookId?._id || character?.bookId;
  const handleChatClick = () => {
    navigate(`/books/${bookId}/view/characters/${character._id}`);
  };
  const handleChatHover = () => {
    preloadCharacterChat();
    if (bookId && character?._id) prefetchCharacterChat(bookId, character._id);
  };

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className={`cm-modal ${isDarkMode ? 'cm-dark' : 'cm-light'}`} onClick={e => e.stopPropagation()}>
        <button className="cm-close" onClick={onClose}>
          <X size={24} />
        </button>
        
        <div className="cm-content">
          <div className="cm-header">
            <div className="cm-image-container">
              {character.image_url ? (
                <img
                  src={thumbUrl(character.image_url, 400)}
                  alt={`${character.firstName} ${character.lastName}`}
                  className="cm-image"
                />
              ) : (
                <div className="cm-image-placeholder">
                  <User size={48} />
                </div>
              )}
            </div>
            <div className="cm-header-info">
              <h2 className="cm-name">{character.firstName} {character.lastName}</h2>
              <div className="cm-book-info">
                <Book size={16} />
                <span 
                  className="cm-book-link"
                  onClick={() => navigate(`/books/${character.bookId._id}`)}
                >
                  {character.bookTitle}
                </span>
              </div>
            </div>
          </div>

          <div className="cm-details">
            {character.intro && (
              <div className="cm-section">
                <h3>
                  <Info size={18} />
                  Introduction
                </h3>
                <p>{character.intro}</p>
              </div>
            )}
            
            {character.description && (
              <div className="cm-section">
                <h3>
                  <FileText size={18} />
                  Description
                </h3>
                <p>{character.description}</p>
              </div>
            )}

            {character.appearance && (
              <div className="cm-section">
                <h3>
                  <Camera size={18} />
                  Appearance
                </h3>
                <p>{character.appearance}</p>
              </div>
            )}

            {/* {character.events && (
              <div className="cm-section">
                <h3>
                  <Calendar size={18} />
                  Key Events
                </h3>
                <p>{character.events}</p>
              </div>
            )} */}

            {character.personalityTraits && character.personalityTraits.length > 0 && (
              <div className="cm-section">
                <h3>
                  <Heart size={18} />
                  Personality Traits
                </h3>
                <div className="cm-tags">
                  {character.personalityTraits.map((trait, index) => (
                    <span key={index} className="cm-tag">
                      <Heart size={14} />
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="cm-section-grid">
              {character.strengths && character.strengths.length > 0 && (
                <div className="cm-section">
                  <h3>
                    <Award size={18} />
                    Strengths
                  </h3>
                  <ul className="cm-list">
                    {character.strengths.map((strength, index) => (
                      <li key={index}>
                        <Award size={14} />
                        {strength}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {character.weaknesses && character.weaknesses.length > 0 && (
                <div className="cm-section">
                  <h3>
                    <AlertTriangle size={18} />
                    Weaknesses
                  </h3>
                  <ul className="cm-list">
                    {character.weaknesses.map((weakness, index) => (
                      <li key={index}>
                        <AlertTriangle size={14} />
                        {weakness}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {character.goals && character.goals.length > 0 && (
              <div className="cm-section">
                <h3>
                  <Target size={18} />
                  Goals & Motivations
                </h3>
                <div className="cm-tags">
                  {character.goals.map((goal, index) => (
                    <span key={index} className="cm-tag">
                      <Target size={14} />
                      {goal}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="cm-actions">
            <button className="cm-chat-button" onClick={handleChatClick} onMouseEnter={handleChatHover} onFocus={handleChatHover}>
              <MessageCircle size={20} />
              Start conversation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 