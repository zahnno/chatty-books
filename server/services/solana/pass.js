/**
 * Prepaid 30-day plan passes bought with crypto on the Seeker build
 * (subscription.provider === 'solana').
 *
 * A pass behaves like one store-billed period — same plans, same token
 * semantics — but nothing auto-renews:
 *   - first pass (from free / a lapsed plan)  → credit the plan's tokens
 *   - another pass on the same live plan      → prepaid: paidUntil moves out
 *                                               one period; tokens come when
 *                                               that period starts
 *   - a period ends with more prepaid time    → reset balance, credit tokens
 *                                               (a renewal, like the stores)
 *   - a period ends with nothing prepaid      → back to the free plan
 * Switching tier while a pass is live is refused at checkout (see
 * checkPassPurchase) so no prepaid time is ever silently thrown away.
 */
const Subscription = require('../../models/subscriptionModel');
const TokenTransaction = require('../../models/tokenTransactionModel');
const User = require('../../models/userModel');
const ProcessedBillingEvent = require('../../models/processedBillingEventModel');
const { claimEvent } = require('../storeSubscriptionService');
const { downgradeToFreePlan } = require('../subscriptionService');

const DAY_MS = 24 * 60 * 60 * 1000;
// How far ahead a reader can prepay.
const MAX_PREPAID_PERIODS = 12;

const periodMs = (plan) => plan.duration * DAY_MS;

function liveSubscription(user) {
  const sub = user.subscription || {};
  return ['active', 'past_due'].includes(sub.status) && sub.endDate > new Date() ? sub : null;
}

/**
 * Whether `user` can buy a pass for `plan` right now. Returns null if so, or
 * { status, message } to refuse with.
 */
async function checkPassPurchase(user, plan) {
  if (!plan || !plan.isActive || plan.tier === 'free' || !(plan.price > 0)) {
    return { status: 400, message: 'That plan cannot be bought with crypto' };
  }
  const live = liveSubscription(user);
  if (!live) return null;

  if (['stripe', 'apple', 'play'].includes(live.provider)) {
    const where = { stripe: 'on chattybooks.com', apple: 'through the App Store', play: 'through Google Play' }[live.provider];
    return {
      status: 409,
      message: `Your current plan is billed ${where}. Cancel it there and wait for it to end before paying with crypto.`
    };
  }
  if (live.provider === 'solana') {
    if (live.plan?.toString() !== plan._id.toString()) {
      const current = await Subscription.findById(live.plan);
      const until = (live.solana?.paidUntil || live.endDate).toLocaleDateString('en-US');
      return {
        status: 409,
        message: `Your ${current?.name || 'current'} pass is paid through ${until}. You can switch plans once it ends.`
      };
    }
    const paidUntil = live.solana?.paidUntil || live.endDate;
    if (paidUntil.getTime() + periodMs(plan) > Date.now() + MAX_PREPAID_PERIODS * periodMs(plan)) {
      return { status: 409, message: `You can prepay up to ${MAX_PREPAID_PERIODS} months ahead.` };
    }
  }
  return null;
}

async function grantPeriodTokens(user, plan, { reset, action, description, metadata }) {
  if (reset && user.tokenBalance > 0) {
    await TokenTransaction.createTransaction({
      userId: user._id,
      amount: user.tokenBalance,
      type: 'debit',
      action: 'subscription_renewal',
      description: `Token balance reset on renewal of ${plan.name}`,
      relatedEntityId: plan._id,
      relatedEntityModel: 'Subscription',
      metadata: { planName: plan.name, resetOnRenewal: true, provider: 'solana' }
    });
  }
  await TokenTransaction.createTransaction({
    userId: user._id,
    amount: plan.tokensPerMonth,
    type: 'credit',
    action,
    description,
    relatedEntityId: plan._id,
    relatedEntityModel: 'Subscription',
    metadata: { planName: plan.name, planTier: plan.tier, provider: 'solana', ...metadata }
  });
}

/**
 * Apply a confirmed payment to its buyer. Called once per payment (the
 * caller holds the tx:<signature> claim).
 * @returns {Promise<{kind: 'started'|'extended'|'switched'}>}
 */
async function applyPassPayment(payment) {
  const [user, plan] = await Promise.all([
    User.findById(payment.userId),
    Subscription.findById(payment.plan)
  ]);
  if (!user) throw new Error(`Payment ${payment._id}: user not found`);
  if (!plan) throw new Error(`Payment ${payment._id}: plan not found`);

  const now = new Date();
  const live = liveSubscription(user);
  const solanaLive = live?.provider === 'solana';
  const samePlan = solanaLive && live.plan?.toString() === plan._id.toString();
  const record = { lastPaymentId: payment._id, lastSignature: payment.signature };

  if (samePlan) {
    const paidUntil = new Date((live.solana?.paidUntil || live.endDate).getTime() + periodMs(plan));
    user.subscription.solana = { ...record, paidUntil };
    await user.save();
    return { kind: 'extended' };
  }

  // A new pass starts now. Checkout refuses tier switches and other live
  // providers, but money that arrives anyway (a race) still buys this plan
  // outright rather than being lost.
  const endDate = new Date(now.getTime() + periodMs(plan));
  const switched = solanaLive;
  user.subscription = {
    plan: plan._id,
    provider: 'solana',
    status: 'active',
    startDate: now,
    endDate,
    autoRenew: false,
    stripeCustomerId: user.subscription?.stripeCustomerId,
    solana: { ...record, paidUntil: endDate }
  };
  await user.save(); // Save BEFORE token transactions so tokenBalance isn't overwritten afterward

  await grantPeriodTokens(user, plan, {
    reset: switched,
    action: switched ? 'subscription_plan_change' : 'subscription_purchase',
    description: switched
      ? `Tokens from changing to ${plan.name} pass`
      : `Tokens from ${plan.name} pass`,
    metadata: { isInitial: !switched, solanaPaymentId: payment._id.toString(), signature: payment.signature }
  });
  return { kind: switched ? 'switched' : 'started' };
}

/**
 * Roll over Solana passes whose period has ended: start the next prepaid
 * period (reset + credit) or drop to the free plan. Runs on a schedule.
 */
async function rollOverSolanaPasses() {
  const due = await User.find({
    'subscription.provider': 'solana',
    'subscription.status': { $in: ['active', 'past_due'] },
    'subscription.endDate': { $lte: new Date() }
  });

  for (const user of due) {
    try {
      const plan = await Subscription.findById(user.subscription.plan);
      const { endDate, solana } = user.subscription;
      const paidUntil = solana?.paidUntil;
      if (!plan || !paidUntil || paidUntil.getTime() <= endDate.getTime() + 60 * 1000) {
        await downgradeToFreePlan(user);
        continue;
      }

      // Next prepaid period. Keyed on the period start so a crashed run
      // can't grant it twice.
      const prevStart = user.subscription.startDate;
      const startDate = endDate;
      const eventId = `renewal:${user._id}:${startDate.toISOString()}`;
      if (!(await claimEvent('solana', eventId, 'grant'))) continue;
      try {
        user.subscription.startDate = startDate;
        user.subscription.endDate = new Date(Math.min(paidUntil.getTime(), startDate.getTime() + periodMs(plan)));
        user.subscription.status = 'active';
        await user.save();
        await grantPeriodTokens(user, plan, {
          reset: true,
          action: 'subscription_renewal',
          description: `Tokens for the next month of your prepaid ${plan.name} pass`,
          metadata: { isInitial: false, periodStart: startDate.toISOString() }
        });
      } catch (err) {
        // Put the period back so the next run picks this user up again.
        await User.updateOne(
          { _id: user._id },
          { $set: { 'subscription.startDate': prevStart, 'subscription.endDate': endDate } }
        );
        await ProcessedBillingEvent.deleteOne({ provider: 'solana', eventId });
        throw err;
      }
    } catch (err) {
      console.error(`[solana] Pass rollover failed for user ${user._id}:`, err.message);
    }
  }
}

module.exports = { checkPassPurchase, applyPassPayment, rollOverSolanaPasses };
