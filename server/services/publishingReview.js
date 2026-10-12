/**
 * What happens after a book is submitted for publishing: an automated
 * screening reads the title, author and first pages for rights and content
 * problems, then support gets an email asking for a review, with the
 * screening result and a link to the admin review page. The screening only
 * flags; an admin approves or rejects.
 */
const Book = require('../models/bookModel');
const Page = require('../models/pageModel');
const User = require('../models/userModel');
const privateer = require('./privateerClient');
const EmailService = require('./emailService');

const SCREEN_PAGES = 10;
const SCREEN_CHARS = 24000;

const LEVELS = ['low', 'medium', 'high'];
const level = (value) => (LEVELS.includes(value) ? value : 'medium');

function screeningPrompt(book, text) {
  return `You screen books that users submit to Chatty Books, a reading app where readers chat with AI versions of a book's characters. A publisher who mints a book earns money from those chats, so we must not publish books the submitter has no right to, or content we can't host.

Judge two risks from the title, author and opening pages below.

1. Copyright: is this a commercially published, in-copyright work (a well-known novel, a bestseller, a book still sold by a publisher), or text copied from one? Public-domain classics (author died more than 95 years ago, e.g. pre-1929 works) are low risk. Original, self-published or obscure writing with no sign of being someone else's work is low risk. If the text matches a famous published book under a different title or author, that is high risk.
2. Content: sexual content involving minors, sexual violence presented approvingly, instructions for serious harm, extremist propaganda or hate. Mature but legitimate fiction (violence, romance, dark themes) is fine.

Return ONLY a JSON object, no markdown:
{
  "copyrightRisk": "low" | "medium" | "high",
  "knownWork": string | null,   // "Title by Author" if you recognise it as a published work, else null
  "contentRisk": "low" | "medium" | "high",
  "reasons": string[],          // short, specific observations a reviewer can check
  "summary": string             // one sentence for the reviewer
}

Submitted title: ${book.title}
Submitted author: ${book.author || 'unknown'}

Opening pages:
${text}`;
}

/** Run the automated screening and store it on the book. Never throws. */
async function screenSubmission(bookId) {
  const book = await Book.findById(bookId);
  if (!book) return null;
  let screening;
  try {
    const pages = await Page.find({ bookId }, 'pageNumber pageText').sort('pageNumber').limit(SCREEN_PAGES).lean();
    const text = pages.map((p) => p.pageText || '').join('\n\n').slice(0, SCREEN_CHARS);
    if (!text.trim()) throw new Error('The book has no readable text');

    const result = await privateer.generateText(screeningPrompt(book, text));
    const parsed = JSON.parse(privateer.cleanJson(result.text));
    const copyrightRisk = level(parsed.copyrightRisk);
    const contentRisk = level(parsed.contentRisk);
    screening = {
      verdict: copyrightRisk === 'low' && contentRisk === 'low' ? 'clear' : 'suspect',
      copyrightRisk,
      contentRisk,
      knownWork: typeof parsed.knownWork === 'string' && parsed.knownWork.trim() ? parsed.knownWork.trim().slice(0, 200) : undefined,
      reasons: (Array.isArray(parsed.reasons) ? parsed.reasons : []).map((r) => String(r).slice(0, 300)).slice(0, 6),
      summary: String(parsed.summary || '').slice(0, 500),
      checkedAt: new Date()
    };
  } catch (err) {
    console.error(`[publishing] Screening failed for ${bookId}:`, err.message);
    screening = { verdict: 'error', error: err.message.slice(0, 300), checkedAt: new Date() };
  }
  await Book.updateOne({ _id: bookId }, { $set: { 'publishing.screening': screening } });
  return screening;
}

/** Email support that a book is waiting for review. Never throws. */
async function notifySupport(bookId) {
  try {
    const book = await Book.findById(bookId).lean();
    if (!book) return;
    const publisher = await User.findById(book.publishing?.publisher, 'username email walletAddress').lean();
    await EmailService.sendPublishingReviewRequest(book, publisher);
    await Book.updateOne({ _id: bookId }, { $set: { 'publishing.supportNotifiedAt': new Date() } });
  } catch (err) {
    console.error(`[publishing] Review email failed for ${bookId}:`, err.message);
  }
}

/** Screen a new submission, then ask support to review it. */
async function reviewSubmission(bookId) {
  await screenSubmission(bookId);
  await notifySupport(bookId);
}

module.exports = { screenSubmission, notifySupport, reviewSubmission };
