const mongoose = require('mongoose');

// Single-use nonces for Sign In With Solana. Issued by /api/solana/auth/challenge,
// consumed (deleted) when a signed message quoting them is verified, and
// expired by the TTL index if never used.
const solanaNonceSchema = new mongoose.Schema({
  nonce: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
});

solanaNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SolanaNonce', solanaNonceSchema);
