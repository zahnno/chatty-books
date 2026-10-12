import React from 'react';
import { SkeletonBlock, SkeletonCard } from './Skeleton';
import '../../styles/skeletons/HomePageSkeleton.css';

export default function HomePageSkeleton() {
  const heroTiles = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="main-container skeleton-home">
      <section className="skeleton-home__hero">
        <div className="skeleton-home__hero-left">
          <div className="skeleton-home__hero-logo-row">
            <SkeletonBlock width={64} height={64} className="skeleton-home__hero-logo" />
            <SkeletonBlock width={240} height={42} className="skeleton-home__hero-app-name" />
          </div>

          <div className="skeleton-home__hero-title">
            <SkeletonBlock width="100%" height={58} style={{ marginBottom: 12 }} />
            <SkeletonBlock width="82%" height={58} />
          </div>

          <div className="skeleton-home__hero-subtitle">
            <SkeletonBlock width="100%" height={20} style={{ marginBottom: 10 }} />
            <SkeletonBlock width="90%" height={20} />
          </div>

          <div className="skeleton-home__hero-cta-row">
            <SkeletonBlock width={150} height={48} className="skeleton-home__hero-cta-primary" />
            <SkeletonBlock width={150} height={48} className="skeleton-home__hero-cta-secondary" />
          </div>
        </div>

        <div className="skeleton-home__hero-right">
          <div className="skeleton-home__hero-books-grid">
            {heroTiles.map((tile) => (
              <SkeletonBlock
                key={tile}
                className={`skeleton-home__hero-book skeleton-home__hero-book-${tile}`}
                height="100%"
              />
            ))}
          </div>
        </div>
      </section>
      <section className="skeleton-home__section">
        <SkeletonBlock width={160} height={24} style={{ marginBottom: 16, marginLeft: 20 }} />
        <div className="skeleton-home__book-row">
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
      <section className="skeleton-home__section">
        <SkeletonBlock width={140} height={24} style={{ marginBottom: 16, marginLeft: 20 }} />
        <div className="skeleton-home__book-row">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
      <section className="skeleton-home__categories">
        <SkeletonBlock width={200} height={28} style={{ marginBottom: 16 }} />
        <div className="skeleton-home__category-buttons">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonBlock key={i} width={80} height={36} style={{ borderRadius: 20 }} />
          ))}
        </div>
        <div className="skeleton-home__book-row" style={{ marginTop: 24 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
