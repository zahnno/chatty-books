import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Send, X, MessageCircle, LogIn } from 'react-feather';
import { catchError, authFetch } from '../utils.js';
import { toast } from 'react-toastify';
import { useChatHistory } from '../hooks/useApi';
import UsageExhaustedModal from './UsageExhaustedModal';
import '../styles/MiniCharacterChat.css';
import { thumbUrl } from '@talkingbook/shared';

export default function MiniCharacterChat({
  character,
  bookId,
  currentPage,
  user,
  isDarkMode,
  onClose,
  index = 0,
}) {
  const characterId = character?._id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const chatHistoryQuery = useChatHistory(bookId, characterId, 1, {
    enabled: !!(user && bookId && characterId),
    staleTime: 5 * 60 * 1000, // 5 min so reopen shows cache without refetch
  });
  const chatHistory = Array.isArray(chatHistoryQuery.data?.messages) ? chatHistoryQuery.data.messages : [];
  const [prompt, setPrompt] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [delayedResponse, setDelayedResponse] = useState(null);
  const [showUsageExhaustedModal, setShowUsageExhaustedModal] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState(null);
  const chatEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const canChat = !!user;

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getRandomDelay = () => {
    const delays = [50, 100, 150];
    return delays[Math.floor(Math.random() * delays.length)];
  };

  const setChatHistoryCache = (messages, pagination) => {
    queryClient.setQueryData(['chatHistory', bookId, characterId, 1], (prev) => ({
      ...prev,
      messages: messages ?? prev?.messages,
      pagination: pagination ?? prev?.pagination,
    }));
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, delayedResponse]);

  const handleChatError = (error) => {
    if (error.message === 'No prompt provided') {
      toast.error('Please enter a message');
    } else if (error.message && (
      error.message.toLowerCase().includes('tokens') ||
      error.message.includes('usage limit') ||
      error.message.includes('upgrade your subscription')
    )) {
      setShowUsageExhaustedModal(true);
      setLastFailedMessage(chatHistory[chatHistory.length - 1]);
    } else {
      toast.error(error.message || 'Failed to send message');
    }
    setChatLoading(false);
    setDelayedResponse(null);
  };

  const handleUsageModalClose = () => {
    setShowUsageExhaustedModal(false);
    if (lastFailedMessage) {
      const reverted = chatHistory.slice(0, -1);
      setChatHistoryCache(reverted);
      setDelayedResponse(null);
      setChatLoading(false);
      setLastFailedMessage(null);
    }
  };

  const sendPrompt = async () => {
    if (!prompt.trim() || !canChat) return;
    const timestamp = new Date().toISOString();
    const currentPrompt = prompt;
    const previousMessages = chatHistory;
    const optimisticMessage = { userMessage: currentPrompt, timestamp, pageNumber: currentPage };
    setChatHistoryCache([...previousMessages, optimisticMessage]);
    setPrompt('');
    setChatLoading(true);
    setTimeout(() => {
      setDelayedResponse({ modelResponse: null, timestamp });
    }, 1000);

    const [error, data] = await catchError(authFetch({
      path: `/book/${bookId}/character/${characterId}/chat`,
      method: 'POST',
      body: { prompt: currentPrompt, pageNumber: currentPage },
    }));

    if (error) {
      setChatHistoryCache(previousMessages);
      handleChatError(error);
      return;
    }

    if (data?.message) {
      const [historyError, historyData] = await catchError(authFetch({
        path: `/book/${bookId}/character/${characterId}/messages?page=1&limit=20`,
        method: 'GET',
      }));
      if (historyData && Array.isArray(historyData.messages)) {
        const messages = historyData.messages;
        const newMessages = messages.filter(
          (msg) => !previousMessages.some(
            (existing) => existing.timestamp === msg.timestamp && existing.modelResponse === msg.modelResponse
          )
        );
        if (newMessages.length > 0) {
          setDelayedResponse({
            modelResponse: newMessages[0].modelResponse,
            timestamp: newMessages[0].timestamp,
          });
          setChatLoading(false);
          setTimeout(() => {
            setChatHistoryCache(messages, historyData.pagination);
            setDelayedResponse(null);
          }, getRandomDelay());
        } else {
          setChatHistoryCache(messages, historyData.pagination);
          setChatLoading(false);
          setDelayedResponse(null);
        }
      } else {
        if (historyError) toast.error('Error updating chat');
        setChatLoading(false);
        setDelayedResponse(null);
      }
    } else {
      setChatLoading(false);
      setDelayedResponse(null);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  };

  if (!character) return null;

  const displayName = [character.firstName, character.lastName].filter(Boolean).join(' ') || 'Character';

  const goToCharacterChat = () => {
    navigate(`/books/${bookId}/view/characters/${characterId}`, {
      state: { currentPage: currentPage || undefined },
    });
  };

  return (
    <>
      <div
        className={`mini-character-chat ${isDarkMode ? 'dark-mode' : ''}`}
        style={{ '--chat-index': index }}
      >
        <div className="mini-character-chat__header">
          <button
            type="button"
            className="mini-character-chat__header-link"
            onClick={goToCharacterChat}
            aria-label={`Open full chat with ${displayName}`}
          >
            <img
              src={thumbUrl(character.image_url, 100)}
              alt=""
              className="mini-character-chat__avatar"
            />
            <span className="mini-character-chat__name">{displayName}</span>
          </button>
          <div className="mini-character-chat__header-actions">
            <button
              type="button"
              className="mini-character-chat__btn-icon mini-character-chat__btn-close"
              onClick={onClose}
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mini-character-chat__body">
            {!user ? (
              <div className="mini-character-chat__gate">
                <MessageCircle size={32} />
                <p>Sign in to chat with {displayName}</p>
                <button
                  type="button"
                  className="mini-character-chat__gate-btn"
                  onClick={() => navigate('/login', { state: { from: window.location.pathname } })}
                >
                  <LogIn size={16} />
                  Sign in
                </button>
              </div>
            ) : (
              <>
                <div className="mini-character-chat__messages" ref={messagesContainerRef}>
                  {character?.intro && (
                    <div className="mini-character-chat__message mini-character-chat__message--ai">
                      <img
                        src={thumbUrl(character.image_url, 100)}
                        alt=""
                        className="mini-character-chat__msg-avatar"
                      />
                      <div className="mini-character-chat__bubble mini-character-chat__bubble--ai">
                        <p>{character.intro}</p>
                      </div>
                    </div>
                  )}
                  {(Array.isArray(chatHistory) ? chatHistory : [])
                    .filter((msg) => msg.timestamp)
                    .map((msg, i) => (
                      <React.Fragment key={i}>
                        {msg.userMessage && (
                          <div className="mini-character-chat__message mini-character-chat__message--user">
                            <div className="mini-character-chat__bubble mini-character-chat__bubble--user">
                              <p>{msg.userMessage}</p>
                            </div>
                          </div>
                        )}
                        {msg.modelResponse && (
                          <div className="mini-character-chat__message mini-character-chat__message--ai">
                            <img
                              src={thumbUrl(character.image_url, 100)}
                              alt=""
                              className="mini-character-chat__msg-avatar"
                            />
                            <div className="mini-character-chat__bubble mini-character-chat__bubble--ai">
                              <p>{msg.modelResponse}</p>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  {delayedResponse && (
                    <div className="mini-character-chat__message mini-character-chat__message--ai">
                      <img
                        src={thumbUrl(character.image_url, 100)}
                        alt=""
                        className="mini-character-chat__msg-avatar"
                      />
                      <div className="mini-character-chat__typing">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="mini-character-chat__input-wrap">
                  <input
                    type="text"
                    className="mini-character-chat__input"
                    placeholder="Message..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyPress}
                    disabled={chatLoading}
                  />
                  <button
                    type="button"
                    className="mini-character-chat__send"
                    onClick={sendPrompt}
                    disabled={chatLoading || !prompt.trim()}
                    aria-label="Send"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
      </div>

      <UsageExhaustedModal
        isOpen={showUsageExhaustedModal}
        onClose={handleUsageModalClose}
      />
    </>
  );
}
