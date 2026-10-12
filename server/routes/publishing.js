const express = require('express');
const router = express.Router();
const Book = require('../models/bookModel');
const Page = require('../models/pageModel');
const User = require('../models/userModel');
const upload = require('../services/ImageUpload');
const bookService = require('../services/bookService');
const generationService = require('../services/generationService');
const { fetchBookCover } = require('../helpers/bookHelper');
const { authenticate, authenticateAdmin } = require('../controllers/auth');
const publishing = require('../services/solana/publishing');

// Community publishing on Solana: submit a book, admin review, mint it as a
// Metaplex Core asset, earn from readers' chats, claim. See
// services/solana/publishing.js.

const WEB_URL = (process.env.PUBLIC_WEB_URL || 'https://www.chattybooks.com').replace(/\/$/, '');

const sendError = (res, err, fallback) => {
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(`[publishing] ${fallback}:`, err);
  res.status(500).json({ message: fallback });
};

// Where this server is reachable, for the asset's metadata URI.
const apiBase = (req) => (process.env.PUBLIC_API_URL || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`).replace(/\/$/, '');

// GET /api/publishing/settings → { revenueShareBps, publishFee, minClaimUsd, maxClaimUsd, payoutCurrencies }
router.get('/settings', async (req, res) => {
  try {
    res.json(await publishing.settings());
  } catch (err) {
    sendError(res, err, 'Could not load publishing settings');
  }
});

// GET /api/publishing/books → { books } (published by me, or whose NFT my wallet holds)
router.get('/books', authenticate, async (req, res) => {
  try {
    res.json({ books: await publishing.booksFor(req.user) });
  } catch (err) {
    sendError(res, err, 'Could not load your books');
  }
});

// POST /api/publishing/books  multipart: bookFile (PDF, EPUB or TXT), rightsConfirmed=true
// Creates the book privately and queues it for review. Characters are
// generated in the background.
router.post('/books', authenticate, upload.single('bookFile'), async (req, res) => {
  try {
    if (String(req.body?.rightsConfirmed) !== 'true') {
      return res.status(400).json({ message: 'Confirm you hold the rights to publish this book' });
    }
    if (!req.file) return res.status(400).json({ message: 'Choose a PDF, EPUB or TXT file' });
    await publishing.checkCanSubmit(req.user);

    const content = await bookService.extractBookContent(req.file);
    const details = await generationService.generateBookDetails(content, req.user._id);
    const book = await bookService.createBook(
      { ...details, is_public: false, publishing: { status: 'pending_review', publisher: req.user._id } },
      { bookFile: [req.file] },
      req.user._id
    );
    const cover = await fetchBookCover(details.title, details.author).catch(() => null);
    if (cover) {
      book.image_url = cover;
      await book.save();
    }
    // The publisher can read and chat with it while it's private.
    await User.updateOne({ _id: req.user._id }, { $addToSet: { purchasedBooks: book._id } });

    Page.find({ bookId: book._id }).sort('pageNumber')
      .then((pages) => generationService.generateCharactersForBook(book, pages))
      .catch((err) => console.error(`[publishing] Character generation failed for ${book._id}:`, err));

    res.status(201).json({ book: await publishing.bookSummary(book) });
  } catch (err) {
    sendError(res, err, 'Could not submit the book');
  }
});

// GET /api/publishing/books/:id/metadata.json — the Core asset's metadata (public)
router.get('/books/:id/metadata.json', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).catch(() => null);
    if (!book?.publishing?.status || book.publishing.status === 'rejected') return res.status(404).json({ message: 'Not found' });
    res.set('Cache-Control', 'public, max-age=300').json(publishing.metadata(book, WEB_URL));
  } catch (err) {
    sendError(res, err, 'Could not load metadata');
  }
});

// POST /api/publishing/books/:id/mint → { transaction (base64), asset, fee } | { minted: true, book }
// The transaction is co-signed by the new asset; the wallet signs it (not
// sends it) and the app posts it to /mint/submit.
router.post('/books/:id/mint', authenticate, async (req, res) => {
  try {
    const result = await publishing.buildMintTransaction(
      req.params.id,
      req.user,
      `${apiBase(req)}/api/publishing/books/${req.params.id}/metadata.json`
    );
    if (result.minted) return res.json({ minted: true, book: await publishing.bookSummary(result.book) });
    res.json(result);
  } catch (err) {
    sendError(res, err, 'Could not prepare publishing');
  }
});

// POST /api/publishing/books/:id/mint/submit  Body: { transaction } (base64, wallet-signed)
// → 200 { book } once minted, or 202 { status: 'pending' } if it hasn't landed
// yet. Without a transaction, only checks whether an earlier one has landed.
router.post('/books/:id/mint/submit', authenticate, async (req, res) => {
  try {
    const book = await publishing.submitMintTransaction(req.params.id, req.user, req.body?.transaction);
    if (!book) return res.status(202).json({ status: 'pending', message: 'Your book is being published. Check back in a minute.' });
    res.json({ book: await publishing.bookSummary(book) });
  } catch (err) {
    sendError(res, err, 'Could not publish the book');
  }
});

// POST /api/publishing/books/:id/claim  Body: { currency: 'USDC' | 'SKR' }
// → { status: 'confirmed' | 'sending', signature, currency, amount, decimals, usd }
router.post('/books/:id/claim', authenticate, async (req, res) => {
  try {
    const currency = req.body?.currency === 'SKR' ? 'SKR' : 'USDC';
    res.json(await publishing.claim(req.params.id, req.user, currency));
  } catch (err) {
    sendError(res, err, 'Could not claim earnings');
  }
});

// ── Admin review ─────────────────────────────────────────────────────────────

// GET /api/publishing/admin/submissions → { books } waiting for review
router.get('/admin/submissions', authenticateAdmin, async (req, res) => {
  try {
    const books = await Book.find({ 'publishing.status': 'pending_review' }).sort({ createdAt: 1 }).limit(50);
    res.json({ books: await Promise.all(books.map(publishing.bookSummary)) });
  } catch (err) {
    sendError(res, err, 'Could not load submissions');
  }
});

// POST /api/publishing/admin/books/:id/review  Body: { approve: boolean, note? }
router.post('/admin/books/:id/review', authenticateAdmin, async (req, res) => {
  try {
    const book = await publishing.review(req.params.id, { approve: !!req.body?.approve, note: req.body?.note });
    res.json({ book: await publishing.bookSummary(book) });
  } catch (err) {
    sendError(res, err, 'Could not save the review');
  }
});

module.exports = router;
