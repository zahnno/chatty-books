import React from 'react';
import { SkeletonBlock, SkeletonCircle } from './Skeleton';
import '../../styles/skeletons/CharacterChatSkeleton.css';

export default function CharacterChatSkeleton() {
  return (
    <div className="skeleton-character-chat">
      {/* Desktop left panel: image, profile, details */}
      <div className="skeleton-character-chat__desktop-panel">
        <SkeletonBlock
          className="skeleton-character-chat__desktop-image"
          width="100%"
          height={280}
        />
        <div className="skeleton-character-chat__profile">
          <div className="skeleton-character-chat__profile-content">
            <div className="skeleton-character-chat__info">
              <SkeletonBlock width="70%" height={28} style={{ marginBottom: 8 }} />
              <SkeletonBlock width="55%" height={16} style={{ marginBottom: 6 }} />
              <SkeletonBlock width="45%" height={14} style={{ marginBottom: 12 }} />
              <SkeletonBlock width="100%" height={12} style={{ marginBottom: 6 }} />
              <SkeletonBlock width="90%" height={12} />
            </div>
          </div>
        </div>
        <div className="skeleton-character-chat__details">
          <SkeletonBlock width={100} height={16} style={{ marginBottom: 10 }} />
          <SkeletonBlock width="100%" height={12} style={{ marginBottom: 6 }} />
          <SkeletonBlock width="85%" height={12} style={{ marginBottom: 20 }} />
          <SkeletonBlock width={90} height={16} style={{ marginBottom: 10 }} />
          <div className="skeleton-character-chat__pills">
            <SkeletonBlock width={72} height={28} style={{ borderRadius: 12 }} />
            <SkeletonBlock width={88} height={28} style={{ borderRadius: 12 }} />
            <SkeletonBlock width={64} height={28} style={{ borderRadius: 12 }} />
          </div>
        </div>
      </div>

      {/* Right panel: mobile profile + messages + input */}
      <div className="skeleton-character-chat__content">
        {/* Mobile profile bar */}
        <div className="skeleton-character-chat__mobile-profile">
          <div className="skeleton-character-chat__profile">
            <div className="skeleton-character-chat__profile-content">
              <SkeletonCircle size={40} className="skeleton-character-chat__avatar" />
              <div className="skeleton-character-chat__info">
                <SkeletonBlock width={120} height={18} style={{ marginBottom: 6 }} />
                <SkeletonBlock width={90} height={14} />
              </div>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="skeleton-character-chat__messages">
          <div className="skeleton-character-chat__messages-container">
            {/* Intro (AI) message */}
            <div className="skeleton-character-chat__message skeleton-character-chat__message--ai">
              <SkeletonCircle size={32} className="skeleton-character-chat__message-avatar" />
              <div className="skeleton-character-chat__bubble skeleton-character-chat__bubble--ai">
                <SkeletonBlock width="100%" height={12} style={{ marginBottom: 6 }} />
                <SkeletonBlock width="95%" height={12} style={{ marginBottom: 6 }} />
                <SkeletonBlock width="70%" height={12} />
              </div>
            </div>
            {/* User message */}
            <div className="skeleton-character-chat__message skeleton-character-chat__message--user">
              <div className="skeleton-character-chat__bubble skeleton-character-chat__bubble--user">
                <SkeletonBlock width="80%" height={14} />
              </div>
              <SkeletonCircle size={32} className="skeleton-character-chat__message-avatar" />
            </div>
            {/* AI message */}
            <div className="skeleton-character-chat__message skeleton-character-chat__message--ai">
              <SkeletonCircle size={32} className="skeleton-character-chat__message-avatar" />
              <div className="skeleton-character-chat__bubble skeleton-character-chat__bubble--ai">
                <SkeletonBlock width="100%" height={12} style={{ marginBottom: 6 }} />
                <SkeletonBlock width="60%" height={12} />
              </div>
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="skeleton-character-chat__input-container">
          <div className="skeleton-character-chat__input-wrapper">
            <SkeletonBlock
              className="skeleton-character-chat__input-field"
              width="100%"
              height={36}
            />
            <SkeletonBlock
              className="skeleton-character-chat__send-button"
              width={36}
              height={36}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
