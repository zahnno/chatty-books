import React from 'react';
import { SkeletonBlock } from './Skeleton';
import '../../styles/skeletons/GallerySkeleton.css';

function getGridSpanClass(index) {
  const pattern = index % 11;
  switch (pattern) {
    case 0:
      return 'gallery-skeleton__item--large';
    case 4:
      return 'gallery-skeleton__item--wide';
    case 7:
      return 'gallery-skeleton__item--tall';
    default:
      return '';
  }
}

export default function GallerySkeleton() {
  return (
    <div className="gallery-skeleton">
      <div className="gallery-skeleton__grid">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={`gallery-skeleton__item ${getGridSpanClass(i)}`}
          >
            <div className="gallery-skeleton__image-wrap">
              <SkeletonBlock className="gallery-skeleton__image" height="100%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
