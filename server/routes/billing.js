const express = require('express');
const router = express.Router();
const User = require('../models/userModel');
const { authenticate } = require('../controllers/auth');
const appleAppStoreService = require('../services/appleAppStoreService');
const googlePlayService = require('../services/googlePlayService');
const { findPlanForProduct, applyStoreSubscription } = require('../services/storeSubscriptionService');

// In-app subscription purchases from the mobile app. Right after the store
// reports a purchase, the app sends us its id; we fetch the authoritative state
// from Apple / Google (never trusting the client), bind the subscription to
// this account, and grant the period's tokens once. Re-validating the same
// purchase (restore, replayed transactions) is a safe no-op. Renewals,
// cancellations and refunds arrive later via routes/webhooks.js.

// ── POST /api/billing/apple/validate ─────────────────────────────────────────
// Body: { transactionId } — the StoreKit transaction id.
router.post('/apple/validate', authenticate, async (req, res) => {
  try {
    if (!appleAppStoreService.isConfigured()) {
      return res.status(503).json({ message: 'App Store purchases are not available right now.' });
    }

    const { transactionId } = req.body;
    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ message: 'transactionId is required' });
    }

    let sub;
    try {
      sub = await appleAppStoreService.validateSubscription({ transactionId });
    } catch (err) {
      console.error('[billing] Apple validateSubscription error:', err.message);
      return res.status(422).json({ message: 'Could not validate App Store purchase' });
    }

    const plan = await findPlanForProduct('apple', sub.productId);
    if (!plan) {
      console.warn('[billing] Apple product has no matching plan:', sub.productId);
      return res.status(422).json({ message: 'Unknown subscription product' });
    }
    if (!['active', 'past_due'].includes(sub.status)) {
      return res.status(422).json({ message: 'Subscription is not active', status: sub.status });
    }
    if (!sub.originalTransactionId) {
      return res.status(422).json({ message: 'App Store purchase has no transaction id' });
    }

    // Anti-replay: an App Store subscription binds to exactly one account.
    const otherOwner = await User.exists({
      'subscription.apple.originalTransactionId': sub.originalTransactionId,
      _id: { $ne: req.user._id }
    });
    if (otherOwner) {
      return res.status(409).json({ message: 'This purchase is linked to another account' });
    }

    const user = await User.findById(req.user._id);
    const { granted } = await applyStoreSubscription({
      user,
      provider: 'apple',
      plan,
      state: {
        status: sub.status,
        startDate: sub.purchaseDate,
        endDate: sub.expiresDate,
        autoRenew: sub.autoRenew
      },
      storeData: {
        originalTransactionId: sub.originalTransactionId,
        transactionId: sub.transactionId,
        productId: sub.productId,
        environment: sub.environment
      },
      identity: sub.originalTransactionId,
      periodKey: sub.transactionId,
      sandbox: sub.environment === 'Sandbox'
    });

    res.json({ status: sub.status, planId: plan._id, endDate: sub.expiresDate, granted });
  } catch (err) {
    console.error('[billing] Apple validate error:', err);
    res.status(500).json({ message: 'Failed to process App Store purchase' });
  }
});

// ── POST /api/billing/play/validate ──────────────────────────────────────────
// Body: { purchaseToken } — from the Play purchase. We also acknowledge it
// server-side so Google doesn't auto-refund after 3 days.
router.post('/play/validate', authenticate, async (req, res) => {
  try {
    if (!googlePlayService.isConfigured()) {
      return res.status(503).json({ message: 'Google Play purchases are not available right now.' });
    }

    const { purchaseToken } = req.body;
    if (!purchaseToken || typeof purchaseToken !== 'string') {
      return res.status(400).json({ message: 'purchaseToken is required' });
    }

    let sub;
    try {
      sub = await googlePlayService.validateSubscription({ purchaseToken });
    } catch (err) {
      console.error('[billing] Play validateSubscription error:', err.message);
      return res.status(422).json({ message: 'Could not validate Google Play purchase' });
    }

    const plan = await findPlanForProduct('play', sub.productId);
    if (!plan) {
      console.warn('[billing] Play product has no matching plan:', sub.productId);
      return res.status(422).json({ message: 'Unknown subscription product' });
    }
    // Payment still processing — the client leaves it unacknowledged and RTDN
    // provisions it once it clears.
    if (sub.status === 'pending') {
      return res.status(202).json({ status: 'pending' });
    }
    if (!['active', 'past_due'].includes(sub.status)) {
      return res.status(422).json({ message: 'Subscription is not active', status: sub.status });
    }

    const otherOwner = await User.exists({
      'subscription.play.purchaseToken': purchaseToken,
      _id: { $ne: req.user._id }
    });
    if (otherOwner) {
      return res.status(409).json({ message: 'This purchase is linked to another account' });
    }

    const user = await User.findById(req.user._id);
    const priorToken = user.subscription?.play?.purchaseToken;
    const { granted } = await applyStoreSubscription({
      user,
      provider: 'play',
      plan,
      state: {
        status: sub.status,
        startDate: sub.startTime,
        endDate: sub.expiryTime,
        autoRenew: sub.autoRenew
      },
      storeData: {
        purchaseToken,
        // A plan change replaces the token; keep the old one so late
        // notifications for it still find this user.
        linkedToken: priorToken && priorToken !== purchaseToken
          ? priorToken
          : user.subscription?.play?.linkedToken,
        productId: sub.productId,
        basePlanId: sub.basePlanId,
        testPurchase: sub.testPurchase,
        orderId: sub.orderId
      },
      identity: purchaseToken,
      previousIdentity: sub.linkedPurchaseToken,
      periodKey: sub.orderId,
      sandbox: sub.testPurchase
    });

    if (!sub.acknowledged) {
      try {
        await googlePlayService.acknowledgeSubscription({ productId: sub.productId, purchaseToken });
      } catch (err) {
        // Non-fatal: the next validate / RTDN re-acknowledges.
        console.error('[billing] Play acknowledge error:', err.message);
      }
    }

    res.json({ status: sub.status, planId: plan._id, endDate: sub.expiryTime, granted });
  } catch (err) {
    console.error('[billing] Play validate error:', err);
    res.status(500).json({ message: 'Failed to process Google Play purchase' });
  }
});

module.exports = router;
