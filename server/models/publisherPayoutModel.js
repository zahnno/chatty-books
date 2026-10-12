const mongoose = require('mongoose');

// A claim of a published book's earnings, paid on-chain from the payout
// wallet to the wallet holding the book's asset. `microUsd` is reserved on the
// book (publishing.claimedMicroUsd) before anything is sent, so two claims
// can't pay the same earnings.
const publisherPayoutSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Books', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  wallet: { type: String, required: true },
  microUsd: { type: Number, required: true },
  currency: { type: String, enum: ['USDC', 'SKR'], required: true },
  mint: String,
  amount: String, // base units
  decimals: Number,
  usdPrice: Number,
  signature: String,
  status: { type: String, enum: ['sending', 'confirmed', 'failed'], default: 'sending' },
  error: String
}, { timestamps: true });

module.exports = mongoose.models.PublisherPayout || mongoose.model('PublisherPayout', publisherPayoutSchema);
