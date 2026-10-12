const Subscription = require('../models/subscriptionModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const User = require('../models/userModel');

// Starts a fresh free-plan period: the balance resets to the free allowance.
async function startFreePeriod(user, plan) {
  // Save subscription changes FIRST so tokenBalance is persisted correctly
  user.subscription = {
    plan: plan._id,
    startDate: new Date(),
    endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
    status: 'active',
    autoRenew: true,
    stripeCustomerId: user.subscription?.stripeCustomerId
  };
  await user.save();

  // Token transactions AFTER save — no subsequent user.save() to overwrite them
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

  await TokenTransaction.createTransaction({
    userId: user._id,
    amount: plan.tokensPerMonth,
    type: 'credit',
    action: 'subscription_renewal',
    description: `Monthly renewal tokens from ${plan.name} subscription`,
    relatedEntityId: plan._id,
    relatedEntityModel: 'Subscription',
    metadata: { planName: plan.name, planTier: plan.tier, isInitial: false }
  });
}

async function renewFreeTierIfExpired(user) {
  if (!user.subscription?.plan) return;
  if (user.subscription?.status === 'active' && user.subscription?.endDate > new Date()) return;

  const plan = await Subscription.findById(user.subscription.plan);
  if (!plan || plan.tier !== 'free') return;

  await startFreePeriod(user, plan);
}

// A paid web (Stripe) plan has ended: move the reader onto the free plan.
async function downgradeToFreePlan(user) {
  const freePlan = await Subscription.findOne({ tier: 'free', isActive: true });
  if (!freePlan) {
    user.subscription.status = 'cancelled';
    user.subscription.autoRenew = false;
    await user.save();
    return;
  }
  await startFreePeriod(user, freePlan);
}

async function renewExpiredFreeSubscriptions() {
  const freePlan = await Subscription.findOne({ tier: 'free', isActive: true });
  if (!freePlan) return;

  // Mark all non-Stripe expired subscriptions as 'expired' (includes non-free).
  // App Store / Play subscriptions are skipped: their status comes from the
  // store webhooks, and a renewal can land a little after endDate. Solana
  // passes roll over in services/solana/pass.js.
  await User.updateMany(
    {
      'subscription.status': 'active',
      'subscription.endDate': { $lt: new Date() },
      'subscription.stripeSubscriptionId': { $exists: false },
      'subscription.provider': { $nin: ['apple', 'play', 'solana'] }
    },
    { $set: { 'subscription.status': 'expired' } }
  );

  // Web plans cancelled at period end: Stripe's subscription.deleted webhook
  // normally downgrades them. If it never arrived, do it a day after the end.
  const lapsed = await User.find({
    'subscription.stripeSubscriptionId': { $exists: true },
    'subscription.autoRenew': false,
    'subscription.status': { $in: ['active', 'past_due'] },
    'subscription.endDate': { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    'subscription.provider': { $nin: ['apple', 'play', 'solana'] }
  });
  for (const user of lapsed) {
    await downgradeToFreePlan(user);
  }

  // Find free tier users with expired endDate (status may now be 'expired' or 'active')
  const expiredUsers = await User.find({
    'subscription.plan': freePlan._id,
    'subscription.endDate': { $lt: new Date() }
  });

  for (const user of expiredUsers) {
    await renewFreeTierIfExpired(user);
  }
}

module.exports = { renewFreeTierIfExpired, renewExpiredFreeSubscriptions, downgradeToFreePlan };
