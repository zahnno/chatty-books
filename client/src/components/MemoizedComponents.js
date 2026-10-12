import React from 'react';

// Memoized BookListHorizontal to prevent unnecessary re-renders
export const MemoizedBookListHorizontal = React.memo(({ title, books, handleClick, handleAction }) => {
  const BookListHorizontal = require('./BookListHorizontal').default;
  return (
    <BookListHorizontal 
      title={title}
      books={books}
      handleClick={handleClick}
      handleAction={handleAction}
    />
  );
});

// Memoized FeaturedBookCarousel
export const MemoizedFeaturedBookCarousel = React.memo(({ books, handleClick, user }) => {
  const FeaturedBookCarousel = require('./FeaturedBookCarousel').default;
  return (
    <FeaturedBookCarousel 
      books={books} 
      handleClick={handleClick}
      user={user}
    />
  );
});

// Memoized TopCharacters
export const MemoizedTopCharacters = React.memo(({ characters }) => {
  const TopCharacters = require('./TopCharacters').default;
  return <TopCharacters characters={characters} />;
});

// Memoized HeroSection
export const MemoizedHeroSection = React.memo(({ books }) => {
  const HeroSection = require('./HeroSection').default;
  return <HeroSection books={books} />;
});

// Custom hook for performance monitoring
export const usePerformanceMonitor = (componentName) => {
  React.useEffect(() => {
    const startTime = performance.now();
    return () => {
      const endTime = performance.now();
      if (process.env.NODE_ENV === 'development') {
        console.log(`${componentName} render time: ${endTime - startTime}ms`);
      }
    };
  });
}; 