import React from 'react';
import { SkeletonBlock, SkeletonText } from './Skeleton';
import '../../styles/skeletons/CharacterListSkeleton.css';

export default function CharacterListSkeleton() {
  return (
    <div className="cl-skeleton">
      <div className="cl-skeleton__grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="cl-skeleton__card">
            <div className="cl-skeleton__card-image">
              <SkeletonBlock height="100%" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
            </div>
            <div className="cl-skeleton__card-content">
              <SkeletonBlock width="80%" height={22} style={{ marginBottom: 8, borderRadius: 4 }} />
              <SkeletonBlock width="50%" height={14} style={{ marginBottom: 12, borderRadius: 4 }} />
              <SkeletonText lines={2} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
