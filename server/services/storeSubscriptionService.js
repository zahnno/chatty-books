/**
 * Provisioning for App Store / Google Play subscriptions.
 *
 * Both the client validate endpoints (routes/billing.js) and the store
 * webhooks (routes/webhooks.js) funnel verified store state through
 * applyStoreSubscription, so the two paths can race without double-granting:
 * the token grant for a paid period is claimed in ProcessedBillingEvent under
 * that period's store id (Apple transactionId / Play orderId), and whichever
 * path claims it first grants.
 *
 * Token semantics mirror the Stripe path (routes/webhooks.js):
 *   - first purchase     → credit plan.tokensPerMonth (balance kept)
 *   - renewal            → reset balance, credit plan.tokensPerMonth
 *   - plan change        → reset balance, credit the new plan's tokens
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Subscription = require('../models/subscriptionModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const ProcessedBillingEvent = require('../models/processedBillingEventModel');

/** The active plan a store productId belongs to, or null. */
function findPlanForProduct(provider, productId) {
  if (!productId) return null;
  const field = provider === 'apple' ? 'appleProductId' : 'playProductId';
  return Subscription.findOne({ [field]: productId, isActive: true });
}

/**
 * Claim a once-only event. Returns true if this caller claimed it, false if
 * it was already claimed.
 */
async function claimEvent(provider, eventId, type) {
  try {
    await ProcessedBillingEvent.create({ provider, eventId, type });
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

function releaseEvent(provider, eventId) {
  return ProcessedBillingEvent.deleteOne({ provider, eventId });
}

async function grantPlanTokens(user, plan, { kind, provider, metadata }) {
  if (kind !== 'initial' && user.tokenBalance > 0) {
    await TokenTransaction.createTransaction({
      userId: user._id,
      amount: user.tokenBalance,
      type: 'debit',
      action: 'subscription_renewal',
      description: kind === 'plan_change'
        ? `Token balance reset on plan change to ${plan.name}`
        : `Token balance reset on renewal of ${plan.name}`,
      relatedEntityId: plan._id,
      relatedEntityModel: 'Subscription',
      metadata: { planName: plan.name, resetOnRenewal: true, provider }
    });
  }

  const action = {
    initial: 'subscription_purchase',
    renewal: 'subscription_renewal',
    plan_change: 'subscription_plan_change'
  }[kind];
  const description = {
    initial: `Initial tokens from ${plan.name} subscription`,
    renewal: `Monthly renewal tokens from ${plan.name} subscription`,
    plan_change: `Tokens from changing to ${plan.name} subscription`
  }[kind];

  await TokenTransaction.createTransaction({
    userId: user._id,
    amount: plan.tokensPerMonth,
    type: 'credit',
    action,
    description,
    relatedEntityId: plan._id,
    relatedEntityModel: 'Subscription',
    metadata: {
      planName: plan.name,
      planTier: plan.tier,
      isInitial: kind === 'initial',
      provider,
      ...metadata
    }
  });
}

/**
 * Write verified store state onto the user and grant the current period's
 * tokens (once).
 *
 * @param {object} args
 * @param {import('mongoose').Document} args.user
 * @param {'apple'|'play'} args.provider
 * @param {object} args.plan       Subscription doc the productId maps to
 * @param {object} args.state      { status, startDate, endDate, autoRenew }
 * @param {object} args.storeData  value for user.subscription.apple / .play
 * @param {string} args.identity   stable subscription id (Apple
 *                                 originalTransactionId / Play purchaseToken)
 * @param {string} [args.periodKey] id of the current paid period (Apple
 *                                 transactionId / Play orderId); no grant without it
 * @param {string} [args.previousIdentity] Play: the token this one replaced
 * @param {boolean} [args.sandbox] Apple sandbox / Play test purchase (no money
 *                                 changed hands); recorded on the grant
 * @returns {Promise<{granted: boolean}>}
 */
async function applyStoreSubscription({
  user, provider, plan, state, storeData, identity, periodKey, previousIdentity, sandbox = false
}) {
  const prev = user.subscription || {};
  const prevIdentity = provider === 'apple'
    ? prev.apple?.originalTransactionId
    : prev.play?.purchaseToken;
  const continuing = prev.provider === provider
    && (prevIdentity === identity || (previousIdentity && prevIdentity === previousIdentity));
  const planChanged = continuing && prev.plan?.toString() !== plan._id.toString();

  // Moving off a live Stripe subscription: cancel it so the user isn't billed
  // twice (same as switching plans on the web).
  const stripeSubscriptionId = prev.stripeSubscriptionId;
  const cancelStripe = stripeSubscriptionId && prev.status !== 'cancelled';

  user.subscription = {
    plan: plan._id,
    provider,
    status: state.status,
    startDate: state.startDate || prev.startDate || new Date(),
    endDate: state.endDate || prev.endDate,
    autoRenew: state.autoRenew,
    stripeCustomerId: prev.stripeCustomerId,
    stripeSubscriptionId: undefined,
    apple: provider === 'apple' ? storeData : undefined,
    play: provider === 'play' ? storeData : undefined
  };
  await user.save(); // Save BEFORE token transactions so tokenBalance isn't overwritten afterward

  if (cancelStripe) {
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
    } catch (err) {
      console.error('[billing] Failed to cancel replaced Stripe subscription:', err.message);
    }
  }

  if (state.status !== 'active' || !periodKey) return { granted: false };

  const eventId = `grant:${periodKey}`;
  if (!(await claimEvent(provider, eventId, 'grant'))) return { granted: false };

  const kind = !continuing ? 'initial' : planChanged ? 'plan_change' : 'renewal';
  try {
    await grantPlanTokens(user, plan, {
      kind,
      provider,
      metadata: { storePeriodKey: periodKey, storeProductId: storeData.productId, ...(sandbox && { sandbox: true }) }
    });
  } catch (err) {
    // Let a retry (webhook redelivery / client re-validate) grant it.
    await releaseEvent(provider, eventId);
    throw err;
  }
  return { granted: true };
}

module.exports = {
  findPlanForProduct,
  claimEvent,
  applyStoreSubscription
};
