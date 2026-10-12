import React from 'react';
import { SkeletonBlock, SkeletonText } from './Skeleton';
import './RouteLoadingFallback.css';

/**
 * Generic fallback for Suspense while a lazy route chunk loads.
 * Shows a lightweight content-area skeleton so navigation feels structured.
 */
export default function RouteLoadingFallback() {
  return (
    <div className="route-loading-fallback">
      <div className="route-loading-fallback__content">
        <SkeletonBlock width={200} height={28} style={{ marginBottom: 24 }} />
        <SkeletonText lines={4} />
        <SkeletonBlock width="80%" height={120} style={{ marginTop: 24, borderRadius: 12 }} />
        <SkeletonText lines={3} style={{ marginTop: 24 }} />
      </div>
    </div>
  );
}
