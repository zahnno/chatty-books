const fetch = require('node-fetch');

/**
 * Fetches a book cover from Google Books API
 * @param {string} title - The book title
 * @param {string} author - The book author
 * @returns {Promise<string|null>} The URL of the book cover or null if not found
 */
async function fetchBookCover(title, author) {
  try {
    const query = `${title} ${author}`.replace(/\s+/g, '+');
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
    const data = await response.json();
    
    if (data.items && data.items[0]?.volumeInfo?.imageLinks?.thumbnail) {
      // Get high quality version by modifying the URL
      return data.items[0].volumeInfo.imageLinks.thumbnail.replace('zoom=1', 'zoom=3');
    }
    return null;
  } catch (error) {
    console.error('Error fetching book cover:', error);
    return null;
  }
}

/**
 * Processes content into pages of roughly equal size
 * @param {string} content - The book content to process
 * @returns {string[]} Array of page contents
 */
function processContentIntoPages(content) {
  // Split content into pages (roughly 3000 characters per page)
  const PAGE_SIZE = 3000;
  const words = content.split(/\s+/);
  const pages = [];
  let currentPage = '';

  for (let word of words) {
    if ((currentPage + ' ' + word).length > PAGE_SIZE) {
      pages.push(currentPage.trim());
      currentPage = word;
    } else {
      currentPage += (currentPage ? ' ' : '') + word;
    }
  }
  
  if (currentPage) {
    pages.push(currentPage.trim());
  }

  return pages;
}

/**
 * Escapes special characters in a string for use in RegExp
 * @param {string} string - The string to escape
 * @returns {string} The escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a character appears in a given text
 * @param {Object} character - The character object
 * @param {string} text - The text to check
 * @returns {boolean} Whether the character appears in the text
 */
function characterAppearsInText(character, text) {
  if (!text) return false;
  
  const fullName = `${character.firstName} ${character.lastName}`.trim();
  const nameRegex = new RegExp(`\\b${escapeRegExp(fullName)}\\b`, 'i');
  const firstNameRegex = new RegExp(`\\b${escapeRegExp(character.firstName)}\\b`, 'i');
  
  return nameRegex.test(text) || firstNameRegex.test(text);
}

/**
 * Cleans page text by removing headers, footers, and other patterns
 * @param {string} text - The text to clean
 * @param {Object} patterns - Object containing patterns to remove
 * @returns {string} The cleaned text
 */
function cleanPageText(text, patterns = {}) {
  let cleanedText = text;

  if (patterns.headers) {
    patterns.headers.forEach(header => {
      const headerRegex = new RegExp(`^\\s*${escapeRegExp(header)}\\s*\\n?`, 'gm');
      cleanedText = cleanedText.replace(headerRegex, '');
    });
  }

  if (patterns.footers) {
    patterns.footers.forEach(footer => {
      const footerRegex = new RegExp(`\\n?\\s*${escapeRegExp(footer)}\\s*$`, 'gm');
      cleanedText = cleanedText.replace(footerRegex, '');
    });
  }

  // Clean up any resulting double newlines and trim
  return cleanedText
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  fetchBookCover,
  processContentIntoPages,
  escapeRegExp,
  characterAppearsInText,
  cleanPageText
}; 