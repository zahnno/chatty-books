const mongoose = require('mongoose');

// A publisher's or holder's change to a community-published book or one of
// its characters, kept so admins can see what changed and put it back. Edits
// to live (minted) books are also screened and emailed to support.
const bookEditSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Books', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wallet: String,
  live: { type: Boolean, default: false }, // the book was minted when this was made
  target: { type: String, enum: ['book', 'character'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: { type: String, enum: ['update', 'create', 'delete'], required: true },
  label: String, // what changed, for people: "Alice: description, goals"
  before: mongoose.Schema.Types.Mixed, // the changed fields' old values (whole character for delete)
  after: mongoose.Schema.Types.Mixed,
  screening: {
    verdict: { type: String, enum: ['clear', 'suspect', 'error'] },
    reasons: [String],
    summary: String,
    checkedAt: Date,
    error: String
  },
  status: { type: String, enum: ['applied', 'reverted'], default: 'applied' },
  revertedAt: Date,
  revertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.models.BookEdit || mongoose.model('BookEdit', bookEditSchema);
