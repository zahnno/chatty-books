import React from 'react';
import { SkeletonBlock, SkeletonCircle } from './Skeleton';
import '../../styles/skeletons/SettingsPageSkeleton.css';

export default function SettingsPageSkeleton() {
  return (
    <div className="skeleton-settings">
      <div className="skeleton-settings__container">
        <div className="skeleton-settings__profile">
          <SkeletonCircle size={80} style={{ marginBottom: 16 }} />
          <SkeletonBlock width={180} height={24} style={{ marginBottom: 8 }} />
          <SkeletonBlock width={220} height={16} />
        </div>
        <div className="skeleton-settings__section">
          <SkeletonBlock width={140} height={20} style={{ marginBottom: 16 }} />
          <SkeletonBlock width="100%" height={48} style={{ marginBottom: 12, borderRadius: 8 }} />
          <SkeletonBlock width="100%" height={48} style={{ marginBottom: 12, borderRadius: 8 }} />
          <SkeletonBlock width="60%" height={48} style={{ borderRadius: 8 }} />
        </div>
        <div className="skeleton-settings__section">
          <SkeletonBlock width={120} height={20} style={{ marginBottom: 16 }} />
          <SkeletonBlock width="100%" height={48} style={{ marginBottom: 12, borderRadius: 8 }} />
          <SkeletonBlock width="100%" height={48} style={{ borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );
}
