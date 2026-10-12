import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, MessageCircle, Search, Image as ImageIcon } from 'react-feather';
import { authFetch, catchError } from '../utils.js';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useGalleryImages, QUERY_KEYS } from '../hooks/useApi';
import { MODERATION_EVENT } from './Moderation';
import ImageViewer from './ImageViewer';
import LazyImage from './LazyImage';
import GallerySkeleton from './skeletons/GallerySkeleton';
import { thumbUrl } from '@talkingbook/shared';

function getGallerySpanClass(index) {
  const pattern = index % 11;
  switch (pattern) {
    case 0:
      return 'gallery-item-large';
    case 4:
      return 'gallery-item-wide';
    case 7:
      return 'gallery-item-tall';
    default:
      return '';
  }
}

const Gallery = () => {
  const queryClient = useQueryClient();
  const { data: firstPageData, isLoading: firstPageLoading } = useGalleryImages(1);
  const [moreImages, setMoreImages] = useState([]);
  const [nextPage, setNextPage] = useState(2);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { imageId } = useParams();

  const firstImages = firstPageData?.images ?? [];
  const images = [...firstImages, ...moreImages];
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredImages = useMemo(() => {
    if (!normalizedQuery) return images;
    return images.filter((image) => {
      const searchableText = [
        image.prompt,
        image.paragraphText,
        image.style,
        image.book?.title,
        image.book?.author,
        image.user?.username,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [images, normalizedQuery]);

  // Reported scenes and blocked readers' scenes leave the grid immediately.
  useEffect(() => {
    const onModeration = ({ detail = {} }) => {
      const hide = (img) => img._id === detail.imageId || (detail.blockedUserId && img.user?._id === detail.blockedUserId);
      queryClient.setQueryData(QUERY_KEYS.GALLERY(1), (old) =>
        old?.images ? { ...old, images: old.images.filter((img) => !hide(img)) } : old
      );
      setMoreImages((prev) => prev.filter((img) => !hide(img)));
    };
    window.addEventListener(MODERATION_EVENT, onModeration);
    return () => window.removeEventListener(MODERATION_EVENT, onModeration);
  }, [queryClient]);

  useEffect(() => {
    if (firstPageData?.pagination) {
      setHasMore(firstPageData.pagination.hasMore);
    }
  }, [firstPageData?.pagination]);

  const fetchMoreImages = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const [error, data] = await catchError(authFetch({
        path: `/gallery/images?page=${nextPage}&limit=20`,
        method: 'GET',
        requireAuth: false
      }));
      if (error) {
        console.error('Error fetching more images:', error);
        return;
      }
      setMoreImages(prev => {
        const existingIds = new Set([...firstImages, ...prev].map(img => img._id));
        const newImages = (data.images || []).filter(img => !existingIds.has(img._id));
        return [...prev, ...newImages];
      });
      setHasMore(data.pagination?.hasMore ?? false);
      setNextPage(n => n + 1);
    } catch (err) {
      console.error('Error fetching more images:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextPage, firstImages]);

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore) fetchMoreImages();
  }, [hasMore, loadingMore, fetchMoreImages]);

  const updateImageLike = (img, targetId, isLiked, likeCount) =>
    img._id === targetId ? { ...img, isLiked, likeCount } : img;

  const handleLike = async (e, image) => {
    e.stopPropagation();
    if (!user) {
      navigate('/login');
      return;
    }
    const previousState = { isLiked: image.isLiked, likeCount: image.likeCount };
    const nextLiked = !image.isLiked;
    const nextCount = image.isLiked ? image.likeCount - 1 : image.likeCount + 1;

    if (firstImages.some((img) => img._id === image._id)) {
      queryClient.setQueryData(QUERY_KEYS.GALLERY(1), (old) =>
        old
          ? {
              ...old,
              images: (old.images || []).map((img) =>
                updateImageLike(img, image._id, nextLiked, nextCount)
              ),
            }
          : old
      );
    } else {
      setMoreImages((prev) =>
        prev.map((img) => updateImageLike(img, image._id, nextLiked, nextCount))
      );
    }

    try {
      const [error] = await catchError(authFetch({
        path: `/gallery/images/${image._id}/like`,
        method: 'POST',
        requireAuth: true
      }));
      if (error) {
        if (firstImages.some((img) => img._id === image._id)) {
          queryClient.setQueryData(QUERY_KEYS.GALLERY(1), (old) =>
            old
              ? {
                  ...old,
                  images: (old.images || []).map((img) =>
                    updateImageLike(img, image._id, previousState.isLiked, previousState.likeCount)
                  ),
                }
              : old
          );
        } else {
          setMoreImages((prev) =>
            prev.map((img) =>
              updateImageLike(img, image._id, previousState.isLiked, previousState.likeCount)
            )
          );
        }
      }
    } catch (err) {
      if (firstImages.some((img) => img._id === image._id)) {
        queryClient.setQueryData(QUERY_KEYS.GALLERY(1), (old) =>
          old
            ? {
                ...old,
                images: (old.images || []).map((img) =>
                  updateImageLike(img, image._id, previousState.isLiked, previousState.likeCount)
                ),
              }
            : old
        );
      } else {
        setMoreImages((prev) =>
          prev.map((img) =>
            updateImageLike(img, image._id, previousState.isLiked, previousState.likeCount)
          )
        );
      }
    }
  };

  // Handle comment click - navigate to image viewer
  const handleCommentClick = (e, image) => {
    e.stopPropagation(); // Prevent double navigation
    handleImageClick(image);
  };

  // Handle image click - navigate to single image viewer
  const handleImageClick = (image) => {
    // Save scroll position to sessionStorage before navigating
    const scrollPosition = window.scrollY || document.documentElement.scrollTop;
    sessionStorage.setItem('galleryScrollPosition', scrollPosition.toString());
    // Pass the image data to avoid refetching
    navigate(`/gallery/image/${image._id}`, { 
      state: { image, allImages: images } 
    });
  };


  // Restore scroll position when returning from ImageViewer
  useEffect(() => {
    // Only restore scroll if we're not viewing an image and we have images rendered
    if (!imageId && images.length > 0) {
      const savedScrollPosition = sessionStorage.getItem('galleryScrollPosition');
      if (savedScrollPosition) {
        // Wait for images to render, then restore scroll position
        const timeoutId = setTimeout(() => {
          window.scrollTo({
            top: parseInt(savedScrollPosition, 10),
            behavior: 'instant' // Instant scroll, not smooth
          });
          // Clear the saved position after restoring
          sessionStorage.removeItem('galleryScrollPosition');
        }, 100); // Small delay to ensure DOM is updated

        return () => clearTimeout(timeoutId);
      }
    }
  }, [imageId, images.length]);

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - 1000) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMore]);

  if (firstPageLoading && images.length === 0) {
    return (
      <div className="gallery-container">
        <header className="gallery-header">
          <span className="ui-section-eyebrow">Community</span>
          <h1 className="ui-page-title">Gallery</h1>
          <p className="ui-page-subtitle">
            Scenes and short films readers have made from the books they're reading.
          </p>
          <div className="ui-search gallery-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search by book, author, style, or prompt"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search gallery images"
            />
          </div>
        </header>
        <GallerySkeleton />
      </div>
    );
  }

  return (
    <>
      <div className="gallery-container">
        <header className="gallery-header">
          <span className="ui-section-eyebrow">Community</span>
          <h1 className="ui-page-title">Gallery</h1>
          <p className="ui-page-subtitle">
            Scenes and short films readers have made from the books they're reading.
          </p>
          <div className="ui-search gallery-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search by book, author, style, or prompt"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search gallery images"
            />
          </div>
          {searchQuery && (
            <p className="gallery-hero-meta">
              {filteredImages.length} of {images.length} images
            </p>
          )}
        </header>

        <div className="gallery-grid">
          {filteredImages.map((image, index) => (
            <div
              key={image._id}
              className={`gallery-item ${getGallerySpanClass(index)}`}
              onClick={() => handleImageClick(image)}
            >
              <div className="gallery-image-container">
                {image.mediaType === 'video' ? (
                  <video
                    src={image.videoUrl}
                    className="gallery-image"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <LazyImage
                    src={thumbUrl(image.imageUrl, 200)}
                    alt={image.prompt || 'Gallery image'}
                    className="gallery-image"
                  />
                )}
                {/* Hover overlay with actions */}
                <div className="gallery-overlay">
                  <div className="gallery-overlay-content">
                    {/* Book and description info */}
                    <div className="gallery-info-hover">
                      {image.book && (
                        <div className="gallery-book-info-hover">
                          <h4 className="gallery-book-title-hover">{image.book.title}</h4>
                          <p className="gallery-book-author-hover">by {image.book.author}</p>
                        </div>
                      )}
                      {image.paragraphText && (
                        <p className="gallery-description-hover">{image.paragraphText}</p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="gallery-actions">
                      <button
                        className={`gallery-action-btn ${image.isLiked ? 'liked' : ''}`}
                        onClick={(e) => handleLike(e, image)}
                        title={image.isLiked ? 'Unlike' : 'Like'}
                      >
                        <Heart size={18} fill={image.isLiked ? 'currentColor' : 'none'} />
                        <span>{image.likeCount || 0}</span>
                      </button>
                      
                      <button
                        className="gallery-action-btn"
                        onClick={(e) => handleCommentClick(e, image)}
                        title="View comments"
                      >
                        <MessageCircle size={18} />
                        <span>{image.commentCount || 0}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!firstPageLoading && filteredImages.length === 0 && images.length > 0 && (
          <div className="gallery-empty-search">
            <ImageIcon size={28} />
            <p>No images match your search yet.</p>
          </div>
        )}

        {loadingMore && (
          <div className="gallery-loading-more">
            <div className="loading-spinner"></div>
            <p>Loading more</p>
          </div>
        )}

        {!hasMore && images.length > 0 && (
          <div className="gallery-end">
            <p>You're all caught up.</p>
          </div>
        )}
      </div>

      {/* Image Viewer Overlay */}
      {imageId && <ImageViewer />}
    </>
  );
};

export default Gallery;
