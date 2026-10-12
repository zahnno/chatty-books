import React from 'react';
import { SkeletonBlock, SkeletonCard } from './Skeleton';
import '../../styles/skeletons/BooksPageSkeleton.css';

export default function BooksPageSkeleton() {
  return (
    <div className="books-page skeleton-books">
      <div className="books-page__content">
        <div className="skeleton-books__hero">
          <SkeletonBlock width={120} height={32} style={{ marginBottom: 8 }} />
          <SkeletonBlock width={280} height={18} />
        </div>
        <div className="books-page__section skeleton-books__section">
          <SkeletonBlock width={180} height={24} style={{ marginBottom: 16, marginLeft: 20 }} />
          <div className="skeleton-books__row">
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
        <div className="books-page__section skeleton-books__section">
          <div className="skeleton-books__library-header">
            <SkeletonBlock width={120} height={24} />
            <SkeletonBlock width={240} height={16} style={{ marginTop: 8 }} />
            <SkeletonBlock width="100%" height={44} style={{ marginTop: 16, borderRadius: 8 }} />
          </div>
          <div className="skeleton-books__row" style={{ marginTop: 24 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
