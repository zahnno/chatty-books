import React, { useState, useRef, useEffect, forwardRef } from 'react';

/**
 * LazyImage component that loads images only when they enter the viewport
 * Supports both regular img tags and background images
 */
const LazyImage = forwardRef(({ 
  src, 
  alt = '', 
  className = '', 
  style = {},
  backgroundImage = false,
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"%3E%3Crect fill="%23ddd" width="400" height="400"/%3E%3C/svg%3E',
  onLoad,
  skipLazy = false, // Skip lazy loading for images that should load immediately
  ...props 
}, ref) => {
  const [imageSrc, setImageSrc] = useState(skipLazy && src ? src : placeholder);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(skipLazy);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const combinedRef = ref || imgRef;

  useEffect(() => {
    if (skipLazy) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before image enters viewport
        threshold: 0.01
      }
    );

    const currentRef = backgroundImage ? containerRef.current : combinedRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [backgroundImage, skipLazy, combinedRef]);

  useEffect(() => {
    if (!isInView || !src) return;

    const img = new Image();
    img.onload = () => {
      setImageSrc(src);
      setIsLoaded(true);
      if (onLoad) onLoad();
    };
    img.onerror = () => {
      // Keep placeholder on error
      console.error('Failed to load image:', src);
      setIsLoaded(false);
    };
    img.src = src;
  }, [isInView, src, onLoad]);

  if (backgroundImage) {
    return (
      <div
        ref={containerRef}
        className={`lazy-image-background ${className} ${isLoaded ? 'loaded' : 'loading'}`}
        style={{
          backgroundImage: `url(${imageSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          transition: 'opacity 0.3s ease-in-out',
          opacity: isLoaded ? 1 : 0.7,
          ...style
        }}
        {...props}
      />
    );
  }

  return (
    <img
      ref={combinedRef}
      src={imageSrc}
      alt={alt}
      className={`lazy-image ${className} ${isLoaded ? 'loaded' : 'loading'}`}
      style={{
        transition: 'opacity 0.3s ease-in-out',
        opacity: isLoaded ? 1 : 0.7,
        ...style
      }}
      loading={skipLazy ? undefined : "lazy"}
      {...props}
    />
  );
});

LazyImage.displayName = 'LazyImage';

export default LazyImage;
