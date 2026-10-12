// Re-export shim. The React Query data hooks now live in @talkingbook/shared so the
// Expo mobile app can reuse them. useRoutePrefetch stays here because it preloads
// web route chunks via dynamic import (web-only).
import { useQueryClient } from '@tanstack/react-query';
import {
  prefetchUserBooks,
  prefetchUserCharacters,
  prefetchGalleryImages,
} from '@talkingbook/shared/src/hooks/useApi.js';
import { preloadRoute } from '../utils/routePrefetch';

export * from '@talkingbook/shared/src/hooks/useApi.js';

/** Preload route chunk + prefetch data for pathname (e.g. on nav link hover). */
export function useRoutePrefetch() {
  const queryClient = useQueryClient();
  return (pathname) => {
    preloadRoute(pathname);
    if (pathname === '/books') {
      prefetchUserBooks(queryClient).catch(() => {});
      prefetchUserCharacters(queryClient).catch(() => {});
    }
    if (pathname === '/gallery') {
      prefetchGalleryImages(queryClient).catch(() => {});
    }
  };
}
