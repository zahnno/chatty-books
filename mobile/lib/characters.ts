// Characters across all books (the Characters tab), plus the shared shape used by the
// per-book character endpoints.
import { authFetch } from '@talkingbook/shared';
import type { Book } from './books';

export type Character = {
  _id: string;
  firstName?: string;
  lastName?: string;
  intro?: string;
  description?: string;
  appearance?: string;
  personalityTraits?: string[];
  strengths?: string[];
  weaknesses?: string[];
  goals?: string[];
  image_url?: string;
  // Populated ({ _id, title }) on /characters; a plain id on /book/:id/characters.
  bookId?: string | { _id: string; title?: string };
  bookTitle?: string;
};

export const characterName = (c?: Pick<Character, 'firstName' | 'lastName'> | null) =>
  [c?.firstName, c?.lastName].filter(Boolean).join(' ') || 'Character';

export const characterBookId = (c: Character) =>
  typeof c.bookId === 'string' ? c.bookId : c.bookId?._id;

// Characters grouped by book (the Characters tab): 6 books per page, each cast ordered
// by how often readers talk to them. Search matches character names or the book's
// title/author.
export type BookCharacters = {
  book: Pick<Book, '_id' | 'title' | 'author' | 'image_url' | 'description'>;
  characters: Character[];
};

export type BookCharactersPage = {
  books: BookCharacters[];
  page: number;
  totalPages: number;
  hasMore: boolean;
};

export const fetchCharactersByBook = (page: number, query: string): Promise<BookCharactersPage> =>
  authFetch({
    path: `/characters/by-book?page=${page}&query=${encodeURIComponent(query)}`,
    requireAuth: false,
  });

// Where a character turns up around the reader's page, mirroring the web reader's
// in-pages check (a name mention in the page text) but matched on whole words so
// short names like "Al" don't hit "also". Current page wins over previous, previous
// over next.
export type Presence = 'current' | 'previous' | 'next';

export const PRESENCE_LABELS: Record<Presence, string> = {
  current: 'On this page',
  previous: 'On the last page',
  next: 'On the next page',
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function characterMatcher(c: Pick<Character, 'firstName' | 'lastName'>): RegExp | null {
  const names = [c.firstName, c.lastName].map((n) => n?.trim()).filter(Boolean) as string[];
  if (!names.length) return null;
  return new RegExp(`\\b(?:${names.map(escapeRegExp).join('|')})\\b`, 'i');
}

export function characterPresence(
  c: Character,
  pages: { current?: string; previous?: string; next?: string }
): Presence | null {
  const re = characterMatcher(c);
  if (!re) return null;
  if (pages.current && re.test(pages.current)) return 'current';
  if (pages.previous && re.test(pages.previous)) return 'previous';
  if (pages.next && re.test(pages.next)) return 'next';
  return null;
}
