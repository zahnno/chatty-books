import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Heart, MessageCircle, X, ChevronLeft, ChevronRight, User, Calendar, Book, ExternalLink } from 'react-feather';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authFetch, catchError } from '../utils.js';
import LazyImage from './LazyImage';
import { MoreMenu, ReportDialog, confirmAndBlock, emitModeration } from './Moderation';
import { thumbUrl } from '@talkingbook/shared';

const ImageViewer = () => {
  const { imageId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();

  // Helper function to normalize image data
  const normalizeImageData = (data) => {
    if (!data) return null;
    return {
      ...data,
      comments: Array.isArray(data.comments) ? data.comments : [],
      commentCount: data.commentCount || 0,
      likeCount: data.likeCount || 0
    };
  };

  // Get initial image data from navigation state if available
  const initialImage = normalizeImageData(location.state?.image);
  const allImages = location.state?.allImages;

  const [image, setImage] = useState(initialImage);
  const [loading, setLoading] = useState(!initialImage);
  const [error, setError] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const imageRef = useRef(null);
  const viewerRef = useRef(null);
  const preloadedImages = useRef(new Set());
  const imageCache = useRef({});

  // Helper function to check if text needs truncation
  const shouldTruncateDescription = (text) => {
    const MAX_LENGTH = 150; // Characters to show before truncating
    return text && text.length > MAX_LENGTH;
  };

  const getTruncatedDescription = (text) => {
    const MAX_LENGTH = 150;
    if (!text || text.length <= MAX_LENGTH) return text;
    return text.substring(0, MAX_LENGTH) + '...';
  };

  // Preload image for faster navigation
  const preloadImage = (imageUrl) => {
    if (!imageUrl || preloadedImages.current.has(imageUrl)) return;
    
    const img = new Image();
    img.src = imageUrl;
    preloadedImages.current.add(imageUrl);
  };

  // Fetch image data
  const fetchImage = async (id, options = {}) => {
    const { 
      skipLoading = false,     // Don't show loading spinner
      skipCache = false,       // Bypass cache
      updateState = true       // Update the image state
    } = typeof options === 'boolean' ? { skipLoading: options } : options;

    try {
      // Check cache first (but skip if we need fresh data with comments)
      if (!skipCache && imageCache.current[id]) {
        const cached = imageCache.current[id];
        // Only use cache if it has full data (previousImageId/nextImageId indicates API fetch)
        // Gallery data doesn't have these navigation fields or comments
        if (cached.previousImageId !== undefined || cached.nextImageId !== undefined) {
          if (updateState && !skipLoading) {
            setImage(cached);
            setLoading(false);
          }
          return cached;
        }
      }

      if (!skipLoading) {
        setLoading(true);
      }
      setError(null);

      const [error, data] = await catchError(authFetch({
        path: `/gallery/images/${id}`,
        method: 'GET',
        requireAuth: false
      }));

      if (error) {
        setError('Failed to load image');
        return null;
      }

      // Normalize data to ensure comments is an array
      const normalizedData = {
        ...data,
        comments: Array.isArray(data.comments) ? data.comments : [],
        commentCount: data.commentCount || 0,
        likeCount: data.likeCount || 0
      };

      // Cache the fetched image (complete data with comments)
      imageCache.current[id] = normalizedData;

      // Update state if this is for the current image (not preloading)
      if (updateState) {
        setImage(normalizedData);
      }
      
      return normalizedData;
    } catch (error) {
      console.error('Error fetching image:', error);
      if (!skipLoading) {
        setError('Failed to load image');
      }
      return null;
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  };

  // Preload adjacent images for faster navigation
  const preloadAdjacentImages = React.useCallback(async (currentImage) => {
    if (!currentImage) return;

    // Preload the current image if not already
    if (currentImage.imageUrl) {
      preloadImage(currentImage.imageUrl);
    }

    // Number of images to preload in each direction
    const PRELOAD_COUNT = 5;

    // Helper function to collect image IDs in a chain
    const collectImageChain = async (startImageId, direction, maxCount) => {
      const chain = [];
      let currentId = startImageId;
      let count = 0;

      while (currentId && count < maxCount) {
        chain.push(currentId);
        
        // Fetch the image data to get the next ID in chain (don't update state)
        const data = await fetchImage(currentId, { skipLoading: true, updateState: false });
        if (!data) break;

        currentId = direction === 'next' ? data.nextImageId : data.previousImageId;
        count++;
      }

      return chain;
    };

    try {
      // Collect chains of image IDs in both directions
      const chains = await Promise.all([
        currentImage.nextImageId ? collectImageChain(currentImage.nextImageId, 'next', PRELOAD_COUNT) : Promise.resolve([]),
        currentImage.previousImageId ? collectImageChain(currentImage.previousImageId, 'previous', PRELOAD_COUNT) : Promise.resolve([])
      ]);

      const [nextChain, prevChain] = chains;
      const allImageIds = [...nextChain, ...prevChain];

      // Preload all image URLs in parallel
      allImageIds.forEach(id => {
        const cached = imageCache.current[id];
        if (cached?.imageUrl) {
          preloadImage(cached.imageUrl);
        }
      });
    } catch (error) {
      console.error('Error preloading adjacent images:', error);
    }
  }, []);

  // Handle like/unlike with optimistic update
  const handleLike = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!image) return;

    // Store previous state for rollback if needed
    const previousState = {
      isLiked: image.isLiked,
      likeCount: image.likeCount
    };

    // Optimistically update UI immediately
    setImage(prev => ({
      ...prev,
      isLiked: !prev.isLiked,
      likeCount: prev.isLiked ? prev.likeCount - 1 : prev.likeCount + 1
    }));

    try {
      const [error] = await catchError(authFetch({
        path: `/gallery/images/${image._id}/like`,
        method: 'POST',
        requireAuth: true
      }));

      if (error) {
        console.error('Error toggling like:', error);
        // Rollback on error
        setImage(prev => ({
          ...prev,
          isLiked: previousState.isLiked,
          likeCount: previousState.likeCount
        }));
        return;
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      // Rollback on error
      setImage(prev => ({
        ...prev,
        isLiked: previousState.isLiked,
        likeCount: previousState.likeCount
      }));
    }
  };

  // Handle comment submission
  const handleCommentSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      navigate('/login');
      return;
    }

    if (!newComment.trim() || !image) return;

    setSubmittingComment(true);

    try {
      const [error, data] = await catchError(authFetch({
        path: `/gallery/images/${image._id}/comments`,
        method: 'POST',
        body: { content: newComment.trim() },
        requireAuth: true
      }));

      if (error) {
        console.error('Error adding comment:', error);
        return;
      }

      // Update local state with new comment
      setImage(prev => ({
        ...prev,
        comments: [data, ...(prev.comments || [])],
        commentCount: (prev.commentCount || 0) + 1
      }));

      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  // Navigate to next/previous image with data
  const navigateToImage = React.useCallback((targetImageId) => {
    navigate(`/gallery/image/${targetImageId}`, {
      state: { allImages }
    });
  }, [navigate, allImages]);

  // Handle keyboard navigation
  const handleKeyDown = React.useCallback((e) => {
    // Leave keys alone while typing, or while the report dialog/menu handles them.
    const t = e.target;
    if (t?.closest?.('input, textarea, [contenteditable="true"], .mod-dialog-backdrop, .mod-menu')) return;
    if (document.querySelector('.mod-dialog-backdrop')) return;
    if (e.key === 'Escape') {
      navigate('/gallery');
    } else if (e.key === 'ArrowLeft' && image?.previousImageId) {
      navigateToImage(image.previousImageId);
    } else if (e.key === 'ArrowRight' && image?.nextImageId) {
      navigateToImage(image.nextImageId);
    }
  }, [navigate, navigateToImage, image?.previousImageId, image?.nextImageId]);

  // Close viewer
  const handleClose = () => {
    navigate('/gallery');
  };

  // ── Report / block ───────────────────────────────────────────────────────
  const [reportTarget, setReportTarget] = useState(null); // { type, id }
  const isMine = (authorId) => !!user?._id && !!authorId && String(user._id) === String(authorId);

  const dropComments = (keep) =>
    setImage((prev) => {
      if (!prev) return prev;
      const comments = (prev.comments || []).filter(keep);
      return { ...prev, comments, commentCount: Math.max(0, (prev.commentCount || 0) - ((prev.comments || []).length - comments.length)) };
    });

  const afterReport = () => {
    if (!reportTarget) return;
    if (reportTarget.type === 'image') {
      emitModeration({ imageId: reportTarget.id });
      handleClose();
    } else {
      dropComments((c) => c._id !== reportTarget.id);
    }
  };

  const blockAuthor = async (author) => {
    if (!(await confirmAndBlock(author))) return;
    if (isMine(author._id)) return;
    if (image?.user?._id === author._id) handleClose();
    else dropComments((c) => c.user?._id !== author._id);
  };

  // Menu items for a scene or comment; signed-out readers are sent to sign in.
  const menuFor = (type, id, author) => {
    if (!user) return [{ label: 'Sign in to report', onClick: () => navigate('/login') }];
    if (isMine(author?._id)) return [];
    const noun = type === 'image' ? 'scene' : 'comment';
    return [
      { label: `Report ${noun}`, onClick: () => setReportTarget({ type, id }) },
      ...(author?._id ? [{ label: `Block ${author.username || 'reader'}`, danger: true, onClick: () => blockAuthor(author) }] : []),
    ];
  };

  // Navigate to book
  const handleBookClick = () => {
    if (image?.book?._id) {
      navigate(`/books/${image.book._id}`);
    }
  };

  // Navigate to user profile
  const handleUserClick = () => {
    if (image?.user?._id) {
      // Could navigate to user profile if that exists
      console.log('Navigate to user profile:', image.user._id);
    }
  };

  useEffect(() => {
    if (!imageId) return;

    // Reset UI state when changing images
    setIsDescriptionExpanded(false);
    setShowComments(false);

    // Check if we have this image in cache (from prefetching)
    const cachedImage = imageCache.current[imageId];
    
    // If we have initial image from gallery, use it immediately
    if (initialImage && initialImage._id === imageId) {
      // Fetch in background to get comments, likes, and navigation IDs
      // Show the gallery image immediately, no loading spinner
      fetchImage(imageId, { skipLoading: true, updateState: true });
    } else if (cachedImage && (cachedImage.previousImageId !== undefined || cachedImage.nextImageId !== undefined)) {
      // We have a prefetched image with full data (has navigation IDs), use it immediately
      setImage(cachedImage);
      setLoading(false);
      // Optionally refresh in background to ensure data is current
      // fetchImage(imageId, { skipLoading: true, updateState: true, skipCache: true });
    } else {
      // No cache available, fetch normally with loading state
      fetchImage(imageId, { skipLoading: false, updateState: true });
    }
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId]);

  // Preload adjacent images when current image is loaded
  useEffect(() => {
    if (image && !loading) {
      preloadAdjacentImages(image);
    }
  }, [image, loading, preloadAdjacentImages]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    // Prevent body scrolling when viewer is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  useEffect(() => {
    // Focus the viewer for keyboard navigation
    if (viewerRef.current) {
      viewerRef.current.focus();
    }
  }, [image]);

  if (loading) {
    return (
      <div className={`image-viewer-overlay ${isDarkMode ? 'dark' : 'light'}`}>
        <div className="image-viewer-loading">
          <div className="loading-spinner"></div>
          <p>Loading image...</p>
        </div>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className={`image-viewer-overlay ${isDarkMode ? 'dark' : 'light'}`}>
        <div className="image-viewer-error">
          <X size={48} />
          <p>{error || 'Image not found'}</p>
          <button onClick={handleClose} className="btn btn-primary">
            Back to Gallery
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`image-viewer-overlay ${isDarkMode ? 'dark' : 'light'}`} ref={viewerRef} tabIndex={0}>
      {/* Close button */}
      <button className="image-viewer-close" onClick={handleClose}>
        <X size={24} />
      </button>

      {/* Navigation arrows - All devices */}
      {image.previousImageId && (
        <button
          className="image-viewer-nav image-viewer-nav-left"
          onClick={() => navigateToImage(image.previousImageId)}
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {image.nextImageId && (
        <button
          className="image-viewer-nav image-viewer-nav-right"
          onClick={() => navigateToImage(image.nextImageId)}
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Desktop: Main container with image and info panel */}
      <div className="image-viewer-desktop-container">
        <div className="image-viewer-image-container">
          {image.mediaType === 'video' ? (
            <video
              src={image.videoUrl}
              className="image-viewer-image"
              controls
              autoPlay
              loop
              playsInline
            />
          ) : (
            <LazyImage
              ref={imageRef}
              src={image.imageUrl}
              alt={image.prompt || 'Gallery image'}
              className="image-viewer-image"
              skipLazy={true}
            />
          )}
        </div>

        {/* Desktop: Side panel for larger screens */}
        <div className="image-viewer-desktop-info">
          <div className="image-viewer-info">
            <div className="image-viewer-info-content">

              {/* Creator row */}
              <div className="iv-creator-row">
                <button className="iv-user-btn" onClick={handleUserClick}>
                  {image.user?.profileImage ? (
                    <img src={thumbUrl(image.user.profileImage, 100)} alt={image.user.username} className="iv-avatar" />
                  ) : (
                    <User size={18} />
                  )}
                  <div className="iv-user-meta">
                    <span className="iv-username">{image.user?.username || 'Anonymous'}</span>
                    <span className="iv-date">{new Date(image.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
                <div className="iv-creator-actions">
                  <button className={`iv-action-btn ${image.isLiked ? 'liked' : ''}`} onClick={handleLike}>
                    <Heart size={20} fill={image.isLiked ? 'currentColor' : 'none'} />
                    <span>{image.likeCount}</span>
                  </button>
                  <div className="iv-action-btn iv-comment-count">
                    <MessageCircle size={20} />
                    <span>{image.commentCount}</span>
                  </div>
                  <MoreMenu label="Report or block" items={menuFor('image', image._id, image.user)} />
                </div>
              </div>

              {/* Book card */}
              {image.book ? (
                <button className="iv-book-card" onClick={handleBookClick}>
                  <Book size={15} />
                  <div className="iv-book-text">
                    <span className="iv-book-title">{image.book.title}</span>
                    <span className="iv-book-author">by {image.book.author}</span>
                  </div>
                  <ExternalLink size={13} className="iv-book-link-icon" />
                </button>
              ) : (
                <div className="iv-book-card iv-book-card--empty">
                  <Book size={15} />
                  <span>Unknown Book</span>
                </div>
              )}

              {/* Tags row */}
              <div className="iv-tags">
                {image.character && (
                  <span className="iv-tag">Character: {image.character.name}</span>
                )}
                <span className="iv-tag">Style: {image.style}</span>
              </div>

              {/* Description */}
              {image.paragraphText && (
                <div className="iv-description">
                  <p>{isDescriptionExpanded ? image.paragraphText : getTruncatedDescription(image.paragraphText)}</p>
                  {shouldTruncateDescription(image.paragraphText) && (
                    <button className="iv-expand-btn" onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}>
                      {isDescriptionExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              )}

              {/* Comments (always visible) */}
              <div className="iv-comments">
                <div className="iv-comments-header">
                  <span>{image.commentCount || 0} {image.commentCount === 1 ? 'Comment' : 'Comments'}</span>
                </div>
                {user ? (
                  <form className="iv-comment-form" onSubmit={handleCommentSubmit}>
                    {user.profileImage ? (
                      <img src={thumbUrl(user.profileImage, 100)} className="iv-avatar iv-avatar--sm" alt={user.username} />
                    ) : (
                      <User size={16} />
                    )}
                    <div className="iv-comment-input-wrap">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Write a comment..."
                        maxLength={500}
                        rows={2}
                      />
                      <button
                        type="submit"
                        className="iv-comment-post-btn"
                        disabled={!newComment.trim() || submittingComment}
                      >
                        {submittingComment ? 'Posting...' : 'Post'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="iv-signin-prompt">
                    <span className="signin-link" onClick={() => navigate('/login')}>Sign in</span> to comment
                  </div>
                )}
                <div className="iv-comments-list">
                  {image.comments?.length > 0 ? image.comments.map(comment => (
                    <div key={comment._id} className="iv-comment">
                      <div className="iv-comment-header">
                        {comment.user?.profileImage ? (
                          <img src={thumbUrl(comment.user.profileImage, 100)} alt={comment.user.username} className="iv-avatar iv-avatar--xs" />
                        ) : (
                          <User size={14} />
                        )}
                        <span className="iv-comment-username">{comment.user?.username || 'Anonymous'}</span>
                        <span className="iv-comment-date">{new Date(comment.createdAt).toLocaleDateString()}</span>
                        <MoreMenu className="iv-comment-menu" label="Report or block" items={menuFor('comment', comment._id, comment.user)} />
                      </div>
                      <p className="iv-comment-content">{comment.content}</p>
                    </div>
                  )) : (
                    <p className="iv-empty-comments">No comments yet.</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Mobile: Image with overlay actions */}
      <div className="image-viewer-mobile-container">
        {/* Main image - takes full screen on mobile */}
        <div className="image-viewer-image-container">
          {image.mediaType === 'video' ? (
            <video
              src={image.videoUrl}
              className="image-viewer-image"
              controls
              autoPlay
              loop
              playsInline
            />
          ) : (
            <LazyImage
              ref={imageRef}
              src={image.imageUrl}
              alt={image.prompt || 'Gallery image'}
              className="image-viewer-image"
              skipLazy={true}
            />
          )}

          {/* Book title and description overlay at bottom */}
          <div className="image-viewer-mobile-book-overlay">
            {image.book && (
              <div className="image-viewer-mobile-book-info" onClick={handleBookClick}>
                <Book size={16} />
                <div className="image-viewer-mobile-book-text">
                  <span className="image-viewer-mobile-book-title">{image.book.title}</span>
                  <span className="image-viewer-mobile-book-author">by {image.book.author}</span>
                </div>
              </div>
            )}
            {image.paragraphText && (
              <div className="image-viewer-mobile-paragraph">
                <p>
                  {isDescriptionExpanded 
                    ? image.paragraphText 
                    : getTruncatedDescription(image.paragraphText)
                  }
                </p>
                {shouldTruncateDescription(image.paragraphText) && (
                  <button 
                    className="image-viewer-expand-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDescriptionExpanded(!isDescriptionExpanded);
                    }}
                  >
                    {isDescriptionExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Overlay actions - Mobile TikTok style */}
          <div className="image-viewer-mobile-actions">
            <button
              className={`image-viewer-mobile-action ${image.isLiked ? 'liked' : ''}`}
              onClick={handleLike}
            >
              <Heart size={32} fill={image.isLiked ? 'currentColor' : 'none'} />
              <span>{image.likeCount}</span>
            </button>

            <button
              className="image-viewer-mobile-action"
              onClick={() => setShowComments(true)}
            >
              <MessageCircle size={32} />
              <span>{image.commentCount}</span>
            </button>

            <MoreMenu className="image-viewer-mobile-more" label="Report or block" items={menuFor('image', image._id, image.user)} />
          </div>
        </div>

        {/* Bottom sheet for comments - Mobile */}
        {showComments && (
          <>
            {/* Backdrop overlay */}
            <div 
              className="image-viewer-sheet-backdrop"
              onClick={() => setShowComments(false)}
            />
            
            <div className="image-viewer-comments-sheet show">
              <div className="image-viewer-comments-header">
                <h4>Comments ({image.commentCount || 0})</h4>
                <button onClick={() => setShowComments(false)}>
                  <X size={20} />
                </button>
              </div>

            {/* Comment form or sign in prompt */}
            {user ? (
              <form className="image-viewer-comment-form" onSubmit={handleCommentSubmit}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  maxLength={500}
                  rows={3}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!newComment.trim() || submittingComment}
                >
                  {submittingComment ? 'Posting...' : 'Post Comment'}
                </button>
              </form>
            ) : (
              <div className="image-viewer-signin-prompt">
                <p>
                  <span 
                    className="signin-link"
                    onClick={() => navigate('/login')}
                  >
                    Sign in
                  </span>
                  {' '}to leave a comment
                </p>
              </div>
            )}

            {/* Comments list */}
            <div className="image-viewer-comments-list">
              {image.comments && image.comments.length > 0 ? (
                image.comments.map((comment) => (
                  <div key={comment._id} className="image-viewer-comment">
                    <div className="image-viewer-comment-user">
                      {comment.user?.profileImage ? (
                        <img
                          src={thumbUrl(comment.user.profileImage, 100)}
                          alt={comment.user.username}
                          className="image-viewer-comment-avatar"
                        />
                      ) : (
                        <User size={16} />
                      )}
                      <span className="image-viewer-comment-username">
                        {comment.user?.username || 'Anonymous'}
                      </span>
                      <span className="image-viewer-comment-date">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                      <MoreMenu className="iv-comment-menu" label="Report or block" items={menuFor('comment', comment._id, comment.user)} />
                    </div>
                    <p className="image-viewer-comment-content">{comment.content}</p>
                  </div>
                ))
              ) : (
                <p className="image-viewer-no-comments">No comments yet. Be the first to comment!</p>
              )}
            </div>
          </div>
          </>
        )}

        {/* Bottom sheet for info - Mobile */}
        {showInfo && (
          <div className="image-viewer-info-sheet">
            <div className="image-viewer-info-header">
              <h4>Image Details</h4>
              <button onClick={() => setShowInfo(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="image-viewer-info-content">
              <div className="image-viewer-book-info">
                {image.book ? (
                  <button className="image-viewer-book-link" onClick={handleBookClick}>
                    <Book size={16} />
                    <div>
                      <h3>{image.book.title}</h3>
                      <p>by {image.book.author}</p>
                    </div>
                    <ExternalLink size={14} />
                  </button>
                ) : (
                  <div className="image-viewer-book-placeholder">
                    <Book size={16} />
                    <span>Unknown Book</span>
                  </div>
                )}
              </div>

              {image.character && (
                <div className="image-viewer-character">
                  <span>Character: {image.character.name}</span>
                </div>
              )}

              <div className="image-viewer-style">
                <span>Style: {image.style}</span>
              </div>

              {image.paragraphText && (
                <div className="image-viewer-paragraph">
                  <p>{image.paragraphText}</p>
                </div>
              )}

              <div className="image-viewer-user-info">
                <div className="image-viewer-user">
                  <button className="image-viewer-user-link" onClick={handleUserClick}>
                    {image.user?.profileImage ? (
                      <img
                        src={thumbUrl(image.user.profileImage, 100)}
                        alt={image.user.username}
                        className="image-viewer-user-avatar"
                      />
                    ) : (
                      <User size={20} />
                    )}
                    <span>{image.user?.username || 'Anonymous'}</span>
                  </button>
                </div>

                <div className="image-viewer-date">
                  <Calendar size={14} />
                  <span>{new Date(image.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {reportTarget && (
        <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onReported={afterReport} />
      )}
    </div>
  );
};

export default ImageViewer;
