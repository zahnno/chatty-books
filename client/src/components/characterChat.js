import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, NavLink, useLocation } from 'react-router-dom';
import { catchError, authFetch } from '../utils.js';
import BookHeader from './bookHeader.js';
import Navbar from './navbar.js';
import { toast } from 'react-toastify';
import { Send, Book, MessageCircle, ExternalLink, LogIn, Search, User, Heart, Star, Shield, Target, Menu, Mic, Volume2, Square, X } from 'react-feather';
import '../styles/characterChat.css';
import UsageExhaustedModal from './UsageExhaustedModal';
import CharacterChatSkeleton from './skeletons/CharacterChatSkeleton';
import { useBook, useBookCharacter } from '../hooks/useApi';
import { useVoiceChat, isVoiceSupported, MAX_RECORDING_SECONDS } from '../hooks/useVoiceChat';
import { thumbUrl } from '@talkingbook/shared';

export default function CharacterChat() {
  const location = useLocation();
  const { characterId, bookId } = useParams();
  const bookQuery = useBook(bookId);
  const characterQuery = useBookCharacter(bookId, characterId);
  const book = bookQuery.data;
  const character = characterQuery.data;
  const [chatLoading, setChatLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(null);
  const [delayedResponse, setDelayedResponse] = useState(null);
  const [showUsageExhaustedModal, setShowUsageExhaustedModal] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [messagePage, setMessagePage] = useState(1);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const chatEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const voice = useVoiceChat(bookId, characterId);
  const canUseVoice = isVoiceSupported();

  const handleChatError = (error) => {
    if (error.message === 'No prompt provided') {
      toast.error('Please enter a message');
    } else if (error.message === 'Prompt exceeds 500 character limit.') {
      toast.error('Message is too long (500 character limit)');
    } else if (error.message && (
      error.message.toLowerCase().includes('tokens') || 
      error.message.includes('usage limit') ||
      error.message.includes('upgrade your subscription')
    )) {
      setShowUsageExhaustedModal(true);
      // Store the last message for potential reversion
      setLastFailedMessage(chatHistory[chatHistory.length - 1]);
    } else {
      toast.error(error.message || 'Failed to send message');
    }
    setChatLoading(false);
    setDelayedResponse(null); // Clear typing indicator on error
  };

  const getRandomDelay = () => {
    const delays = [50, 100, 150];
    return delays[Math.floor(Math.random() * delays.length)];
  };

  const handleUsageModalClose = () => {
    setShowUsageExhaustedModal(false);
    
    // If there was a failed message due to usage limits, revert the chat state
    if (lastFailedMessage) {
      setChatHistory(prev => {
        // Remove the last message if it matches the failed message
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg && lastMsg.timestamp === lastFailedMessage.timestamp) {
          updated.pop();
        }
        return updated;
      });
      
      // Clear all loading states
      setDelayedResponse(null);
      setChatLoading(false);
      setLastFailedMessage(null);
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchChatHistory = async (page = 1, appendToHistory = false) => {
    if (!user) return;
    
    const [error, data] = await catchError(authFetch({
      path: `/book/${bookId}/character/${characterId}/messages?page=${page}&limit=20`,
      method: 'GET'
    }));
    
    if (data) {
      // Ensure messages is always an array
      const messages = Array.isArray(data.messages) ? data.messages : [];
      
      if (appendToHistory) {
        // When loading older messages, prepend them to the existing history
        setChatHistory(prev => {
          const currentHistory = Array.isArray(prev) ? prev : [];
          return [...messages, ...currentHistory];
        });
      } else {
        // Initial load or reset - replace the chat history entirely
        setChatHistory(messages);
      }
      
      // Update pagination state
      if (data.pagination) {
        setHasMoreMessages(data.pagination.hasMore);
        setMessagePage(data.pagination.page);
      }
    }
    if (error) {
      console.error('Error fetching chat history:', error);
    }
  };

  const loadOlderMessages = async () => {
    if (isLoadingOlderMessages || !hasMoreMessages) return;
    
    setIsLoadingOlderMessages(true);
    const nextPage = messagePage + 1;
    
    // Store current scroll position to maintain it after loading
    const messagesContainer = messagesContainerRef.current;
    const prevScrollHeight = messagesContainer?.scrollHeight || 0;
    
    try {
      await fetchChatHistory(nextPage, true);
      
      // Maintain scroll position after loading older messages
      if (messagesContainer) {
        const newScrollHeight = messagesContainer.scrollHeight;
        const scrollDiff = newScrollHeight - prevScrollHeight;
        messagesContainer.scrollTop = messagesContainer.scrollTop + scrollDiff;
      }
    } catch (error) {
      console.error('Error loading older messages:', error);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  };

  const handleScroll = (e) => {
    const { scrollTop } = e.target;
    // Load more messages when user scrolls near the top
    if (scrollTop < 100 && hasMoreMessages && !isLoadingOlderMessages) {
      loadOlderMessages();
    }
  };

  useEffect(() => {
    // Only scroll to bottom on initial load or when not loading older messages
    if (isInitialLoad || !isLoadingOlderMessages) {
      scrollToBottom();
    }
    
    if (isInitialLoad && chatHistory.length > 0) {
      setIsInitialLoad(false);
    }
  }, [chatHistory, isInitialLoad, isLoadingOlderMessages]);

  // Add new effect for delayed response
  useEffect(() => {
    if (delayedResponse) {
      scrollToBottom();
    }
  }, [delayedResponse]);

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  };

  useEffect(() => {
    const authenticate = async () => {
      const [err, data] = await catchError(authFetch({ path: '/authenticate', method: 'GET' }));
      if (data) setUser(data);
      if (err) { /* auth failed, user stays null */ }
    };
    authenticate();
  }, []);

  // Set current page from location state when available
  useEffect(() => {
    if (location.state?.currentPage) setCurrentPage(location.state.currentPage);
  }, [location.state?.currentPage]);

  // Load chat history when user, book, and character are ready (React Query provides book/character, possibly from cache)
  useEffect(() => {
    if (user && book && character) fetchChatHistory(1);
    if (!user && character) setChatHistory([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchChatHistory is stable; we only want to run when user/book/character become available
  }, [user, book, character]);

  const loading = (!book && bookQuery.isLoading) || (!character && characterQuery.isLoading);

  const sendPrompt = async () => {
    if (!prompt.trim()) return;
    
    // Immediately add user message to chat history
    const timestamp = new Date().toISOString();
    setChatHistory(prev => [...prev, {
      userMessage: prompt,
      timestamp: timestamp,
      pageNumber: currentPage
    }]);
    
    // Clear input and set loading state
    const currentPrompt = prompt;
    setPrompt('');
    setChatLoading(true);

    // Add initial delay before showing typing indicator
    setTimeout(() => {
      setDelayedResponse({
        modelResponse: null,
        timestamp: timestamp
      });
    }, 1000); // 1 second initial delay

    const [error, data] = await catchError(authFetch({ 
      path: `/book/${bookId}/character/${characterId}/chat`,
      method: 'POST',
      body: { 
        prompt: currentPrompt,
        pageNumber: currentPage
      }
    }));

    if (data) {
      if (data.message) {
        // Reset pagination and refetch chat history
        setMessagePage(1);
        setHasMoreMessages(true);
        setIsInitialLoad(true);
        
        const [historyError, historyData] = await catchError(authFetch({
          path: `/book/${bookId}/character/${characterId}/messages?page=1&limit=20`,
          method: 'GET'
        }));
        
        if (historyData) {
          // Ensure messages is always an array
          const messages = Array.isArray(historyData.messages) ? historyData.messages : [];
          const currentHistory = Array.isArray(chatHistory) ? chatHistory : [];
          
          // Find the new message by comparing with current chat history
          const newMessages = messages.filter(msg => 
            !currentHistory.some(existingMsg => 
              existingMsg.timestamp === msg.timestamp && 
              existingMsg.modelResponse === msg.modelResponse
            )
          );

          if (newMessages.length > 0) {
            // Set delayed response to be shown after delay
            setDelayedResponse({
              modelResponse: newMessages[0].modelResponse,
              timestamp: newMessages[0].timestamp
            });

            // Clear loading immediately since we'll show typing indicator separately
            setChatLoading(false);

            // Add delay before showing AI response
            setTimeout(() => {
              setChatHistory(messages);
              if (historyData.pagination) {
                setHasMoreMessages(historyData.pagination.hasMore);
                setMessagePage(historyData.pagination.page);
              }
              setDelayedResponse(null);
            }, getRandomDelay());
          }
        }
        if (historyError) {
          console.error('Error fetching chat history:', historyError);
          toast.error('Error updating chat history');
          setChatLoading(false);
        }
      } else {
        toast.error('No response received from character');
        setChatLoading(false);
      }
    }
    
    if (error) {
      handleChatError(error);
    }
  };

  // Helper to send a prompt directly (for suggestions)
  const sendPromptDirect = async (promptText) => {
    if (!promptText.trim()) return;
    // Immediately add user message to chat history
    const timestamp = new Date().toISOString();
    setChatHistory(prev => [...prev, {
      userMessage: promptText,
      timestamp: timestamp,
      pageNumber: currentPage
    }]);
    setPrompt('');
    setChatLoading(true);
    setDelayedResponse({
      modelResponse: null,
      timestamp: timestamp
    });
    const [error, data] = await catchError(authFetch({ 
      path: `/book/${bookId}/character/${characterId}/chat`,
      method: 'POST',
      body: { 
        prompt: promptText,
        pageNumber: currentPage
      }
    }));
    if (data) {
      if (data.message) {
        setMessagePage(1);
        setHasMoreMessages(true);
        setIsInitialLoad(true);
        
        const [historyError, historyData] = await catchError(authFetch({
          path: `/book/${bookId}/character/${characterId}/messages?page=1&limit=20`,
          method: 'GET'
        }));
        if (historyData) {
          // Ensure messages is always an array
          const messages = Array.isArray(historyData.messages) ? historyData.messages : [];
          const currentHistory = Array.isArray(chatHistory) ? chatHistory : [];
          
          const newMessages = messages.filter(msg => 
            !currentHistory.some(existingMsg => 
              existingMsg.timestamp === msg.timestamp && 
              existingMsg.modelResponse === msg.modelResponse
            )
          );
          if (newMessages.length > 0) {
            setDelayedResponse({
              modelResponse: newMessages[0].modelResponse,
              timestamp: newMessages[0].timestamp
            });
            setChatLoading(false);
            setTimeout(() => {
              setChatHistory(messages);
              if (historyData.pagination) {
                setHasMoreMessages(historyData.pagination.hasMore);
                setMessagePage(historyData.pagination.page);
              }
              setDelayedResponse(null);
            }, getRandomDelay());
          }
        }
        if (historyError) {
          console.error('Error fetching chat history:', historyError);
          toast.error('Error updating chat history');
          setChatLoading(false);
        }
      } else {
        toast.error('No response received from character');
        setChatLoading(false);
      }
    }
    if (error) {
      handleChatError(error);
    }
  };

  const startVoice = async () => {
    try {
      await voice.startListening();
    } catch (err) {
      toast.error(err?.name === 'NotAllowedError'
        ? 'Allow microphone access in your browser to talk to characters'
        : 'Could not start the microphone');
    }
  };

  // Sends what the reader said; the reply is shown and spoken as it streams in.
  const sendVoice = async () => {
    if (chatLoading) return;
    const timestamp = new Date().toISOString();
    const updateTurn = (update) => setChatHistory(prev => prev.map(msg => msg.voiceTurn ? { ...msg, ...update } : msg));
    setChatHistory(prev => [...prev, { voiceTurn: true, voicePending: true, timestamp, pageNumber: currentPage }]);
    setChatLoading(true);
    setDelayedResponse({ modelResponse: null, timestamp });

    try {
      const transcript = await voice.finishListening(true);
      if (!transcript) {
        setChatHistory(prev => prev.filter(msg => !msg.voiceTurn));
        if (transcript === '') toast.info("Didn't catch that. Try again a little closer to the microphone.");
        return;
      }
      updateTurn({ voicePending: false, userMessage: transcript });
      const reply = await voice.sendTurn(transcript, currentPage, (text) => {
        setDelayedResponse(null);
        updateTurn({ modelResponse: text, streaming: true });
      });
      updateTurn({ modelResponse: reply.message, suggestions: reply.suggestions, streaming: false, voiceTurn: false });
    } catch (error) {
      setChatHistory(prev => prev.filter(msg => !msg.voiceTurn));
      handleChatError(error);
    } finally {
      setDelayedResponse(null);
      setChatLoading(false);
    }
  };

  // Sent automatically at the time limit, or when the recogniser stops by itself.
  useEffect(() => {
    if (voice.isListening && (voice.listenSeconds >= MAX_RECORDING_SECONDS || voice.endedOnItsOwn)) sendVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.isListening, voice.listenSeconds, voice.endedOnItsOwn]);

  const speak = (text) => {
    voice.toggleSpeak(text).catch(err => {
      if (err?.message && /tokens|upgrade your subscription/i.test(err.message)) setShowUsageExhaustedModal(true);
      else toast.error(err?.message || 'Could not play this message');
    });
  };

  const formatSeconds = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  const menuButton = (
    <button
      type="button"
      className="header-icon-button book-bar-end"
      onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
      aria-label="Open menu"
      aria-expanded={headerMenuOpen}
    >
      <Menu size={20} />
    </button>
  );

  // Only show layout skeleton while loading; no "getting ready" copy.
  if (loading) return (
    <>
      <Navbar isOpen={headerMenuOpen} onClose={() => setHeaderMenuOpen(false)} />
      <BookHeader book={book}>{menuButton}</BookHeader>
      <CharacterChatSkeleton />
    </>
  );
  if (!character) return <p>Uh oh, looks like they don't want to chat.</p>

  return (
    <>
      {/* Navbar - controlled by hamburger button */}
      <Navbar isOpen={headerMenuOpen} onClose={() => setHeaderMenuOpen(false)} />
      
      <BookHeader book={book}>{menuButton}</BookHeader>
      <div className="character-chat">
        {/* Desktop Left Panel */}
        <div className="character-chat__desktop-panel">
          <img
            className="character-chat__desktop-image"
            src={thumbUrl(character?.image_url, 400)}
            alt={character?.firstName}
          />
          <div className="character-chat__profile">
            <div className="character-chat__profile-content">
              <div className="character-chat__info">
                <h2 className="character-chat__name">{character?.firstName} {character?.lastName}</h2>
                <Link 
                  to={`/books/${book?._id}`} 
                  className="character-chat__book-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Book size={16} />
                  <span className="character-chat__book-title">{book?.title}</span>
                  <ExternalLink size={14} />
                </Link>
                <div className="character-chat__status">
                  {currentPage ? (
                    <Link 
                      to={`/books/${bookId}/page/${currentPage}`}
                      className="character-chat__page-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>{character.firstName} is responding live from page {currentPage}</span>
                      <ExternalLink size={14} />
                    </Link>
                  ) : (
                    <div className="character-chat__status-text">
                      <MessageCircle size={16} />
                      <span>
                        {!user ? 'Login to chat' : 'Ready to chat'}
                      </span>
                    </div>
                  )}
                </div>
                {character?.intro && (
                  <p className="character-chat__intro">{character.intro}</p>
                )}
              </div>
            </div>
          </div>

          <div className="character-chat__details">
            {character?.description && (
              <div className="character-chat__details-section">
                <h3 className="character-chat__details-title">
                  <MessageCircle size={16} />
                  Description
                </h3>
                <p className="character-chat__description">{character.description}</p>
              </div>
            )}

            {character?.appearance && (
              <div className="character-chat__details-section">
                <h3 className="character-chat__details-title">
                  <User size={16} />
                  Appearance
                </h3>
                <p className="character-chat__description">{character.appearance}</p>
              </div>
            )}

            {character?.personalityTraits?.length > 0 && (
              <div className="character-chat__details-section">
                <h3 className="character-chat__details-title">
                  <Heart size={16} />
                  Personality
                </h3>
                <ul className="character-chat__details-list">
                  {character.personalityTraits.map((trait, index) => (
                    <li key={index} className="character-chat__details-item">{trait}</li>
                  ))}
                </ul>
              </div>
            )}

            {character?.strengths?.length > 0 && (
              <div className="character-chat__details-section">
                <h3 className="character-chat__details-title">
                  <Star size={16} />
                  Strengths
                </h3>
                <ul className="character-chat__details-list">
                  {character.strengths.map((strength, index) => (
                    <li key={index} className="character-chat__details-item">{strength}</li>
                  ))}
                </ul>
              </div>
            )}

            {character?.weaknesses?.length > 0 && (
              <div className="character-chat__details-section">
                <h3 className="character-chat__details-title">
                  <Shield size={16} />
                  Weaknesses
                </h3>
                <ul className="character-chat__details-list">
                  {character.weaknesses.map((weakness, index) => (
                    <li key={index} className="character-chat__details-item">{weakness}</li>
                  ))}
                </ul>
              </div>
            )}

            {character?.goals?.length > 0 && (
              <div className="character-chat__details-section">
                <h3 className="character-chat__details-title">
                  <Target size={16} />
                  Goals
                </h3>
                <ul className="character-chat__details-list">
                  {character.goals.map((goal, index) => (
                    <li key={index} className="character-chat__details-item">{goal}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Chat */}
        <div className="character-chat__content">
          {/* Mobile Profile */}
          <div className="character-chat__mobile-profile">
            <div className="character-chat__profile">
              <div className="character-chat__profile-content">
                <div className={`character-chat__avatar-container ${currentPage ? 'character-chat__avatar-container--active' : ''}`}>
                  <img
                    className="character-chat__avatar"
                    src={thumbUrl(character?.image_url, 100)}
                    alt={character?.firstName}
                  />
                  {currentPage && (
                    <div className="character-chat__active-indicator">
                      <span className="character-chat__pulse"></span>
                    </div>
                  )}
                </div>
                <div className="character-chat__info">
                  <h2 className="character-chat__name">{character?.firstName} {character?.lastName}</h2>
                  <Link 
                    to={`/books/${book?._id}`} 
                    className="character-chat__book-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Book size={16} />
                    <span className="character-chat__book-title">{book?.title}</span>
                    <ExternalLink size={14} />
                  </Link>
                  <div className="character-chat__status">
                    {currentPage ? (
                      <Link 
                        to={`/books/${bookId}/page/${currentPage}`}
                        className="character-chat__page-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>{character.firstName} is responding live from page {currentPage}</span>
                        <ExternalLink size={14} />
                      </Link>
                    ) : (
                      <div className="character-chat__status-text">
                        <MessageCircle size={16} />
                        <span>
                          {!user ? 'Login to chat' : 'Ready to chat'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!user ? (
            <div className="character-chat__empty-state">
              <div className="character-chat__empty-icon">
                <MessageCircle size={72} />
              </div>
              <h2 className="character-chat__empty-title">Talk with {character?.firstName}</h2>
              <p className="character-chat__empty-text">Sign in to start your conversation. It's free to begin.</p>
              <div className="character-chat__empty-buttons">
                <NavLink to="/login" className="character-chat__empty-button character-chat__empty-button--primary" state={{ from: window.location.pathname }}>
                  <LogIn size={18} />
                  Sign in
                </NavLink>
                <NavLink to="/search" className="character-chat__empty-button character-chat__empty-button--secondary">
                  <Search size={18} />
                  Browse books
                </NavLink>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Messages */}
              <div className="character-chat__messages" onScroll={handleScroll}>
                <div className="character-chat__messages-container" ref={messagesContainerRef}>
                  {/* Loading indicator for older messages */}
                  {isLoadingOlderMessages && (
                    <div className="character-chat__loading-older" style={{ padding: '16px', textAlign: 'center' }}>
                      <div className="character-chat__typing">
                        <div className="character-chat__typing-dot"></div>
                        <div className="character-chat__typing-dot"></div>
                        <div className="character-chat__typing-dot"></div>
                      </div>
                      <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Loading older messages...
                      </p>
                    </div>
                  )}
                  
                  {/* Character Intro Message */}
                  <div className="character-chat__message character-chat__message--ai">
                    <div className="character-chat__message-avatar-container">
                      <img 
                        src={thumbUrl(character?.image_url, 100)} 
                        alt={character?.firstName}
                        className="character-chat__message-avatar"
                      />
                    </div>
                    <div className="character-chat__message-content">
                      <p>{character?.intro}</p>
                    </div>
                  </div>
                  {(Array.isArray(chatHistory) ? chatHistory : [])
                    .filter(msg => msg.timestamp)
                    .map((msg, index) => (
                      <div key={index}>
                        {(msg.userMessage || msg.voicePending) && (
                          <div className="character-chat__message character-chat__message--user">
                            <div className="character-chat__message-content character-chat__message-content--user">
                              {msg.voicePending ? (
                                <p className="character-chat__voice-pending"><Mic size={14} /> Voice message…</p>
                              ) : (
                                <p>{msg.userMessage}</p>
                              )}
                              {msg.pageNumber && (
                                <div className="character-chat__message-meta character-chat__message-meta--user">
                                  <Link 
                                    to={`/books/${bookId}/page/${msg.pageNumber}`}
                                    className="character-chat__page-indicator"
                                  >
                                    <Book size={14} />
                                    {msg.pageNumber}
                                  </Link>
                                </div>
                              )}
                            </div>
                            <div className="character-chat__message-avatar-container">
                              <img 
                                src={thumbUrl(user?.profileImage || "https://ui-avatars.com/api/?name=" + (user?.name || "User"), 100)}
                                alt="User"
                                className="character-chat__message-avatar"
                              />
                            </div>
                          </div>
                        )}
                        {msg.modelResponse && (
                          <div className="character-chat__message character-chat__message--ai">
                            <div className="character-chat__message-avatar-container">
                              <img 
                                src={thumbUrl(character?.image_url, 100)} 
                                alt={character?.firstName}
                                className="character-chat__message-avatar"
                              />
                            </div>
                            <div className="character-chat__message-content">
                              <p>{msg.modelResponse}</p>
                            </div>
                            {!msg.streaming && (
                            <button
                              type="button"
                              className={`character-chat__speak-button${voice.speakingText === msg.modelResponse ? ' is-speaking' : ''}`}
                              onClick={() => speak(msg.modelResponse)}
                              disabled={voice.loadingText === msg.modelResponse}
                              aria-label={voice.speakingText === msg.modelResponse ? 'Stop speaking' : `Hear this in ${character?.firstName || 'their'}'s voice`}
                              title={voice.speakingText === msg.modelResponse ? 'Stop' : 'Listen'}
                            >
                              {voice.loadingText === msg.modelResponse
                                ? <span className="character-chat__speak-spinner" />
                                : voice.speakingText === msg.modelResponse ? <Square size={14} /> : <Volume2 size={16} />}
                            </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  {delayedResponse && (
                    <div className="character-chat__message character-chat__message--ai">
                      <div className="character-chat__message-avatar-container">
                        <img 
                          src={thumbUrl(character?.image_url, 100)} 
                          alt={character?.firstName}
                          className="character-chat__message-avatar"
                        />
                      </div>
                      <div className="character-chat__typing">
                        <div className="character-chat__typing-dot"></div>
                        <div className="character-chat__typing-dot"></div>
                        <div className="character-chat__typing-dot"></div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>

              {/* Chat Input */}
              <div className="character-chat__input-container">
                {Array.isArray(chatHistory) && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].suggestions?.length > 0 && (
                  <div className="character-chat__suggestions">
                    {chatHistory[chatHistory.length - 1].suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        className="character-chat__suggestion-button"
                        onClick={() => sendPromptDirect(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                <div className="character-chat__input-wrapper">
                  {voice.isListening ? (
                    <>
                      <button
                        type="button"
                        className="character-chat__voice-cancel"
                        onClick={() => voice.finishListening(false)}
                        aria-label="Cancel recording"
                      >
                        <X size={18} />
                      </button>
                      <div className="character-chat__recording" aria-live="polite">
                        <span className="character-chat__recording-dot" />
                        <span className="character-chat__recording-time">{formatSeconds(voice.listenSeconds)}</span>
                        <span className={`character-chat__recording-hint${voice.liveTranscript ? ' has-transcript' : ''}`}>
                          {MAX_RECORDING_SECONDS - voice.listenSeconds <= 10
                            ? `Sending in ${Math.max(0, Math.ceil(MAX_RECORDING_SECONDS - voice.listenSeconds))}s`
                            : voice.liveTranscript.length > 70
                              ? `…${voice.liveTranscript.slice(-70)}`
                              : voice.liveTranscript || 'Listening…'}
                        </span>
                      </div>
                      <button className="character-chat__send-button" onClick={sendVoice} aria-label="Send voice message">
                        <Send size={20} />
                      </button>
                    </>
                  ) : (
                    <>
                      <textarea
                        ref={textareaRef}
                        className="character-chat__input"
                        value={prompt}
                        placeholder={`Message ${character?.firstName}...`}
                        onKeyDown={handleKeyPress}
                        onChange={(e) => {
                          setPrompt(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                        }}
                        rows="1"
                      />
                      {canUseVoice && !prompt.trim() && !chatLoading ? (
                        <button
                          className="character-chat__send-button"
                          onClick={startVoice}
                          aria-label={`Talk to ${character?.firstName || 'this character'}`}
                          title="Talk out loud"
                        >
                          <Mic size={20} />
                        </button>
                      ) : (
                        <button
                          className="character-chat__send-button"
                          onClick={sendPrompt}
                          disabled={chatLoading || !prompt.trim()}
                        >
                          <Send size={20} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Usage Exhausted Modal */}
      <UsageExhaustedModal 
        isOpen={showUsageExhaustedModal} 
        onClose={handleUsageModalClose} 
      />
    </>
  );
}
