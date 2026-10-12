import React from 'react';
import './Skeleton.css';

/**
 * Base skeleton block with optional width/height. Uses CSS animation for shimmer.
 */
export function SkeletonBlock({ width, height, className = '', style = {} }) {
  return (
    <div
      className={`skeleton-block ${className}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton shaped like a book/cover card (e.g. for book lists).
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`skeleton-card ${className}`}>
      <SkeletonBlock className="skeleton-card__cover" height={200} />
      <SkeletonBlock className="skeleton-card__line" height={14} style={{ marginTop: 8 }} />
      <SkeletonBlock className="skeleton-card__line skeleton-card__line--short" height={12} style={{ marginTop: 6 }} />
    </div>
  );
}

/**
 * Skeleton text lines (variable count).
 */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`skeleton-text ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className="skeleton-text__line"
          height={12}
          style={{ marginTop: i === 0 ? 0 : 8 }}
        />
      ))}
    </div>
  );
}

/**
 * Circle skeleton (e.g. avatar).
 */
export function SkeletonCircle({ size = 48, className = '' }) {
  return (
    <div
      className={`skeleton-block skeleton-circle ${className}`}
      style={{ width: size, height: size, borderRadius: '50%' }}
      aria-hidden="true"
    />
  );
}
