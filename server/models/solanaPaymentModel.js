const mongoose = require('mongoose');

// A crypto checkout for a 30-day plan pass on the Seeker build. The server
// quotes the price, builds the transfer (tagged with a unique Solana Pay
// `reference` key) and later finds the landed transaction by that reference,
// so a payment the app never reported back still gets confirmed by the
// reconcile job.
const solanaPaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true },
    currency: { type: String, enum: ['USDC', 'SOL', 'SKR'], required: true },
    // Base units (lamports / token atoms) as a string: u64 doesn't fit a double.
    amount: { type: String, required: true },
    decimals: { type: Number, required: true },
    mint: { type: String }, // unset for SOL
    usdAmount: { type: Number, required: true },
    usdPrice: { type: Number, required: true }, // USD per whole coin at quote time
    payer: { type: String, required: true },
    recipient: { type: String, required: true }, // treasury wallet
    reference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'expired'],
      default: 'pending',
      index: true
    },
    signature: { type: String },
    // Transactions can't be built for the quote after this.
    expiresAt: { type: Date, required: true },
    confirmedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SolanaPayment', solanaPaymentSchema);
