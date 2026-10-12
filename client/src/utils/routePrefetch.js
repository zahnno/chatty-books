/**
 * Route chunk preload functions. Use the same paths as App.js lazy() imports
 * so that hovering a nav link loads the chunk before navigation.
 * Paths are relative to this file (src/utils/).
 */
export const preloadBooksPage = () => import('../components/booksPage');
export const preloadSettingsPage = () => import('../components/settingsPage');
export const preloadSearchBooks = () => import('../components/searchBooks');
export const preloadCharacterList = () => import('../components/characterList');
export const preloadGallery = () => import('../components/Gallery');
export const preloadBookPage = () => import('../components/bookPage');
export const preloadBookReader = () => import('../components/bookReader');
export const preloadCharacterChat = () => import('../components/characterChat');
export const preloadAdminBooksPage = () => import('../components/adminBooksPage');

const ROUTE_PRELOAD = {
  '/books': preloadBooksPage,
  '/settings': preloadSettingsPage,
  '/search': preloadSearchBooks,
  '/characters': preloadCharacterList,
  '/gallery': preloadGallery,
  '/admin/books': preloadAdminBooksPage,
};

/**
 * Preload the route chunk for a pathname (e.g. on nav link hover).
 * @param {string} pathname - e.g. '/books', '/settings'
 */
export function preloadRoute(pathname) {
  const fn = ROUTE_PRELOAD[pathname];
  if (fn) fn();
}
