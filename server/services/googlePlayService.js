/**
 * Google Play billing — server-side subscription validation.
 *
 * Verifies Play purchase tokens directly against the Google Play Developer API
 * (androidpublisher v3). The client only ever hands us a purchaseToken; the
 * subscription state always comes from Google.
 *
 * Server env:
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64  base64 of the service-account JSON
 *                                            (or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, raw)
 *   ANDROID_PACKAGE_NAME                     default 'com.chattybooks.app'
 *
 * Used by POST /api/billing/play/validate and POST /api/webhooks/play.
 */

const { androidpublisher, auth } = require('@googleapis/androidpublisher');

const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.chattybooks.app';
const ANDROIDPUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

// SubscriptionPurchaseV2.subscriptionState → User.subscription.status. A
// canceled subscription keeps access until expiry, so it stays 'active'
// (autoRenew=false is what signals the cancellation).
const SUBSCRIPTION_STATE_TO_STATUS = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_CANCELED: 'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'active',
  SUBSCRIPTION_STATE_ON_HOLD: 'past_due',
  SUBSCRIPTION_STATE_PAUSED: 'expired',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING: 'pending',
  SUBSCRIPTION_STATE_UNSPECIFIED: 'none'
};

// RTDN SubscriptionNotification.notificationType values.
const SUBSCRIPTION_NOTIFICATION_TYPE = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  PURCHASED: 4,
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  PRICE_CHANGE_CONFIRMED: 8,
  DEFERRED: 9,
  PAUSED: 10,
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED: 12,
  EXPIRED: 13
};

let _client = null;

function loadCredentials() {
  const b64 = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64;
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  const json = b64 ? Buffer.from(b64, 'base64').toString('utf8') : raw;
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (err) {
    console.error('[play] Failed to parse service-account JSON:', err.message);
    return null;
  }
}

function isConfigured() {
  return loadCredentials() !== null;
}

function getClient() {
  if (_client) return _client;
  const credentials = loadCredentials();
  if (!credentials) {
    throw Object.assign(new Error('Google Play service account not configured'), {
      code: 'PLAY_NOT_CONFIGURED'
    });
  }
  const googleAuth = new auth.GoogleAuth({ credentials, scopes: [ANDROIDPUBLISHER_SCOPE] });
  _client = androidpublisher({ version: 'v3', auth: googleAuth });
  return _client;
}

function statusFromSubscriptionState(state) {
  return SUBSCRIPTION_STATE_TO_STATUS[state] || 'none';
}

/**
 * Validate a subscription purchase token (subscriptionsv2) and return a
 * normalized snapshot. Our subscriptions have a single line item.
 *
 * @returns {{
 *   subscriptionState: string, status: string, productId: string|null,
 *   basePlanId: string|null, expiryTime: Date|null, startTime: Date|null,
 *   orderId: string|null, linkedPurchaseToken: string|null, autoRenew: boolean,
 *   acknowledged: boolean, testPurchase: boolean
 * }}
 */
async function validateSubscription({ purchaseToken }) {
  const { data } = await getClient().purchases.subscriptionsv2.get({
    packageName: PACKAGE_NAME,
    token: purchaseToken
  });

  const line = Array.isArray(data.lineItems) && data.lineItems.length ? data.lineItems[0] : {};
  const subscriptionState = data.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED';

  return {
    subscriptionState,
    status: statusFromSubscriptionState(subscriptionState),
    productId: line.productId || null,
    basePlanId: line.offerDetails?.basePlanId || null,
    expiryTime: line.expiryTime ? new Date(line.expiryTime) : null,
    startTime: data.startTime ? new Date(data.startTime) : null,
    // latestOrderId changes every renewal (GPA.x..0, ..1, …) and on plan change.
    orderId: data.latestOrderId || null,
    linkedPurchaseToken: data.linkedPurchaseToken || null,
    autoRenew: line.autoRenewingPlan?.autoRenewEnabled === true,
    acknowledged: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    testPurchase: !!data.testPurchase
  };
}

/**
 * Acknowledge a subscription so Google doesn't auto-refund it after 3 days.
 * Acknowledging twice is a harmless 400 we swallow.
 */
async function acknowledgeSubscription({ productId, purchaseToken }) {
  try {
    await getClient().purchases.subscriptions.acknowledge({
      packageName: PACKAGE_NAME,
      subscriptionId: productId,
      token: purchaseToken,
      requestBody: {}
    });
  } catch (err) {
    if (err?.code === 400 && /already acknowledged/i.test(err?.message || '')) return;
    throw err;
  }
}

module.exports = {
  isConfigured,
  validateSubscription,
  acknowledgeSubscription,
  statusFromSubscriptionState,
  SUBSCRIPTION_STATE_TO_STATUS,
  SUBSCRIPTION_NOTIFICATION_TYPE
};
