// Unit checks for the App Store / Google Play status mapping. Plain node
// assertions (no test framework in this repo). Run: node test/storeBilling.test.js
const assert = require('assert');
const gp = require('../services/googlePlayService');
const apple = require('../services/appleAppStoreService');
const User = require('../models/userModel');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const validStatuses = new Set(User.schema.path('subscription.status').enumValues);

console.log('googlePlayService');
check('CANCELED (not yet expired) keeps access', () => {
  assert.strictEqual(gp.statusFromSubscriptionState('SUBSCRIPTION_STATE_CANCELED'), 'active');
});
check('grace period keeps access, on hold does not', () => {
  assert.strictEqual(gp.statusFromSubscriptionState('SUBSCRIPTION_STATE_IN_GRACE_PERIOD'), 'active');
  assert.strictEqual(gp.statusFromSubscriptionState('SUBSCRIPTION_STATE_ON_HOLD'), 'past_due');
});
check('pending / expired / unknown', () => {
  assert.strictEqual(gp.statusFromSubscriptionState('SUBSCRIPTION_STATE_PENDING'), 'pending');
  assert.strictEqual(gp.statusFromSubscriptionState('SUBSCRIPTION_STATE_EXPIRED'), 'expired');
  assert.strictEqual(gp.statusFromSubscriptionState('NOPE'), 'none');
});
check('every mapped status is a valid User.subscription.status', () => {
  for (const s of Object.values(gp.SUBSCRIPTION_STATE_TO_STATUS)) assert.ok(validStatuses.has(s), s);
});

console.log('appleAppStoreService');
check('grace period keeps access, billing retry is past_due, revoked is cancelled', () => {
  assert.strictEqual(apple.statusFromAppleStatus(1), 'active'); // ACTIVE
  assert.strictEqual(apple.statusFromAppleStatus(4), 'active'); // BILLING_GRACE_PERIOD
  assert.strictEqual(apple.statusFromAppleStatus(3), 'past_due'); // BILLING_RETRY
  assert.strictEqual(apple.statusFromAppleStatus(2), 'expired'); // EXPIRED
  assert.strictEqual(apple.statusFromAppleStatus(5), 'cancelled'); // REVOKED
});
check('every mapped status is a valid User.subscription.status', () => {
  for (const s of Object.values(apple.STATUS_TO_STATUS)) assert.ok(validStatuses.has(s), s);
});

(async () => {
  check('unconfigured without credentials', () => {
    assert.strictEqual(gp.isConfigured(), false);
    assert.strictEqual(apple.isConfigured(), false);
  });
  await assert.rejects(() => gp.validateSubscription({ purchaseToken: 'x' }), (e) => e.code === 'PLAY_NOT_CONFIGURED');
  await assert.rejects(() => apple.validateSubscription({ transactionId: 'x' }), (e) => e.code === 'APPLE_NOT_CONFIGURED');
  passed++;
  console.log('  ✓ validate rejects with NOT_CONFIGURED when unconfigured');
  console.log(`\nAll ${passed} checks passed.`);
})().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
