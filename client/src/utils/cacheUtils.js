// Local storage caching utilities for better performance

const CACHE_PREFIX = 'chattybooks_';
const CACHE_EXPIRY = {
  USER_PREFERENCES: 7 * 24 * 60 * 60 * 1000, // 7 days
  READING_PROGRESS: 30 * 24 * 60 * 60 * 1000, // 30 days
  RECENT_BOOKS: 24 * 60 * 60 * 1000, // 1 day
  CATEGORIES: 60 * 60 * 1000, // 1 hour
};

// Generic cache functions
export const setCache = (key, data, expiry = 60 * 60 * 1000) => {
  try {
    const cacheData = {
      data,
      timestamp: Date.now(),
      expiry: expiry
    };
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Failed to set cache:', error);
  }
};

export const getCache = (key) => {
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!cached) return null;

    const { data, timestamp, expiry } = JSON.parse(cached);
    
    // Check if cache has expired
    if (Date.now() - timestamp > expiry) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }

    return data;
  } catch (error) {
    console.warn('Failed to get cache:', error);
    return null;
  }
};

export const clearCache = (key) => {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  } catch (error) {
    console.warn('Failed to clear cache:', error);
  }
};

export const clearAllCache = () => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('Failed to clear all cache:', error);
  }
};

// Specific cache functions for common use cases
export const cacheUserPreferences = (preferences) => {
  setCache('user_preferences', preferences, CACHE_EXPIRY.USER_PREFERENCES);
};

export const getUserPreferences = () => {
  return getCache('user_preferences') || {};
};

export const cacheReadingProgress = (bookId, progress) => {
  const key = `reading_progress_${bookId}`;
  setCache(key, progress, CACHE_EXPIRY.READING_PROGRESS);
};

export const getReadingProgress = (bookId) => {
  const key = `reading_progress_${bookId}`;
  return getCache(key);
};

export const cacheRecentBooks = (books) => {
  setCache('recent_books', books, CACHE_EXPIRY.RECENT_BOOKS);
};

export const getRecentBooks = () => {
  return getCache('recent_books') || [];
};

export const cacheCategories = (categories) => {
  setCache('categories', categories, CACHE_EXPIRY.CATEGORIES);
};

export const getCategories = () => {
  return getCache('categories') || [];
};

// Performance optimization: batch cache operations
export const batchCacheOperations = (operations) => {
  try {
    operations.forEach(({ key, data, expiry }) => {
      setCache(key, data, expiry);
    });
  } catch (error) {
    console.warn('Failed to perform batch cache operations:', error);
  }
};

// Cache size management
export const getCacheSize = () => {
  try {
    let total = 0;
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        total += localStorage.getItem(key).length;
      }
    });
    return total;
  } catch (error) {
    console.warn('Failed to calculate cache size:', error);
    return 0;
  }
};

// Clean up expired cache entries
export const cleanupExpiredCache = () => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        const cached = localStorage.getItem(key);
        if (cached) {
          const { timestamp, expiry } = JSON.parse(cached);
          if (Date.now() - timestamp > expiry) {
            localStorage.removeItem(key);
          }
        }
      }
    });
  } catch (error) {
    console.warn('Failed to cleanup expired cache:', error);
  }
};

// Auto cleanup on app startup
if (typeof window !== 'undefined') {
  cleanupExpiredCache();
} 