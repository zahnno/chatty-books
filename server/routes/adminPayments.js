const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../controllers/auth');
const User = require('../models/userModel');
const Subscription = require('../models/subscriptionModel');
const TokenTransaction = require('../models/tokenTransactionModel');
const SolanaPayment = require('../models/solanaPaymentModel');
const ProcessedBillingEvent = require('../models/processedBillingEventModel');
const appleAppStoreService = require('../services/appleAppStoreService');
const googlePlayService = require('../services/googlePlayService');
const solanaPayments = require('../services/solana/payments');
const { CLUSTER } = require('../services/solana/core');

// Admin payments overview: how each billing provider is configured, who pays
// through it, what it brought in, and the subscription states that don't add
// up. Read-only. Revenue is estimated from the paid periods we granted tokens
// for (plan list price, before store / processor fees); Solana uses the
// confirmed payment's USD amount.

const PROVIDERS = ['stripe', 'apple', 'play', 'solana'];
const PAID_GRANT_ACTIONS = ['subscription_purchase', 'subscription_renewal', 'subscription_plan_change'];
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_FIELDS = 'email username walletAddress subscription.provider subscription.status subscription.endDate';
const SAMPLE = 10;

const check = (label, ok, detail, level = 'error') => ({ label, ok: !!ok, detail, level: ok ? 'ok' : level });

function stripeMode() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return null;
}

function providerConfig() {
  const production = process.env.NODE_ENV === 'production';
  const mode = stripeMode();
  return {
    stripe: {
      configured: !!mode,
      mode,
      checks: [
        check('Secret key set', mode, mode ? `${mode} mode` : 'STRIPE_SECRET_KEY is missing or not a Stripe key'),
        check('Webhook signing secret set', process.env.STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET verifies /api/webhooks/stripe'),
        check('Live key in production', !production || mode === 'live', production && mode !== 'live' ? 'The production server is using a test key' : 'Production must use a live key', 'warning'),
      ],
    },
    apple: {
      configured: appleAppStoreService.isConfigured(),
      mode: 'production + sandbox',
      checks: [
        check('API key and root certificates', appleAppStoreService.isConfigured(), 'APPLE_IAP_KEY_ID / ISSUER_ID / PRIVATE_KEY and data/apple-root-certs'),
        check('App Apple ID set', process.env.APPLE_IAP_APP_APPLE_ID, 'APPLE_IAP_APP_APPLE_ID is required to verify production notifications'),
        check('Bundle ID', true, process.env.APPLE_IAP_BUNDLE_ID || 'com.chattybooks.app (default)'),
        check(
          'Sandbox purchases accepted',
          false,
          'TestFlight and sandbox purchases are free but grant real plans (App Review needs this). Watch the sandbox counts below.',
          'warning'
        ),
      ],
    },
    play: {
      configured: googlePlayService.isConfigured(),
      mode: 'production + license testers',
      checks: [
        check('Service account set', googlePlayService.isConfigured(), 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON(_BASE64)'),
        check('Pub/Sub push authenticated', process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE, production
          ? 'GOOGLE_PLAY_PUBSUB_AUDIENCE unset: every RTDN push is rejected'
          : 'GOOGLE_PLAY_PUBSUB_AUDIENCE unset: pushes are accepted unauthenticated (non-production only)'),
        check('Pub/Sub sender pinned', process.env.GOOGLE_PLAY_PUBSUB_SA_EMAIL, 'GOOGLE_PLAY_PUBSUB_SA_EMAIL restricts pushes to one service account', 'warning'),
        check('Package name', true, process.env.ANDROID_PACKAGE_NAME || 'com.chattybooks.app (default)'),
      ],
    },
    solana: {
      configured: solanaPayments.isEnabled(),
      mode: CLUSTER,
      checks: [
        check('Treasury wallet set', solanaPayments.isEnabled(), 'SOLANA_TREASURY_ADDRESS'),
        check('Dedicated RPC', process.env.SOLANA_RPC_URL, 'The public RPC rate-limits; set SOLANA_RPC_URL', 'warning'),
        check('Mainnet', CLUSTER !== 'devnet', CLUSTER === 'devnet' ? 'SOLANA_CLUSTER is devnet: payments are test money' : `SOLANA_CLUSTER ${CLUSTER}`, production ? 'error' : 'warning'),
      ],
    },
  };
}

// Paid periods we granted tokens for (Stripe / App Store / Play), with the plan's price.
function paidGrants(match) {
  return TokenTransaction.aggregate([
    {
      $match: {
        type: 'credit',
        action: { $in: PAID_GRANT_ACTIONS },
        relatedEntityModel: 'Subscription',
        'metadata.provider': { $ne: 'solana' },
        ...match,
      },
    },
    { $lookup: { from: 'subscriptions', localField: 'relatedEntityId', foreignField: '_id', as: 'plan' } },
    { $unwind: '$plan' },
    { $match: { 'plan.price': { $gt: 0 } } },
    {
      $addFields: {
        provider: {
          $ifNull: [
            '$metadata.provider',
            { $cond: [{ $ifNull: ['$metadata.stripeSubscriptionId', false] }, 'stripe', 'unknown'] },
          ],
        },
        sandbox: { $eq: ['$metadata.sandbox', true] },
      },
    },
  ]);
}

async function revenue(since) {
  const [grants, solana] = await Promise.all([
    paidGrants({ createdAt: { $gte: since } }),
    SolanaPayment.find({ status: 'confirmed', confirmedAt: { $gte: since } }, 'usdAmount confirmedAt').lean(),
  ]);

  const byProvider = Object.fromEntries([...PROVIDERS, 'unknown'].map(p => [p, { usd: 0, periods: 0, sandbox: 0 }]));
  const daily = new Map(); // `${date}|${provider}` → usd
  const add = (provider, usd, at) => {
    const key = `${at.toISOString().slice(0, 10)}|${provider}`;
    daily.set(key, (daily.get(key) || 0) + usd);
  };

  for (const g of grants) {
    const row = byProvider[g.provider] || byProvider.unknown;
    if (g.sandbox) {
      row.sandbox++;
      continue;
    }
    row.usd += g.plan.price;
    row.periods++;
    add(g.provider, g.plan.price, g.createdAt);
  }
  for (const p of solana) {
    byProvider.solana.usd += p.usdAmount;
    byProvider.solana.periods++;
    add('solana', p.usdAmount, p.confirmedAt);
  }
  if (!byProvider.unknown.periods && !byProvider.unknown.sandbox) delete byProvider.unknown;

  return {
    totalUSD: Object.values(byProvider).reduce((t, r) => t + r.usd, 0),
    byProvider,
    daily: [...daily].map(([key, usd]) => {
      const [date, provider] = key.split('|');
      return { date, provider, usd };
    }),
  };
}

async function subscribers(plans) {
  const planById = new Map(plans.map(p => [p._id.toString(), p]));
  const rows = await User.aggregate([
    { $match: { 'subscription.plan': { $in: plans.filter(p => p.price > 0).map(p => p._id) } } },
    {
      $group: {
        _id: {
          // Web subscriptions from before `provider` existed only have the Stripe id.
          provider: {
            $ifNull: [
              '$subscription.provider',
              { $cond: [{ $ifNull: ['$subscription.stripeSubscriptionId', false] }, 'stripe', 'none'] },
            ],
          },
          status: '$subscription.status',
          plan: '$subscription.plan',
          autoRenew: '$subscription.autoRenew',
          sandbox: {
            $or: [
              { $eq: ['$subscription.apple.environment', 'Sandbox'] },
              { $eq: ['$subscription.play.testPurchase', true] },
            ],
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const empty = () => ({ active: 0, renewing: 0, ending: 0, pastDue: 0, lapsed: 0, sandbox: 0, mrr: 0 });
  const byProvider = Object.fromEntries([...PROVIDERS, 'none'].map(p => [p, empty()]));
  for (const { _id, count } of rows) {
    const row = byProvider[_id.provider] || byProvider.none;
    const plan = planById.get(_id.plan?.toString());
    const live = _id.status === 'active' || _id.status === 'past_due';
    if (live && _id.sandbox) {
      row.sandbox += count;
      continue;
    }
    if (_id.status === 'active') {
      row.active += count;
      // Solana passes never auto-renew; count them at their monthly price.
      const renews = _id.provider === 'solana' || _id.autoRenew !== false;
      if (renews) row.renewing += count;
      else row.ending += count;
      if (renews && plan) row.mrr += plan.price * count;
    } else if (_id.status === 'past_due') {
      row.pastDue += count;
    } else {
      row.lapsed += count;
    }
  }
  if (Object.values(byProvider.none).every(v => v === 0)) delete byProvider.none;

  const freeTotal = await User.countDocuments({ 'subscription.plan': { $in: plans.filter(p => !(p.price > 0)).map(p => p._id) } });
  return { byProvider, free: freeTotal };
}

async function sampleUsers(filter) {
  const [count, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter, USER_FIELDS).sort({ 'subscription.endDate': 1 }).limit(SAMPLE).lean(),
  ]);
  return { count, users };
}

// Subscription states that don't add up, with a sample of the users in each.
async function findIssues(plans) {
  const now = Date.now();
  const paidPlanIds = plans.filter(p => p.price > 0).map(p => p._id);
  const onPaidPlan = { 'subscription.plan': { $in: paidPlanIds } };
  const issues = [];
  const push = async (severity, provider, title, detail, filter) => {
    const { count, users } = await sampleUsers(filter);
    if (count) issues.push({ severity, provider, title, detail, count, users });
  };

  await push('error', null, 'Active past the end of the paid period',
    'Still active 3+ days after endDate. The renewal or expiry webhook probably never arrived; check the provider and its webhook logs.',
    {
      ...onPaidPlan,
      'subscription.status': 'active',
      'subscription.endDate': { $lt: new Date(now - 3 * DAY_MS) },
    });

  await push('error', null, 'Paid plan with no billing source',
    'Active on a paid plan without a Stripe subscription or store purchase behind it (manual change, or a failed save).',
    {
      ...onPaidPlan,
      'subscription.status': { $in: ['active', 'past_due'] },
      'subscription.stripeSubscriptionId': { $exists: false },
      'subscription.provider': { $nin: ['apple', 'play', 'solana'] },
    });

  await push('warning', null, 'Lapsed store subscribers left on a paid plan',
    'App Store / Play subscriptions that expired or were refunded keep the paid plan and never move to the free plan, so these readers stop getting monthly tokens.',
    {
      ...onPaidPlan,
      'subscription.provider': { $in: ['apple', 'play'] },
      'subscription.status': { $in: ['expired', 'cancelled'] },
    });

  await push('warning', null, 'Sandbox / test purchases holding a paid plan',
    'App Store sandbox (TestFlight) or Play license-tester subscriptions: a paid plan with no money received.',
    {
      ...onPaidPlan,
      'subscription.status': { $in: ['active', 'past_due'] },
      $or: [
        { 'subscription.apple.environment': 'Sandbox' },
        { 'subscription.play.testPurchase': true },
      ],
    });

  await push('info', null, 'Payment failing (past due)',
    'The provider is retrying the charge. Readers keep their plan until it gives up.',
    { ...onPaidPlan, 'subscription.status': 'past_due' });

  const stuck = await SolanaPayment.find({ status: 'pending', expiresAt: { $lt: new Date(now - 35 * 60 * 1000) } })
    .sort({ createdAt: -1 }).limit(SAMPLE).populate('userId', 'email username walletAddress').lean();
  if (stuck.length) {
    issues.push({
      severity: 'warning',
      provider: 'solana',
      title: 'Crypto payments stuck pending',
      detail: 'The reconcile job should confirm or expire these within 30 minutes of the quote expiring. Check the Solana RPC.',
      count: await SolanaPayment.countDocuments({ status: 'pending', expiresAt: { $lt: new Date(now - 35 * 60 * 1000) } }),
      users: stuck.map(p => p.userId).filter(Boolean),
    });
  }

  for (const plan of plans.filter(p => p.isActive && p.price > 0)) {
    const missing = [
      !plan.stripePriceId && 'Stripe price',
      !plan.appleProductId && 'App Store product',
      !plan.playProductId && 'Play product',
    ].filter(Boolean);
    if (missing.length) {
      issues.push({
        severity: 'warning',
        provider: null,
        title: `${plan.name} plan can't be bought everywhere`,
        detail: `No ${missing.join(', ')} id, so this plan isn't offered there.`,
        count: missing.length,
        users: [],
      });
    }
  }

  const order = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

async function recentPayments() {
  const [grants, solana] = await Promise.all([
    paidGrants({}).then(rows => rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 25)),
    SolanaPayment.find({ status: 'confirmed' }).sort({ confirmedAt: -1 }).limit(25).populate('plan', 'name').lean(),
  ]);
  const users = await User.find(
    { _id: { $in: [...grants.map(g => g.userId), ...solana.map(p => p.userId)] } },
    'email username walletAddress'
  ).lean();
  const userById = new Map(users.map(u => [u._id.toString(), u]));

  return [
    ...grants.map(g => ({
      _id: g._id,
      at: g.createdAt,
      provider: g.provider,
      kind: { subscription_purchase: 'New', subscription_renewal: 'Renewal', subscription_plan_change: 'Plan change' }[g.action],
      plan: g.plan.name,
      usd: g.plan.price,
      sandbox: g.sandbox,
      user: userById.get(g.userId.toString()) || null,
      reference: g.metadata?.invoiceId || g.metadata?.storePeriodKey || g.metadata?.stripeSubscriptionId || null,
    })),
    ...solana.map(p => ({
      _id: p._id,
      at: p.confirmedAt,
      provider: 'solana',
      kind: `Pass (${p.currency})`,
      plan: p.plan?.name || '-',
      usd: p.usdAmount,
      sandbox: CLUSTER === 'devnet',
      user: userById.get(p.userId.toString()) || null,
      reference: p.signature,
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 25);
}

// Last time each provider's webhook (or, for Solana, a confirmed payment) reached us.
async function lastActivity() {
  const [events, solana] = await Promise.all([
    ProcessedBillingEvent.aggregate([
      { $match: { eventId: { $regex: '^(event|notification):' } } },
      { $group: { _id: '$provider', at: { $max: '$createdAt' }, count: { $sum: 1 } } },
    ]),
    SolanaPayment.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, last: { $max: '$updatedAt' } } },
    ]),
  ]);
  return {
    webhooks: Object.fromEntries(events.map(e => [e._id, { at: e.at, count: e.count }])),
    solanaPayments: Object.fromEntries(solana.map(s => [s._id, { count: s.count, last: s.last }])),
  };
}

// GET /api/admin/payments?period=30
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const period = [7, 30, 90, 365].includes(Number(req.query.period)) ? Number(req.query.period) : 30;
    const since = new Date(Date.now() - period * DAY_MS);
    const plans = await Subscription.find().sort({ price: 1 }).lean();

    const [rev, subs, issues, recent, activity] = await Promise.all([
      revenue(since),
      subscribers(plans),
      findIssues(plans),
      recentPayments(),
      lastActivity(),
    ]);

    const config = providerConfig();
    for (const provider of PROVIDERS) {
      config[provider].lastWebhook = activity.webhooks[provider] || null;
    }

    res.json({
      period,
      generatedAt: new Date(),
      providers: config,
      revenue: rev,
      subscribers: subs,
      issues,
      recent,
      solanaPayments: activity.solanaPayments,
      plans: plans.map(p => ({
        _id: p._id,
        name: p.name,
        tier: p.tier,
        price: p.price,
        isActive: p.isActive,
        stripePriceId: p.stripePriceId || null,
        appleProductId: p.appleProductId || null,
        playProductId: p.playProductId || null,
      })),
    });
  } catch (error) {
    console.error('Error building payments overview:', error);
    res.status(500).json({ message: 'Could not load the payments overview' });
  }
});

module.exports = router;
