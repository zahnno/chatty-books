import React from 'react';
import { SkeletonBlock, SkeletonCard } from './Skeleton';
import '../../styles/skeletons/SearchBooksSkeleton.css';

export default function SearchBooksSkeleton() {
  return (
    <div className="search-books-skeleton">
      <div className="search-books-skeleton__grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="search-books-skeleton__card">
            <SkeletonBlock className="search-books-skeleton__cover" height={200} />
            <SkeletonBlock width="90%" height={16} style={{ marginTop: 12 }} />
            <SkeletonBlock width="60%" height={14} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
