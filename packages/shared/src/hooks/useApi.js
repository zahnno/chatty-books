import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, catchError } from '../apiClient.js';

// Query Keys - centralized for cache invalidation
export const QUERY_KEYS = {
  BOOKS: 'books',
  BOOK: (id) => ['book', id],
  BOOK_CHARACTERS: (id) => ['book', id, 'characters'],
  SIMILAR_BOOKS: (id) => ['book', id, 'similar'],
  SIMILAR_CHARACTERS: (id) => ['book', id, 'similar-characters'],
  BOOK_PAGES: (id) => ['book', id, 'pages'],
  BOOK_PAGE: (bookId, pageNum) => ['book', bookId, 'page', pageNum],
  CHARACTERS: 'characters',
  TOP_CHARACTERS: 'topCharacters',
  USER_BOOKS: 'userBooks',
  USER_CHARACTERS: 'userCharacters',
  USER: 'user',
  TOKEN_BALANCE: 'tokenBalance',
  GALLERY: (page) => ['gallery', page],
};

// Books API Hooks
export const useBooks = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.BOOKS],
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: '/books',
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // Books data stays fresh for 10 minutes
  });
};

export const useBook = (bookId) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOK(bookId),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    enabled: !!bookId,
    staleTime: 60 * 60 * 1000, // Book metadata rarely changes - cache for 1 hour
    gcTime: 2 * 60 * 60 * 1000, // Keep in cache for 2 hours
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
};

export const useBookCharacters = (bookId) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOK_CHARACTERS(bookId),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/characters`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    enabled: !!bookId,
    staleTime: 20 * 60 * 1000, // Characters rarely change
  });
};

export const useSimilarBooks = (bookId) => {
  return useQuery({
    queryKey: QUERY_KEYS.SIMILAR_BOOKS(bookId),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/similar`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    enabled: !!bookId,
    staleTime: 10 * 60 * 1000, // Similar books can change as catalog grows
  });
};

export const useSimilarCharacters = (bookId) => {
  return useQuery({
    queryKey: QUERY_KEYS.SIMILAR_CHARACTERS(bookId),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/similar-characters`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    enabled: !!bookId,
    staleTime: 10 * 60 * 1000,
  });
};

/** Single character by id (e.g. for character chat). */
export const useBookCharacter = (bookId, characterId) => {
  return useQuery({
    queryKey: ['bookCharacter', bookId, characterId],
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/characters/${characterId}`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    enabled: !!(bookId && characterId),
    staleTime: 20 * 60 * 1000,
  });
};

/** First page of chat messages (for character chat). Enables prefetch and cached reopen. */
export const useChatHistory = (bookId, characterId, page = 1, options = {}) => {
  const { enabled = true, staleTime = 1 * 60 * 1000 } = options;
  return useQuery({
    queryKey: ['chatHistory', bookId, characterId, page],
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/character/${characterId}/messages?page=${page}&limit=20`,
        method: 'GET'
      }));
      if (error) throw error;
      return data;
    },
    enabled: !!(bookId && characterId && enabled),
    staleTime,
    gcTime: 10 * 60 * 1000, // Keep cache 10 min so mini chat reopen shows messages without refetch
  });
};

export const useBookPages = (bookId) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOK_PAGES(bookId),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/page`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    enabled: !!bookId,
    staleTime: 30 * 60 * 1000, // Page structure rarely changes
  });
};

export const useBookPage = (bookId, pageNumber) => {
  return useQuery({
    queryKey: QUERY_KEYS.BOOK_PAGE(bookId, pageNumber),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/pages/num/${pageNumber}`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    enabled: !!(bookId && pageNumber),
    staleTime: 60 * 60 * 1000, // Individual pages rarely change - cache for 1 hour
    gcTime: 120 * 60 * 1000, // Keep in cache for 2 hours
    keepPreviousData: true,
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
    refetchOnMount: false, // Don't refetch if we have cached data
    refetchOnReconnect: false, // Don't refetch when reconnecting
    retry: 1, // Reduce retry attempts for faster failure/success
    retryDelay: 500, // Shorter retry delay
  });
};

// Characters API Hooks
export const useTopCharacters = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.TOP_CHARACTERS],
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: '/characters/top',
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 60 * 1000, // Top characters update less frequently
  });
};

export const useCharacters = (page = 1, query = '') => {
  return useQuery({
    queryKey: [QUERY_KEYS.CHARACTERS, { page, query }],
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/characters?page=${page}&query=${query}`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    keepPreviousData: true, // Keep previous data while loading new pages
    staleTime: 5 * 60 * 1000,
  });
};

// User-specific API Hooks
// Pass { enabled: false } for signed-out readers so it doesn't fail and retry.
export const useUserBooks = ({ enabled = true } = {}) => {
  return useQuery({
    queryKey: [QUERY_KEYS.USER_BOOKS],
    enabled,
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: '/mybooks',
        requireAuth: true
      }));
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000, // User data changes more frequently
  });
};

export const useGalleryImages = (page = 1) => {
  return useQuery({
    queryKey: QUERY_KEYS.GALLERY(page),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/gallery/images?page=${page}&limit=20`,
        method: 'GET',
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useUserCharacters = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.USER_CHARACTERS],
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: '/user-characters',
        requireAuth: true
      }));
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });
};

// Hook for characters in specific page
export const usePageCharacters = (bookId, pageNumber) => {
  return useQuery({
    queryKey: ['pageCharacters', bookId, pageNumber],
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/characters/in-pages/${pageNumber}`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    enabled: !!(bookId && pageNumber),
    staleTime: 20 * 60 * 1000, // Page characters rarely change
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    keepPreviousData: true,
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
    refetchOnMount: false, // Don't refetch if we have cached data
    refetchOnReconnect: false, // Don't refetch when reconnecting
  });
};

// Combined hook for book page data (optimizes multiple requests)
export const useBookPageData = (bookId, pageNumber) => {
  const bookQuery = useBook(bookId);
  const pageQuery = useBookPage(bookId, pageNumber);
  const pageCharactersQuery = usePageCharacters(bookId, pageNumber);

  // Priority 1: Only show initial loading if we have no book or page data (core content)
  // Characters are secondary and shouldn't block page display
  const hasCoreData = bookQuery.data && pageQuery.data;
  const isInitialLoading = !hasCoreData && (bookQuery.isLoading || pageQuery.isLoading);

  // Priority 2: Never show fetching indicator if we have page data
  // Even if queries are in background loading state, don't show spinner if content is available
  const isWaitingForPageData = pageQuery.isLoading && !pageQuery.data && !pageQuery.isPreviousData;

  return {
    book: bookQuery.data,
    page: pageQuery.data,
    characters: pageCharactersQuery.data,
    isInitialLoading,
    isFetching: isWaitingForPageData, // Only show spinner when we truly have no page content
    error: bookQuery.error || pageQuery.error || pageCharactersQuery.error,
    // Separate character loading state for optional use
    charactersLoading: pageCharactersQuery.isLoading && !pageCharactersQuery.data,
  };
};

// Prefetch utilities
export const usePrefetchBookPage = () => {
  const queryClient = useQueryClient();

  const prefetchPageWithCharacters = (bookId, pageNum) => {
    // Convert pageNum to string to match the query keys used in the components
    const pageNumStr = pageNum.toString();
    
    // Prefetch page content
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.BOOK_PAGE(bookId, pageNumStr),
      queryFn: async () => {
        const [error, data] = await catchError(authFetch({
          path: `/book/${bookId}/pages/num/${pageNumStr}`,
          requireAuth: false
        }));
        if (error) throw error;
        return data;
      },
      staleTime: 60 * 60 * 1000,
      gcTime: 120 * 60 * 1000,
    });
    
    // Prefetch characters (non-blocking)
    queryClient.prefetchQuery({
      queryKey: ['pageCharacters', bookId, pageNumStr],
      queryFn: async () => {
        const [error, data] = await catchError(authFetch({
          path: `/book/${bookId}/characters/in-pages/${pageNumStr}`,
          requireAuth: false
        }));
        if (error) throw error;
        return data;
      },
      staleTime: 20 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
    });
  };

  return {
    prefetchNextPage: (bookId, currentPage) => {
      const nextPage = parseInt(currentPage) + 1;
      prefetchPageWithCharacters(bookId, nextPage);
    },
    prefetchPreviousPage: (bookId, currentPage) => {
      const prevPage = parseInt(currentPage) - 1;
      if (prevPage > 0) {
        prefetchPageWithCharacters(bookId, prevPage);
      }
    }
  };
};

// Prefetch helpers for route hover (take queryClient, no hook)
export async function prefetchUserBooks(queryClient) {
  return queryClient.prefetchQuery({
    queryKey: [QUERY_KEYS.USER_BOOKS],
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({ path: '/mybooks', requireAuth: true }));
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });
}

export async function prefetchGalleryImages(queryClient) {
  return queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.GALLERY(1),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: '/gallery/images?page=1&limit=20',
        method: 'GET',
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export async function prefetchUserCharacters(queryClient) {
  return queryClient.prefetchQuery({
    queryKey: [QUERY_KEYS.USER_CHARACTERS],
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({ path: '/user-characters', requireAuth: true }));
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });
}

// NOTE: useRoutePrefetch (web route-chunk hover prefetch) stays in the web client
// (client/src/hooks/useApi.js) since it depends on web-only dynamic route imports.

/** Prefetch book metadata (and optionally first/current page) for instant load on click. */
export async function prefetchBook(queryClient, bookId) {
  return queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.BOOK(bookId),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}`,
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}

/** Prefetch book + character (and optionally first page of chat) for character chat route. */
export function useCharacterChatPrefetch() {
  const queryClient = useQueryClient();
  return (bookId, characterId) => {
    if (!bookId || !characterId) return;
    prefetchBook(queryClient, bookId).catch(() => {});
    queryClient.prefetchQuery({
      queryKey: ['bookCharacter', bookId, characterId],
      queryFn: async () => {
        const [error, data] = await catchError(authFetch({
          path: `/book/${bookId}/characters/${characterId}`,
          requireAuth: false
        }));
        if (error) throw error;
        return data;
      },
      staleTime: 20 * 60 * 1000,
    }).catch(() => {});
  };
}

/** Prefetch book + page data for reader (e.g. on "Continue reading" hover). */
export function useBookPrefetch() {
  const queryClient = useQueryClient();
  return (bookId, pageNum) => {
    prefetchBook(queryClient, bookId).catch(() => {});
    if (pageNum) {
      const pageStr = String(pageNum);
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.BOOK_PAGE(bookId, pageStr),
        queryFn: async () => {
          const [error, data] = await catchError(authFetch({
            path: `/book/${bookId}/pages/num/${pageStr}`,
            requireAuth: false
          }));
          if (error) throw error;
          return data;
        },
        staleTime: 60 * 60 * 1000,
        gcTime: 120 * 60 * 1000,
      }).catch(() => {});
      queryClient.prefetchQuery({
        queryKey: ['pageCharacters', bookId, pageStr],
        queryFn: async () => {
          const [error, data] = await catchError(authFetch({
            path: `/book/${bookId}/characters/in-pages/${pageStr}`,
            requireAuth: false
          }));
          if (error) throw error;
          return data;
        },
        staleTime: 20 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
      }).catch(() => {});
    } else {
      queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.BOOK_PAGE(bookId, '1'),
        queryFn: async () => {
          const [error, data] = await catchError(authFetch({
            path: `/book/${bookId}/pages/num/1`,
            requireAuth: false
          }));
          if (error) throw error;
          return data;
        },
        staleTime: 60 * 60 * 1000,
        gcTime: 120 * 60 * 1000,
      }).catch(() => {});
    }
  };
}

// ========================
// Audio Profile Hooks
// ========================
export const AUDIO_PROFILE_KEYS = {
  BOOK_AUDIO_PROFILES: (bookId) => ['audioProfiles', bookId],
  VOICES: ['voices'],
};

// Get audio profiles for a book
export const useBookAudioProfiles = (bookId) => {
  return useQuery({
    queryKey: AUDIO_PROFILE_KEYS.BOOK_AUDIO_PROFILES(bookId),
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: `/book/${bookId}/audio-profiles`,
        requireAuth: false
      }));
      if (error) throw error;
      return data || [];
    },
    enabled: !!bookId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Get available voices
export const useVoices = () => {
  return useQuery({
    queryKey: AUDIO_PROFILE_KEYS.VOICES,
    queryFn: async () => {
      const [error, data] = await catchError(authFetch({
        path: '/voices',
        requireAuth: false
      }));
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour - voices don't change often
  });
};

// Cache invalidation utilities
export const useCacheInvalidation = () => {
  const queryClient = useQueryClient();

  return {
    invalidateBooks: () => queryClient.invalidateQueries([QUERY_KEYS.BOOKS]),
    invalidateUserBooks: () => queryClient.invalidateQueries([QUERY_KEYS.USER_BOOKS]),
    invalidateBook: (bookId) => queryClient.invalidateQueries(QUERY_KEYS.BOOK(bookId)),
    invalidateCharacters: () => queryClient.invalidateQueries([QUERY_KEYS.CHARACTERS]),
    invalidateUserData: () => {
      queryClient.invalidateQueries([QUERY_KEYS.USER_BOOKS]);
      queryClient.invalidateQueries([QUERY_KEYS.USER_CHARACTERS]);
      queryClient.invalidateQueries([QUERY_KEYS.TOKEN_BALANCE]);
    },
    invalidateAudioProfiles: (bookId) => queryClient.invalidateQueries(AUDIO_PROFILE_KEYS.BOOK_AUDIO_PROFILES(bookId)),
  };
}; 