// Book-related write actions + search, hitting the same endpoints as the web client.
import { authFetch } from '@talkingbook/shared';

export const saveReadingProgress = (bookId: string, pageNumber: number) =>
  authFetch({
    path: `/book/${bookId}/progress`,
    method: 'POST',
    body: { pageNumber },
  });

export const addToLibrary = (bookId: string) =>
  authFetch({ path: `/book/${bookId}/add`, method: 'POST', body: {} });

export const removeFromLibrary = (bookId: string) =>
  authFetch({ path: `/book/${bookId}/remove`, method: 'DELETE' });

export type BookPage = { books: Book[]; page: number; totalPages: number; hasMore: boolean };

// Paginated (12 per page). An empty query pages through the whole catalog.
export const searchBooks = (query: string, page = 1): Promise<BookPage> =>
  authFetch({
    path: `/books/search?page=${page}&query=${encodeURIComponent(query)}`,
    requireAuth: false,
  });

export type Book = {
  _id: string;
  title: string;
  author?: string;
  image_url?: string;
  description?: string;
  tagline?: string;
  categories?: string[];
  ageGroup?: string;
  readingTime?: number;
  currentPage?: number;
  totalPages?: number;
  hasAudio?: boolean;
};
