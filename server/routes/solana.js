const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/userModel');
const Subscription = require('../models/subscriptionModel');
const SolanaPayment = require('../models/solanaPaymentModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const { authenticate } = require('../controllers/auth');
const { renewFreeTierIfExpired } = require('../services/subscriptionService');
const { CHAIN, normalizeAddress } = require('../services/solana/core');
const { createChallenge, verifySignIn } = require('../services/solana/siws');
const { checkSeekerBonus, claimSeekerBonus, bonusTokens } = require('../services/solana/sgt');
const payments = require('../services/solana/payments');

// Solana features for the Seeker (Solana dApp Store) build: Sign In With
// Solana, wallet linking, the Seeker Genesis Token bonus, and crypto checkout
// for plan passes. See services/solana/*.

const sendError = (res, err, fallback) => {
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(`[solana] ${fallback}:`, err);
  res.status(500).json({ message: fallback });
};

const shortAddress = (address) => `${address.slice(0, 4)}…${address.slice(-4)}`;

// ── GET /api/solana/config ───────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    res.json({
      chain: CHAIN,
      currencies: await payments.availableCurrencies(),
      seekerBonusTokens: bonusTokens()
    });
  } catch (err) {
    sendError(res, err, 'Could not load Solana settings');
  }
});

// ── Sign In With Solana ──────────────────────────────────────────────────────

// POST /api/solana/auth/challenge  Body: { address? }
// Returns the sign-in payload for Mobile Wallet Adapter. With `address`
// (wallets without sign-in support), also the exact message to sign.
router.post('/auth/challenge', async (req, res) => {
  try {
    const { address } = req.body || {};
    const wallet = address ? normalizeAddress(address) : undefined;
    if (address && !wallet) return res.status(400).json({ message: 'Invalid wallet address' });
    res.json(await createChallenge(wallet));
  } catch (err) {
    sendError(res, err, 'Could not start sign-in');
  }
});

// POST /api/solana/auth/verify  Body: { address, signedMessage, signature } (base64)
// Signs in to the account linked to this wallet, creating a wallet-only
// account the first time.
router.post('/auth/verify', async (req, res) => {
  try {
    const wallet = await verifySignIn(req.body || {});

    let user = await User.findOne({ walletAddress: wallet });
    let created = false;
    if (!user) {
      user = await User.create({ walletAddress: wallet, username: shortAddress(wallet) });
      created = true;
      const freePlan = await Subscription.findById(user.subscription.plan);
      if (freePlan) {
        await TokenTransaction.createTransaction({
          userId: user._id,
          amount: freePlan.tokensPerMonth,
          type: 'credit',
          action: 'subscription_purchase',
          description: `Initial tokens from ${freePlan.name} subscription`,
          relatedEntityId: freePlan._id,
          relatedEntityModel: 'Subscription',
          metadata: { planName: freePlan.name, planTier: freePlan.tier, isInitial: true }
        });
      }
    }
    await renewFreeTierIfExpired(user);

    const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, { expiresIn: '23 hours' });
    res.json({ token, created });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Please try signing in again' });
    sendError(res, err, 'Could not sign in with this wallet');
  }
});

// ── Wallet on the signed-in account ──────────────────────────────────────────

const walletStatus = (user) => ({
  walletAddress: user.walletAddress || null,
  seekerBonus: user.seekerBonus?.claimedAt
    ? { claimedAt: user.seekerBonus.claimedAt, tokens: user.seekerBonus.tokens }
    : null,
  // Another way in besides the wallet, so unlinking can't lock them out.
  canUnlink: !!user.walletAddress && !!((user.email && user.password) || user.googleId)
});

// GET /api/solana/wallet
router.get('/wallet', authenticate, (req, res) => {
  res.json(walletStatus(req.user));
});

// POST /api/solana/wallet/link  Body: { address, signedMessage, signature }
// Proves the wallet with a SIWS signature and links it to this account.
router.post('/wallet/link', authenticate, async (req, res) => {
  try {
    const wallet = await verifySignIn(req.body || {});
    if (req.user.walletAddress === wallet) return res.json(walletStatus(req.user));

    const owner = await User.findOne({ walletAddress: wallet }, '_id');
    if (owner) {
      return res.status(409).json({ message: 'This wallet is already linked to another Chatty Books account' });
    }
    req.user.walletAddress = wallet;
    await req.user.save();
    res.json(walletStatus(req.user));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'This wallet is already linked to another Chatty Books account' });
    }
    sendError(res, err, 'Could not link this wallet');
  }
});

// DELETE /api/solana/wallet
router.delete('/wallet', authenticate, async (req, res) => {
  try {
    if (!walletStatus(req.user).canUnlink) {
      return res.status(409).json({ message: 'This wallet is how you sign in, so it can\'t be removed' });
    }
    req.user.walletAddress = undefined;
    await req.user.save();
    res.json(walletStatus(req.user));
  } catch (err) {
    sendError(res, err, 'Could not remove this wallet');
  }
});

// ── Seeker Genesis Token bonus ───────────────────────────────────────────────

const BONUS_MESSAGES = {
  no_wallet: 'Connect your wallet first.',
  already_claimed: 'You have already claimed your Seeker bonus.',
  no_sgt: 'No Seeker Genesis Token was found in this wallet.',
  sgt_used: 'The bonus for this Seeker has already been claimed.'
};

// GET /api/solana/seeker-bonus → { eligible, tokens, reason? } (checks, doesn't claim)
router.get('/seeker-bonus', authenticate, async (req, res) => {
  try {
    res.json(await checkSeekerBonus(req.user));
  } catch (err) {
    sendError(res, err, 'Could not check for a Seeker Genesis Token');
  }
});

// POST /api/solana/seeker-bonus
router.post('/seeker-bonus', authenticate, async (req, res) => {
  try {
    const result = await claimSeekerBonus(req.user);
    if (!result.granted) {
      return res.status(409).json({ reason: result.reason, message: BONUS_MESSAGES[result.reason] });
    }
    res.json(result);
  } catch (err) {
    sendError(res, err, 'Could not check for a Seeker Genesis Token');
  }
});

// ── Checkout ─────────────────────────────────────────────────────────────────

// GET /api/solana/quotes → { quotes: { [planId]: { [currency]: { amount, decimals } } } }
router.get('/quotes', async (req, res) => {
  try {
    res.json({ quotes: await payments.quotePlans() });
  } catch (err) {
    sendError(res, err, 'Could not load prices');
  }
});

// POST /api/solana/payments  Body: { planId, currency, payer }
// → { paymentId, transaction (base64, unsigned), amount, decimals, currency, expiresAt }
router.post('/payments', authenticate, async (req, res) => {
  try {
    const { planId, currency, payer } = req.body || {};
    const { payment, transaction } = await payments.createPayment({ user: req.user, planId, currency, payer });
    res.status(201).json({
      paymentId: payment._id,
      transaction,
      currency: payment.currency,
      amount: payment.amount,
      decimals: payment.decimals,
      usdAmount: payment.usdAmount,
      expiresAt: payment.expiresAt
    });
  } catch (err) {
    sendError(res, err, 'Could not start the payment');
  }
});

const findPayment = (req) => SolanaPayment.findOne({ _id: req.params.id, userId: req.user._id }).catch(() => null);

// POST /api/solana/payments/:id/transaction — a fresh transaction (new blockhash).
router.post('/payments/:id/transaction', authenticate, async (req, res) => {
  try {
    const payment = await findPayment(req);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json({ transaction: await payments.buildTransaction(payment) });
  } catch (err) {
    sendError(res, err, 'Could not prepare the payment');
  }
});

// POST /api/solana/payments/:id/confirm  Body: { signature? }
// → { status: 'pending' | 'confirmed' | 'expired' }. The app polls this after
// sending; 'pending' means the transaction hasn't landed (yet).
router.post('/payments/:id/confirm', authenticate, async (req, res) => {
  try {
    const payment = await findPayment(req);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(await payments.confirmPayment(payment, req.body?.signature));
  } catch (err) {
    sendError(res, err, 'Could not confirm the payment');
  }
});

module.exports = router;
