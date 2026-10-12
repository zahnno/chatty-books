// Link previews for individual books. The web app uses hash URLs
// (/#/books/:id), which crawlers can't see, so shared links point at
// https://www.chattybooks.com/b/:id instead. The static site rewrites /b/* here
// (Render → Redirects/Rewrites: /b/* → <API>/share/book/*); this returns a tiny
// page carrying the book's Open Graph / X tags and sends people on to the book.
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Book = require('../models/bookModel');
const Character = require('../models/characterModel');
const { renderBookCard, CARD_WIDTH, CARD_HEIGHT } = require('../services/shareCard');

const WEB_URL = (process.env.PUBLIC_WEB_URL || 'https://www.chattybooks.com').replace(/\/$/, '');
const API_URL = (process.env.PUBLIC_API_URL || 'https://talkingbook.onrender.com').replace(/\/$/, '');
const SITE_CARD = `${WEB_URL}/social-card.jpg?v=20260927`;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const clip = (text, max) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

const characterName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ').trim();

// Public books only; anything else gets the generic site preview.
async function loadBook(bookId) {
  if (!mongoose.isValidObjectId(bookId)) return null;
  const book = await Book.findOne({ _id: bookId, is_public: true })
    .select('title author description tagline image_url updatedAt')
    .lean();
  if (!book) return null;
  const characters = await Character.find({ bookId, firstName: { $ne: 'Guide' } })
    .select('firstName lastName image_url')
    .lean();
  return { book, characters };
}

function page({ title, description, url, image, imageAlt, appUrl, type = 'book' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Chatty Books">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${CARD_WIDTH}">
<meta property="og:image:height" content="${CARD_HEIGHT}">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="twitter:image:alt" content="${esc(imageAlt)}">
<meta name="theme-color" content="#FAF8F4">
<script>location.replace(${JSON.stringify(appUrl)});</script>
</head>
<body style="font-family: Georgia, serif; background: #FAF8F4; color: #1B1A17; padding: 40px; text-align: center">
<p><a href="${esc(appUrl)}" style="color: #A33A2B">Continue to ${esc(title)}</a></p>
</body>
</html>`;
}

router.get('/share/book/:bookId', async (req, res) => {
  const { bookId } = req.params;
  let data = null;
  try {
    data = await loadBook(bookId);
  } catch (err) {
    console.error('Share page lookup failed:', err);
  }

  res.set('Content-Type', 'text/html; charset=utf-8');
  if (!data) {
    res.set('Cache-Control', 'public, max-age=60');
    return res.status(404).send(page({
      title: 'Chatty Books: Read, listen, and talk to the characters',
      description: 'Read the classics, listen along with a narrator, and talk with the characters inside them.',
      url: WEB_URL,
      image: SITE_CARD,
      imageAlt: 'Chatty Books: where books turn into conversations.',
      appUrl: WEB_URL,
      type: 'website',
    }));
  }

  const { book, characters } = data;
  const names = characters.slice(0, 2).map(characterName).filter(Boolean);
  const more = characters.length - names.length;
  const cast = names.length
    ? ` Talk with ${names.join(', ')}${more > 0 ? ` and ${more} more characters` : ''}.`
    : '';
  const about = clip(book.tagline || book.description, 150);
  const version = book.updatedAt ? new Date(book.updatedAt).getTime() : 0;

  res.set('Cache-Control', 'public, max-age=300');
  res.send(page({
    title: `${book.title}${book.author ? ` by ${book.author}` : ''} | Chatty Books`,
    description: `${about}${cast} Read, listen and chat free on Chatty Books.`.trim(),
    url: `${WEB_URL}/b/${bookId}`,
    image: `${API_URL}/share/book/${bookId}/card.jpg?v=${version}`,
    imageAlt: `${book.title}${book.author ? ` by ${book.author}` : ''} on Chatty Books`,
    appUrl: `${WEB_URL}/#/books/${bookId}`,
  }));
});

// Rendered cards, keyed by book id + last update, so edits produce a fresh card.
const cardCache = new Map();
const CARD_CACHE_LIMIT = 100;

router.get('/share/book/:bookId/card.jpg', async (req, res) => {
  try {
    const data = await loadBook(req.params.bookId);
    if (!data) return res.status(404).json({ message: 'Book not found' });
    const { book, characters } = data;
    const key = `${book._id}:${book.updatedAt ? new Date(book.updatedAt).getTime() : 0}`;

    let card = cardCache.get(key);
    if (!card) {
      card = renderBookCard({
        title: book.title,
        author: book.author,
        coverUrl: book.image_url,
        characters: characters.map((c) => ({ name: characterName(c), imageUrl: c.image_url })),
      });
      cardCache.set(key, card); // cache the promise so concurrent crawlers share one render
      if (cardCache.size > CARD_CACHE_LIMIT) cardCache.delete(cardCache.keys().next().value);
      card.catch(() => cardCache.delete(key));
    }

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.send(await card);
  } catch (err) {
    console.error('Share card render failed:', err);
    res.status(500).json({ message: 'Could not render the preview' });
  }
});

module.exports = router;
