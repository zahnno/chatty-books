import React from 'react';
import { SkeletonBlock, SkeletonText } from './Skeleton';
import '../../styles/skeletons/BookReaderSkeleton.css';

export default function BookReaderSkeleton() {
  return (
    <div className="skeleton-reader">
      <div className="skeleton-reader__content">
        <div className="skeleton-reader__page">
          <SkeletonBlock width="100%" height={24} style={{ marginBottom: 16 }} />
          <SkeletonText lines={8} />
          <SkeletonText lines={6} style={{ marginTop: 24 }} />
          <SkeletonText lines={5} style={{ marginTop: 24 }} />
        </div>
      </div>
    </div>
  );
}
