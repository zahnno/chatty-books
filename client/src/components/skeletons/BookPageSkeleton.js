import React from 'react';
import { SkeletonBlock, SkeletonText, SkeletonCircle } from './Skeleton';
import '../../styles/skeletons/BookPageSkeleton.css';

export default function BookPageSkeleton() {
  return (
    <div className="book-page-skeleton">
      <div className="book-page-skeleton__hero">
        <div className="book-page-skeleton__content">
          <div className="book-page-skeleton__cover-wrapper">
            <SkeletonBlock className="book-page-skeleton__cover" height="100%" />
          </div>
          <div className="book-page-skeleton__info">
            <SkeletonBlock width="85%" height={40} style={{ marginBottom: 12 }} />
            <SkeletonBlock width="50%" height={20} style={{ marginBottom: 24 }} />
            <div className="book-page-skeleton__tags">
              <SkeletonBlock width={72} height={32} style={{ borderRadius: 12 }} />
              <SkeletonBlock width={72} height={32} style={{ borderRadius: 12 }} />
              <SkeletonBlock width={72} height={32} style={{ borderRadius: 12 }} />
            </div>
            <SkeletonText lines={4} style={{ marginTop: 24 }} />
            <div className="book-page-skeleton__actions">
              <SkeletonBlock width={200} height={52} style={{ borderRadius: 12 }} />
              <SkeletonBlock width={160} height={52} style={{ borderRadius: 12 }} />
            </div>
            <div className="book-page-skeleton__stats">
              <SkeletonBlock width={40} height={40} style={{ borderRadius: 8 }} />
              <SkeletonBlock width={40} height={40} style={{ borderRadius: 8 }} />
              <SkeletonBlock width={40} height={40} style={{ borderRadius: 8 }} />
            </div>
          </div>
        </div>
      </div>
      <div className="book-page-skeleton__section">
        <SkeletonBlock width={180} height={28} style={{ marginBottom: 24 }} />
        <div className="book-page-skeleton__characters">
          <div className="book-page-skeleton__character-card">
            <SkeletonCircle size={64} />
            <SkeletonBlock width={100} height={16} style={{ marginTop: 8 }} />
          </div>
          <div className="book-page-skeleton__character-card">
            <SkeletonCircle size={64} />
            <SkeletonBlock width={100} height={16} style={{ marginTop: 8 }} />
          </div>
          <div className="book-page-skeleton__character-card">
            <SkeletonCircle size={64} />
            <SkeletonBlock width={100} height={16} style={{ marginTop: 8 }} />
          </div>
          <div className="book-page-skeleton__character-card">
            <SkeletonCircle size={64} />
            <SkeletonBlock width={100} height={16} style={{ marginTop: 8 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
