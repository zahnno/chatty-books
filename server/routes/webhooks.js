const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/userModel');
const { downgradeToFreePlan } = require('../services/subscriptionService');
const Subscription = require('../models/subscriptionModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const { OAuth2Client } = require('google-auth-library');
const appleAppStoreService = require('../services/appleAppStoreService');
const googlePlayService = require('../services/googlePlayService');
const { findPlanForProduct, claimEvent, applyStoreSubscription } = require('../services/storeSubscriptionService');
const ProcessedBillingEvent = require('../models/processedBillingEventModel');

// This is your Stripe CLI webhook secret for testing your endpoint locally.
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      endpointSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    // Log all incoming webhook events
    console.log('\nWebhook received:', {
      type: event.type,
      id: event.id,
      object: event.data.object.object,
      // If it's a subscription-related event, log the subscription ID
      subscriptionId: event.data.object.subscription || event.data.object.id,
      // If it's an invoice, log the billing reason
      billingReason: event.data.object.billing_reason,
      // If test clock is present, log it
      testClock: event.data.object.test_clock || null
    });

    // Stripe redelivers events (retries, replays from the dashboard). A second
    // renewal would reset and refill the balance mid-period, so each event is
    // handled once.
    const eventId = `event:${event.id}`;
    if (!(await claimEvent('stripe', eventId, event.type))) {
      return res.json({ received: true, deduped: true });
    }
    try {
      await handleStripeEvent(event);
    } catch (err) {
      await ProcessedBillingEvent.deleteOne({ provider: 'stripe', eventId });
      throw err;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Webhook endpoints on API version 2025-03-31 (basil) or later moved the
// invoice's subscription id under parent.subscription_details. Read either.
const withSubscriptionId = (invoice) => ({
  ...invoice,
  subscription: invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null
});

async function handleStripeEvent(event) {
  switch (event.type) {
    case 'invoice.payment_succeeded':
      const invoice = withSubscriptionId(event.data.object);
      await handleSuccessfulPayment(invoice);
      break;

    case 'invoice.payment_failed':
      const failedInvoice = withSubscriptionId(event.data.object);
      await handleFailedPayment(failedInvoice);
      break;

    case 'customer.subscription.updated':
      const subscription = event.data.object;
      await handleSubscriptionUpdate(subscription);
      break;

    case 'customer.subscription.deleted':
      const cancelledSubscription = event.data.object;
      await handleSubscriptionCancellation(cancelledSubscription);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }
}

async function handleSuccessfulPayment(invoice) {
  if (!invoice.subscription) {
    console.log('Webhook: Skipping - Not a subscription payment');
    return;
  }

  try {
    console.log('Webhook: Processing payment for subscription:', invoice.subscription);
    console.log('Webhook: Payment status:', invoice.status);
    console.log('Webhook: Billing reason:', invoice.billing_reason);
    
    // Only process if payment was successful
    if (invoice.status !== 'paid') {
      console.log('Webhook: Skipping - Invoice not paid. Status:', invoice.status);
      return;
    }

    const user = await User.findOne({ 'subscription.stripeSubscriptionId': invoice.subscription });
    if (!user) {
      console.log('Webhook: Skipping - User not found for subscription:', invoice.subscription);
      return;
    }

    const plan = await Subscription.findById(user.subscription.plan);
    if (!plan) {
      console.log('Webhook: Skipping - Plan not found for user:', user._id);
      return;
    }

    // Handle different billing scenarios
    switch (invoice.billing_reason) {
      case 'subscription_cycle':
        // Regular renewal
        console.log('Webhook: Processing renewal payment');
        await handleRenewalPayment(user, plan, invoice);
        break;
      
      case 'subscription_create':
        // Initial subscription - tokens already added during subscription creation
        console.log('Webhook: Skipping token addition for initial subscription');
        break;
      
      case 'subscription_update':
        // Plan change
        console.log('Webhook: Processing plan change payment');
        await handlePlanChangePayment(user, plan, invoice);
        break;
      
      default:
        console.log('Webhook: Unhandled billing reason:', invoice.billing_reason);
        return;
    }

  } catch (error) {
    console.error('Error handling successful payment:', error);
    throw error;
  }
}

async function handleRenewalPayment(user, plan, invoice) {
  // Update subscription dates
  user.subscription.startDate = new Date(invoice.period_start * 1000);
  user.subscription.endDate = new Date(invoice.period_end * 1000);
  user.subscription.status = 'active';
  await user.save(); // Save BEFORE transactions so tokenBalance isn't overwritten afterward

  console.log('Webhook: Updated subscription dates:', {
    startDate: user.subscription.startDate,
    endDate: user.subscription.endDate
  });

  // Debit existing balance before crediting renewal tokens (reset-on-renewal)
  if (user.tokenBalance > 0) {
    await TokenTransaction.createTransaction({
      userId: user._id,
      amount: user.tokenBalance,
      type: 'debit',
      action: 'subscription_renewal',
      description: `Token balance reset on renewal of ${plan.name}`,
      relatedEntityId: plan._id,
      relatedEntityModel: 'Subscription',
      metadata: { planName: plan.name, resetOnRenewal: true }
    });
  }

  // Add renewal tokens
  const tokenTransaction = await TokenTransaction.createTransaction({
    userId: user._id,
    amount: plan.tokensPerMonth,
    type: 'credit',
    action: 'subscription_renewal',
    description: `Monthly renewal tokens from ${plan.name} subscription`,
    relatedEntityId: plan._id,
    relatedEntityModel: 'Subscription',
    metadata: {
      planName: plan.name,
      planTier: plan.tier,
      isInitial: false,
      provider: 'stripe',
      stripeSubscriptionId: invoice.subscription,
      invoiceId: invoice.id
    }
  });

  console.log('Webhook: Created renewal token transaction:', {
    transactionId: tokenTransaction._id,
    amount: tokenTransaction.amount,
    newBalance: tokenTransaction.balance
  });
}

async function handlePlanChangePayment(user, plan, invoice) {
  // Update subscription dates
  user.subscription.startDate = new Date(invoice.period_start * 1000);
  user.subscription.endDate = new Date(invoice.period_end * 1000);
  user.subscription.status = 'active';
  await user.save(); // Save BEFORE transactions so tokenBalance isn't overwritten afterward

  console.log('Webhook: Updated subscription dates for plan change:', {
    startDate: user.subscription.startDate,
    endDate: user.subscription.endDate
  });

  // Debit existing balance before crediting new plan tokens (reset-on-renewal)
  if (user.tokenBalance > 0) {
    await TokenTransaction.createTransaction({
      userId: user._id,
      amount: user.tokenBalance,
      type: 'debit',
      action: 'subscription_renewal',
      description: `Token balance reset on plan change to ${plan.name}`,
      relatedEntityId: plan._id,
      relatedEntityModel: 'Subscription',
      metadata: { planName: plan.name, resetOnRenewal: true }
    });
  }

  // Add tokens for the new plan
  const tokenTransaction = await TokenTransaction.createTransaction({
    userId: user._id,
    amount: plan.tokensPerMonth,
    type: 'credit',
    action: 'subscription_plan_change',
    description: `Tokens from upgrading to ${plan.name} subscription`,
    relatedEntityId: plan._id,
    relatedEntityModel: 'Subscription',
    metadata: {
      planName: plan.name,
      planTier: plan.tier,
      isInitial: false,
      provider: 'stripe',
      stripeSubscriptionId: invoice.subscription,
      invoiceId: invoice.id
    }
  });

  console.log('Webhook: Created plan change token transaction:', {
    transactionId: tokenTransaction._id,
    amount: tokenTransaction.amount,
    newBalance: tokenTransaction.balance
  });
}

async function handleFailedPayment(invoice) {
  if (!invoice.subscription) {
    console.log('Webhook: Skipping failed payment - Not a subscription payment');
    return;
  }

  try {
    console.log('Webhook: Processing failed payment for subscription:', invoice.subscription);
    
    const user = await User.findOne({ 'subscription.stripeSubscriptionId': invoice.subscription });
    if (!user) {
      console.log('Webhook: Skipping - User not found for subscription:', invoice.subscription);
      return;
    }

    console.log('Webhook: Found user for failed payment:', user._id);

    // Update subscription status to reflect payment failure
    user.subscription.status = 'past_due';
    user.subscription.autoRenew = false; // Disable auto-renewal on payment failure

    // If this is after multiple retries (final attempt), cancel the subscription
    if (invoice.next_payment_attempt === null) {
      console.log('Webhook: Final payment attempt failed, cancelling subscription');
      user.subscription.status = 'cancelled';
      
      // Cancel the subscription in Stripe
      try {
        await stripe.subscriptions.cancel(invoice.subscription);
      } catch (stripeError) {
        console.error('Error cancelling Stripe subscription:', stripeError);
        // Continue with local cancellation even if Stripe call fails
      }
    } else {
      console.log('Webhook: Payment retry scheduled for:', new Date(invoice.next_payment_attempt * 1000));
    }

    await user.save();
    console.log('Webhook: Updated user subscription status to:', user.subscription.status);
  } catch (error) {
    console.error('Error handling failed payment:', error);
    throw error;
  }
}

// Stripe subscription statuses mapped onto User.subscription.status.
const STRIPE_STATUS = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'pending',
  incomplete_expired: 'expired',
  canceled: 'cancelled',
  paused: 'past_due'
};

async function handleSubscriptionUpdate(subscription) {
  try {
    const user = await User.findOne({ 'subscription.stripeSubscriptionId': subscription.id });
    if (!user) return;

    console.log('Webhook: Processing subscription update:', {
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });

    // Only update basic subscription properties
    // Do NOT update dates or add tokens here - that's handled by invoice.payment_succeeded
    user.subscription.status = STRIPE_STATUS[subscription.status] || user.subscription.status;
    // Mirrors cancel/resume made anywhere (our API, Stripe dashboard or portal).
    user.subscription.autoRenew = !subscription.cancel_at_period_end;

    await user.save();
    console.log('Webhook: Updated subscription status to:', user.subscription.status);
  } catch (error) {
    console.error('Error handling subscription update:', error);
    throw error;
  }
}

async function handleSubscriptionCancellation(subscription) {
  console.log('Webhook: Processing subscription cancellation:', {
    subscriptionId: subscription.id,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end
  });

  // Only the live subscription: a plan switch cancels the old one, whose id no
  // longer matches the user.
  const user = await User.findOne({ 'subscription.stripeSubscriptionId': subscription.id });
  if (!user) return;

  // The paid period is over (or it was cancelled outright): back to the free plan.
  await downgradeToFreePlan(user);
}

// ── POST /api/webhooks/apple ─────────────────────────────────────────────────
//
// App Store Server Notifications V2. Apple POSTs { signedPayload } (a JWS);
// authenticity is the signature chaining to Apple's root CAs, verified in
// appleAppStoreService. We never trust the notification alone: subscription
// state is re-fetched from the App Store Server API before touching the user.
// Set this URL (Production + Sandbox) in App Store Connect → App Information.

router.post('/apple', async (req, res) => {
  const signedPayload = req.body?.signedPayload;
  if (!signedPayload || typeof signedPayload !== 'string') {
    return res.status(400).json({ error: 'missing signedPayload' });
  }
  if (!appleAppStoreService.isConfigured()) {
    console.error('[apple] Notification received but App Store billing is not configured');
    return res.status(500).json({ error: 'not configured' }); // Apple retries later
  }

  let payload;
  try {
    payload = await appleAppStoreService.verifyNotification(signedPayload);
  } catch (err) {
    console.error('[apple] Notification verification failed:', err.message);
    return res.status(401).json({ error: 'invalid signature' });
  }

  const eventId = payload.notificationUUID && `notification:${payload.notificationUUID}`;
  try {
    if (eventId && !(await claimEvent('apple', eventId, payload.notificationType))) {
      return res.json({ received: true, deduped: true });
    }
    try {
      if (payload.notificationType !== appleAppStoreService.NotificationTypeV2.TEST) {
        await handleAppleNotification(payload);
      }
    } catch (err) {
      if (eventId) await ProcessedBillingEvent.deleteOne({ provider: 'apple', eventId });
      throw err;
    }
    res.json({ received: true });
  } catch (error) {
    console.error('[apple] Error processing notification:', error);
    res.status(500).json({ error: 'Failed to process notification' }); // Apple retries
  }
});

async function handleAppleNotification(payload) {
  const NT = appleAppStoreService.NotificationTypeV2;
  const signedTx = payload.data?.signedTransactionInfo;
  if (!signedTx) return;

  const tx = await appleAppStoreService.verifyTransaction(signedTx);
  if (tx.type !== 'Auto-Renewable Subscription' || !tx.originalTransactionId) return;

  const user = await User.findOne({ 'subscription.apple.originalTransactionId': tx.originalTransactionId });
  if (!user) {
    // First purchase: /api/billing/apple/validate binds the user (it may not
    // have landed yet). Nothing to reconcile until then.
    console.log('[apple] Notification for unknown originalTransactionId — skipping');
    return;
  }
  if (user.subscription?.provider !== 'apple') return;

  // Refund / revoke — remove access immediately.
  if (payload.notificationType === NT.REFUND || payload.notificationType === NT.REVOKE) {
    user.subscription.status = 'cancelled';
    user.subscription.autoRenew = false;
    await user.save();
    return;
  }

  const sub = await appleAppStoreService.validateSubscription({ transactionId: tx.originalTransactionId });
  const plan = await findPlanForProduct('apple', sub.productId);
  if (!plan) {
    console.warn('[apple] Notification product has no matching plan:', sub.productId);
    return;
  }

  await applyStoreSubscription({
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
      originalTransactionId: tx.originalTransactionId,
      transactionId: sub.transactionId,
      productId: sub.productId,
      environment: sub.environment
    },
    identity: tx.originalTransactionId,
    periodKey: sub.transactionId,
    sandbox: sub.environment === 'Sandbox'
  });
}

// ── POST /api/webhooks/play ──────────────────────────────────────────────────
//
// Google Play Real-time Developer Notifications via a Cloud Pub/Sub push
// subscription. Authenticity is the OIDC token Google signs for the push
// (GOOGLE_PLAY_PUBSUB_AUDIENCE = the audience configured on the subscription,
// GOOGLE_PLAY_PUBSUB_SA_EMAIL = its service account). As with Apple, every
// event re-fetches authoritative state from the Play Developer API.

const PUBSUB_AUDIENCE = process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE;
const PUBSUB_SA_EMAIL = process.env.GOOGLE_PLAY_PUBSUB_SA_EMAIL;
const oauthClient = new OAuth2Client();

async function verifyPubsubToken(req) {
  if (!PUBSUB_AUDIENCE) {
    // Fail closed in production; allow unauthenticated pushes for local setup.
    if (process.env.NODE_ENV === 'production') return false;
    console.warn('[play] GOOGLE_PLAY_PUBSUB_AUDIENCE not set — skipping OIDC verification (non-prod only)');
    return true;
  }
  const match = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!match) return false;
  try {
    const ticket = await oauthClient.verifyIdToken({ idToken: match[1], audience: PUBSUB_AUDIENCE });
    const claims = ticket.getPayload();
    if (!claims?.email_verified) return false;
    if (PUBSUB_SA_EMAIL && claims.email !== PUBSUB_SA_EMAIL) return false;
    return true;
  } catch (err) {
    console.error('[play] Pub/Sub OIDC verification failed:', err.message);
    return false;
  }
}

router.post('/play', async (req, res) => {
  if (!(await verifyPubsubToken(req))) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const message = req.body?.message;
  if (!message?.data) return res.status(204).end();

  let notification;
  try {
    notification = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
  } catch (err) {
    console.error('[play] Failed to decode RTDN payload:', err.message);
    return res.status(204).end(); // won't get better on retry
  }

  const messageId = message.messageId || message.message_id;
  const eventId = messageId && `notification:${messageId}`;
  try {
    if (eventId && !(await claimEvent('play', eventId, 'rtdn'))) {
      return res.json({ received: true, deduped: true });
    }
    try {
      if (notification.subscriptionNotification) {
        await handlePlaySubscriptionNotification(notification.subscriptionNotification);
      } else if (notification.voidedPurchaseNotification) {
        await handlePlayVoidedPurchase(notification.voidedPurchaseNotification);
      } else if (notification.testNotification) {
        console.log('[play] Test notification received');
      }
    } catch (err) {
      if (eventId) await ProcessedBillingEvent.deleteOne({ provider: 'play', eventId });
      throw err;
    }
    res.json({ received: true });
  } catch (error) {
    console.error('[play] Error processing RTDN:', error);
    res.status(500).json({ error: 'Failed to process notification' }); // Pub/Sub retries
  }
});

async function handlePlaySubscriptionNotification({ purchaseToken }) {
  if (!purchaseToken) return;

  const sub = await googlePlayService.validateSubscription({ purchaseToken });

  // A plan change mints a new token linked to the old one; RTDN for the new
  // token can beat /api/billing/play/validate, so also look up by the link.
  const user = await User.findOne({
    $or: [
      { 'subscription.play.purchaseToken': purchaseToken },
      ...(sub.linkedPurchaseToken
        ? [{ 'subscription.play.purchaseToken': sub.linkedPurchaseToken }]
        : []),
      { 'subscription.play.linkedToken': purchaseToken }
    ]
  });
  if (!user) {
    console.log('[play] RTDN for unknown purchaseToken — skipping');
    return;
  }
  if (user.subscription?.provider !== 'play') return;

  // Events for a token this user has since replaced (e.g. the old token
  // expiring after an upgrade) must not overwrite the current subscription.
  const currentToken = user.subscription.play?.purchaseToken;
  if (currentToken !== purchaseToken && currentToken !== sub.linkedPurchaseToken) return;

  const plan = await findPlanForProduct('play', sub.productId);
  if (!plan) {
    console.warn('[play] RTDN product has no matching plan:', sub.productId);
    return;
  }

  await applyStoreSubscription({
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
      linkedToken: currentToken !== purchaseToken ? currentToken : user.subscription.play?.linkedToken,
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

  if (sub.status === 'active' && !sub.acknowledged) {
    await googlePlayService.acknowledgeSubscription({ productId: sub.productId, purchaseToken });
  }
}

async function handlePlayVoidedPurchase({ purchaseToken }) {
  if (!purchaseToken) return;
  const user = await User.findOne({ 'subscription.play.purchaseToken': purchaseToken });
  if (!user || user.subscription?.provider !== 'play') return;

  // Refund / chargeback — remove access immediately.
  user.subscription.status = 'cancelled';
  user.subscription.autoRenew = false;
  await user.save();
}

module.exports = router;
