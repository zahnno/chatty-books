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
const publishingReview = require('../services/publishingReview');
const edits = require('../services/publishingEdits');

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
    // Automated screening, then an email asking support to review.
    publishingReview.reviewSubmission(book._id);

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

// ── Editing (publisher before minting, NFT holder after; see publishingEdits.js) ──

const characterView = (c) => ({
  id: c._id, firstName: c.firstName, lastName: c.lastName, intro: c.intro, description: c.description,
  appearance: c.appearance, events: c.events, gender: c.gender, image_url: c.image_url,
  personalityTraits: c.personalityTraits, strengths: c.strengths, weaknesses: c.weaknesses, goals: c.goals
});

// GET /api/publishing/books/:id/edit → { book, characters }
router.get('/books/:id/edit', authenticate, async (req, res) => {
  try {
    res.json(await edits.editView(req.params.id, req.user));
  } catch (err) {
    sendError(res, err, 'Could not load the book');
  }
});

// PATCH /api/publishing/books/:id  Body: { title?, author?, description?, tagline?, categories? }
router.patch('/books/:id', authenticate, async (req, res) => {
  try {
    await edits.updateBook(req.params.id, req.user, req.body);
    res.json(await edits.editView(req.params.id, req.user));
  } catch (err) {
    sendError(res, err, 'Could not save the book');
  }
});

// POST /api/publishing/books/:id/cover  multipart: image
router.post('/books/:id/cover', authenticate, upload.single('image'), async (req, res) => {
  try {
    await edits.updateCover(req.params.id, req.user, req.file);
    res.json(await edits.editView(req.params.id, req.user));
  } catch (err) {
    sendError(res, err, 'Could not change the cover');
  }
});

// POST /api/publishing/books/:id/characters  Body: character fields → { character }
router.post('/books/:id/characters', authenticate, async (req, res) => {
  try {
    res.status(201).json({ character: characterView(await edits.createCharacter(req.params.id, req.user, req.body)) });
  } catch (err) {
    sendError(res, err, 'Could not add the character');
  }
});

// PATCH /api/publishing/books/:id/characters/:characterId  Body: character fields → { character }
router.patch('/books/:id/characters/:characterId', authenticate, async (req, res) => {
  try {
    res.json({ character: characterView(await edits.updateCharacter(req.params.id, req.params.characterId, req.user, req.body)) });
  } catch (err) {
    sendError(res, err, 'Could not save the character');
  }
});

// DELETE /api/publishing/books/:id/characters/:characterId
router.delete('/books/:id/characters/:characterId', authenticate, async (req, res) => {
  try {
    await edits.deleteCharacter(req.params.id, req.params.characterId, req.user);
    res.json({ deleted: true });
  } catch (err) {
    sendError(res, err, 'Could not remove the character');
  }
});

// POST /api/publishing/books/:id/characters/:characterId/portrait  multipart: image → { character }
router.post('/books/:id/characters/:characterId/portrait', authenticate, upload.single('image'), async (req, res) => {
  try {
    res.json({ character: characterView(await edits.uploadPortrait(req.params.id, req.params.characterId, req.user, req.file)) });
  } catch (err) {
    sendError(res, err, 'Could not change the portrait');
  }
});

// POST /api/publishing/books/:id/characters/:characterId/portrait/generate → { character } (costs tokens)
router.post('/books/:id/characters/:characterId/portrait/generate', authenticate, async (req, res) => {
  try {
    res.json({ character: characterView(await edits.generatePortrait(req.params.id, req.params.characterId, req.user)) });
  } catch (err) {
    sendError(res, err, 'Could not paint a portrait');
  }
});

// ── Admin review ─────────────────────────────────────────────────────────────

const REVIEW_STATUSES = ['pending_review', 'approved', 'rejected', 'minted'];

// A submission as reviewers see it: the publisher's view plus the automated
// screening and who submitted it.
async function adminSummary(book) {
  const publisher = await User.findById(book.publishing?.publisher, 'username email walletAddress').lean();
  return {
    ...(await publishing.bookSummary(book)),
    description: book.description,
    categories: book.categories,
    submittedAt: book.createdAt,
    reviewedAt: book.publishing?.reviewedAt,
    screening: book.publishing?.screening,
    supportNotifiedAt: book.publishing?.supportNotifiedAt,
    publisher: publisher && { id: publisher._id, username: publisher.username, email: publisher.email, wallet: publisher.walletAddress }
  };
}

// GET /api/publishing/admin/submissions?status=pending_review|approved|rejected|minted|all
// → { books } (default: waiting for review, oldest first)
router.get('/admin/submissions', authenticateAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'pending_review';
    const filter = status === 'all'
      ? { 'publishing.status': { $in: REVIEW_STATUSES } }
      : { 'publishing.status': REVIEW_STATUSES.includes(status) ? status : 'pending_review' };
    const books = await Book.find(filter).sort({ createdAt: status === 'pending_review' ? 1 : -1 }).limit(100);
    res.json({ books: await Promise.all(books.map(adminSummary)) });
  } catch (err) {
    sendError(res, err, 'Could not load submissions');
  }
});

// GET /api/publishing/admin/books/:id?from=1&count=10 → { book, pages: [{ pageNumber, text }], totalPages }
router.get('/admin/books/:id', authenticateAdmin, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).catch(() => null);
    if (!book?.publishing?.status) return res.status(404).json({ message: 'Submission not found' });
    const from = Math.max(1, parseInt(req.query.from, 10) || 1);
    const count = Math.min(25, Math.max(1, parseInt(req.query.count, 10) || 10));
    const [pages, totalPages] = await Promise.all([
      Page.find({ bookId: book._id, pageNumber: { $gte: from } }, 'pageNumber pageText').sort('pageNumber').limit(count).lean(),
      Page.countDocuments({ bookId: book._id })
    ]);
    res.json({
      book: await adminSummary(book),
      pages: pages.map((p) => ({ pageNumber: p.pageNumber, text: p.pageText })),
      totalPages
    });
  } catch (err) {
    sendError(res, err, 'Could not load the submission');
  }
});

// POST /api/publishing/admin/books/:id/screen — run the automated check again → { book }
router.post('/admin/books/:id/screen', authenticateAdmin, async (req, res) => {
  try {
    const exists = await Book.exists({ _id: req.params.id, 'publishing.status': { $exists: true } }).catch(() => null);
    if (!exists) return res.status(404).json({ message: 'Submission not found' });
    await publishingReview.screenSubmission(req.params.id);
    res.json({ book: await adminSummary(await Book.findById(req.params.id)) });
  } catch (err) {
    sendError(res, err, 'Could not run the check');
  }
});

// POST /api/publishing/admin/books/:id/review  Body: { approve: boolean, note? }
router.post('/admin/books/:id/review', authenticateAdmin, async (req, res) => {
  try {
    const book = await publishing.review(req.params.id, { approve: !!req.body?.approve, note: req.body?.note });
    res.json({ book: await adminSummary(book) });
  } catch (err) {
    sendError(res, err, 'Could not save the review');
  }
});

// GET /api/publishing/admin/books/:id/edits → { edits } (newest first)
router.get('/admin/books/:id/edits', authenticateAdmin, async (req, res) => {
  try {
    res.json({ edits: await edits.editsFor(req.params.id) });
  } catch (err) {
    sendError(res, err, 'Could not load changes');
  }
});

// POST /api/publishing/admin/edits/:editId/revert → { edit }
router.post('/admin/edits/:editId/revert', authenticateAdmin, async (req, res) => {
  try {
    res.json({ edit: await edits.revertEdit(req.params.editId, req.user) });
  } catch (err) {
    sendError(res, err, 'Could not revert the change');
  }
});

module.exports = router;
