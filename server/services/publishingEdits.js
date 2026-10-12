/**
 * Editing community-published books and their characters.
 *
 * Who may edit: admins; the publisher until the book is minted; after that,
 * whoever holds the book's NFT (editing rights move with it, as the
 * submission terms say). Rejected books can't be edited.
 *
 * Every change is logged (BookEdit) with the old values so an admin can put
 * it back. Changes to live books apply at once, then are screened by AI and
 * emailed to support, since readers are chatting with these characters.
 * The author is fixed once the book is minted.
 */
const Book = require('../models/bookModel');
const Character = require('../models/characterModel');
const BookEdit = require('../models/bookEditModel');
const User = require('../models/userModel');
const ImageGeneration = require('../models/imageGenerationModel');
const privateer = require('./privateerClient');
const EmailService = require('./emailService');
const CostEstimateService = require('./costEstimateService');
const { uploadOptimizedImage } = require('./imageOptimization');
const publishing = require('./solana/publishing');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const BOOK_FIELDS = ['title', 'author', 'description', 'tagline', 'categories'];
const CHARACTER_TEXT_FIELDS = ['firstName', 'lastName', 'intro', 'description', 'appearance', 'events', 'gender'];
const CHARACTER_LIST_FIELDS = ['personalityTraits', 'strengths', 'weaknesses', 'goals'];
const CHARACTER_FIELDS = [...CHARACTER_TEXT_FIELDS, ...CHARACTER_LIST_FIELDS];
const LIMITS = { title: 200, author: 200, tagline: 300, description: 4000, intro: 2000, appearance: 2000, events: 4000, firstName: 80, lastName: 80, gender: 40 };

// ── Permissions ──────────────────────────────────────────────────────────────

const { editRefusal } = publishing;

async function loadEditable(bookId, user) {
  const book = await Book.findById(bookId).catch(() => null);
  const refusal = await editRefusal(book, user);
  if (refusal) throw httpError(book?.publishing?.status ? 403 : 404, refusal);
  return book;
}

async function loadCharacter(book, characterId) {
  const character = await Character.findOne({ _id: characterId, bookId: book._id }).catch(() => null);
  if (!character) throw httpError(404, 'Character not found');
  return character;
}

// ── Input ────────────────────────────────────────────────────────────────────

const cleanText = (value, field) => String(value ?? '').trim().slice(0, LIMITS[field] || 2000);
const cleanList = (value) => (Array.isArray(value) ? value : String(value ?? '').split(','))
  .map((v) => String(v).trim().slice(0, 120))
  .filter(Boolean)
  .slice(0, 12);

/** The allowed, cleaned fields of `body` that differ from `doc`: { before, after }. */
function diff(doc, body, fields, listFields = []) {
  const before = {};
  const after = {};
  for (const field of fields) {
    if (body[field] === undefined) continue;
    const isList = listFields.includes(field);
    const next = isList ? cleanList(body[field]) : cleanText(body[field], field);
    const current = doc[field] ?? (isList ? [] : '');
    if (JSON.stringify(isList ? [...current] : current) === JSON.stringify(next)) continue;
    before[field] = isList ? [...current] : current;
    after[field] = next;
  }
  return { before, after };
}

const characterName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed character';
const snapshot = (character) => {
  const out = { image_url: character.image_url };
  for (const f of CHARACTER_FIELDS) out[f] = Array.isArray(character[f]) ? [...character[f]] : character[f];
  return out;
};

// ── Change log, screening, email ─────────────────────────────────────────────

async function record(book, user, fields) {
  const edit = await BookEdit.create({
    bookId: book._id,
    userId: user._id,
    wallet: user.walletAddress,
    live: book.publishing.status === 'minted',
    ...fields
  });
  if (edit.live) reviewLiveEdit(edit._id);
  return edit;
}

function editScreeningPrompt(book, edit) {
  return `You review edits to a book on Chatty Books, where readers chat with AI versions of a book's characters and the book's NFT holder earns from those chats. The holder (possibly someone who bought the NFT, not the author) just changed something on a live book.

Flag the edit as suspect if the new text: promotes products, links, wallets, tokens or giveaways; asks readers for money, keys or personal details; impersonates a real person; contains sexual content involving minors, hate or instructions for serious harm; or turns a character into something clearly unrelated to the book. Ordinary fixes, rewrites and new characters that fit the book are fine.

Return ONLY a JSON object, no markdown:
{ "verdict": "clear" | "suspect", "reasons": string[], "summary": string }

Book: ${book.title} by ${book.author || 'unknown'}
Change: ${edit.action} ${edit.target} (${edit.label})
Before: ${JSON.stringify(edit.before || {}).slice(0, 6000)}
After: ${JSON.stringify(edit.after || {}).slice(0, 6000)}`;
}

/** Screen a live edit and email support about it. Never throws. */
async function reviewLiveEdit(editId) {
  try {
    const edit = await BookEdit.findById(editId);
    const book = await Book.findById(edit.bookId).lean();
    let screening;
    try {
      const result = await privateer.generateText(editScreeningPrompt(book, edit));
      const parsed = JSON.parse(privateer.cleanJson(result.text));
      screening = {
        verdict: parsed.verdict === 'clear' ? 'clear' : 'suspect',
        reasons: (Array.isArray(parsed.reasons) ? parsed.reasons : []).map((r) => String(r).slice(0, 300)).slice(0, 6),
        summary: String(parsed.summary || '').slice(0, 500),
        checkedAt: new Date()
      };
    } catch (err) {
      screening = { verdict: 'error', error: err.message.slice(0, 300), checkedAt: new Date() };
    }
    edit.screening = screening;
    await edit.save();
    const editor = await User.findById(edit.userId, 'username email walletAddress').lean();
    await EmailService.sendPublishingEditNotice(book, edit.toObject(), editor);
  } catch (err) {
    console.error(`[publishing] Edit review failed for ${editId}:`, err.message);
  }
}

// ── Book ─────────────────────────────────────────────────────────────────────

async function updateBook(bookId, user, body) {
  const book = await loadEditable(bookId, user);
  const fields = book.publishing.status === 'minted' ? BOOK_FIELDS.filter((f) => f !== 'author') : BOOK_FIELDS;
  const { before, after } = diff(book, body || {}, fields, ['categories']);
  if (after.title === '') throw httpError(400, 'A book needs a title');
  if (!Object.keys(after).length) return book;
  book.set(after);
  await book.save();
  await record(book, user, { target: 'book', targetId: book._id, action: 'update', label: `Book: ${Object.keys(after).join(', ')}`, before, after });
  return book;
}

async function uploadImage(buffer, key) {
  const result = await uploadOptimizedImage(buffer, key, { maxWidth: 1920, maxHeight: 1920, quality: 90, format: 'webp' });
  return result.mainUrl;
}

async function updateCover(bookId, user, file) {
  if (!file) throw httpError(400, 'Choose a JPEG or PNG image');
  const book = await loadEditable(bookId, user);
  const before = { image_url: book.image_url };
  book.image_url = await uploadImage(file.buffer, `book-cover-${book._id}-${Date.now()}`);
  await book.save();
  await record(book, user, { target: 'book', targetId: book._id, action: 'update', label: 'Book: cover', before, after: { image_url: book.image_url } });
  return book;
}

// ── Characters ───────────────────────────────────────────────────────────────

async function createCharacter(bookId, user, body) {
  const book = await loadEditable(bookId, user);
  const { after } = diff({}, body || {}, CHARACTER_FIELDS, CHARACTER_LIST_FIELDS);
  if (!after.firstName) throw httpError(400, 'A character needs a name');
  const character = await Character.create({ ...after, bookId: book._id });
  await record(book, user, { target: 'character', targetId: character._id, action: 'create', label: `New character: ${characterName(character)}`, after: snapshot(character) });
  return character;
}

async function updateCharacter(bookId, characterId, user, body) {
  const book = await loadEditable(bookId, user);
  const character = await loadCharacter(book, characterId);
  const { before, after } = diff(character, body || {}, CHARACTER_FIELDS, CHARACTER_LIST_FIELDS);
  if (after.firstName === '') throw httpError(400, 'A character needs a name');
  if (!Object.keys(after).length) return character;
  character.set(after);
  await character.save();
  await record(book, user, { target: 'character', targetId: character._id, action: 'update', label: `${characterName(character)}: ${Object.keys(after).join(', ')}`, before, after });
  return character;
}

async function deleteCharacter(bookId, characterId, user) {
  const book = await loadEditable(bookId, user);
  const character = await loadCharacter(book, characterId);
  const before = snapshot(character);
  await Character.deleteOne({ _id: character._id });
  await record(book, user, { target: 'character', targetId: character._id, action: 'delete', label: `Removed character: ${characterName(character)}`, before });
}

async function setPortrait(book, character, user, imageUrl, how) {
  const before = { image_url: character.image_url };
  character.image_url = imageUrl;
  await character.save();
  await record(book, user, { target: 'character', targetId: character._id, action: 'update', label: `${characterName(character)}: portrait (${how})`, before, after: { image_url: imageUrl } });
  return character;
}

async function uploadPortrait(bookId, characterId, user, file) {
  if (!file) throw httpError(400, 'Choose a JPEG or PNG image');
  const book = await loadEditable(bookId, user);
  const character = await loadCharacter(book, characterId);
  const url = await uploadImage(file.buffer, `character-${character._id}-${Date.now()}`);
  return setPortrait(book, character, user, url, 'uploaded');
}

/** Paint a new portrait from the character's appearance, charged to the editor's tokens. */
async function generatePortrait(bookId, characterId, user) {
  const book = await loadEditable(bookId, user);
  const character = await loadCharacter(book, characterId);
  if (!character.appearance) throw httpError(400, 'Describe how the character looks first');
  const prompt = `close up portrait of ${character.appearance} in the style of ${book.style}, ${character.race || ''}, ${character.gender || ''}`;

  const generation = await ImageGeneration.create({ userId: user._id, prompt, status: 'processing', characterId: character._id });
  const estimate = await CostEstimateService.estimateImageCost(user._id, prompt, generation._id);
  const fresh = await User.findById(user._id, 'tokenBalance').lean();
  if ((fresh?.tokenBalance || 0) < estimate.tokenQuote.totalTokens) {
    await ImageGeneration.updateOne({ _id: generation._id }, { $set: { status: 'failed' } });
    throw httpError(402, `A new portrait costs ${estimate.tokenQuote.totalTokens.toLocaleString()} tokens. Top up to paint one.`);
  }
  let url;
  try {
    const base64 = await privateer.generateImage(prompt);
    url = await uploadImage(Buffer.from(base64, 'base64'), `character-${character._id}-${Date.now()}`);
  } catch (err) {
    await ImageGeneration.updateOne({ _id: generation._id }, { $set: { status: 'failed' } });
    throw httpError(502, "The portrait couldn't be painted. You weren't charged.");
  }
  await estimate.checkAndDeductTokens();
  await ImageGeneration.updateOne({ _id: generation._id }, { $set: { status: 'completed', imageUrl: url } });
  return setPortrait(book, character, user, url, 'painted');
}

// ── Views ────────────────────────────────────────────────────────────────────

async function editView(bookId, user) {
  const book = await loadEditable(bookId, user);
  const characters = await Character.find({ bookId: book._id }).lean();
  return {
    book: {
      id: book._id,
      title: book.title,
      author: book.author,
      description: book.description,
      tagline: book.tagline,
      categories: book.categories,
      image_url: book.image_url,
      status: book.publishing.status,
      authorLocked: book.publishing.status === 'minted' && user.role !== 'admin',
      live: book.publishing.status === 'minted'
    },
    characters: characters.map((c) => ({ id: c._id, image_url: c.image_url, ...snapshot(c) }))
  };
}

// ── Admin ────────────────────────────────────────────────────────────────────

const editsFor = (bookId) => BookEdit.find({ bookId }).sort({ createdAt: -1 }).limit(100).populate('userId', 'username email').lean();

/** Put back the values from before an edit. */
async function revertEdit(editId, admin) {
  const edit = await BookEdit.findById(editId).catch(() => null);
  if (!edit) throw httpError(404, 'Change not found');
  if (edit.status === 'reverted') throw httpError(409, 'This change was already reverted');

  if (edit.target === 'book') {
    await Book.updateOne({ _id: edit.bookId }, { $set: edit.before });
  } else if (edit.action === 'create') {
    await Character.deleteOne({ _id: edit.targetId, bookId: edit.bookId });
  } else if (edit.action === 'delete') {
    if (!(await Character.exists({ _id: edit.targetId }))) {
      await Character.create({ ...edit.before, _id: edit.targetId, bookId: edit.bookId });
    }
  } else {
    await Character.updateOne({ _id: edit.targetId, bookId: edit.bookId }, { $set: edit.before });
  }
  edit.status = 'reverted';
  edit.revertedAt = new Date();
  edit.revertedBy = admin._id;
  await edit.save();
  return edit;
}

module.exports = {
  editView,
  updateBook,
  updateCover,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  uploadPortrait,
  generatePortrait,
  editsFor,
  revertEdit
};
