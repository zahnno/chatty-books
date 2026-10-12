/**
 * Apple App Store billing — server-side subscription validation.
 *
 * Verifies StoreKit purchases directly against Apple's App Store Server API,
 * and verifies every signed (JWS) payload against the bundled Apple root CAs
 * (`data/apple-root-certs/`) before trusting it. The client only ever hands us a
 * transactionId; the subscription state always comes from Apple.
 *
 * Server env (App Store Connect → Users and Access → Integrations → In-App
 * Purchase key):
 *   APPLE_IAP_KEY_ID              the key's Key ID
 *   APPLE_IAP_ISSUER_ID           the issuer id
 *   APPLE_IAP_PRIVATE_KEY_BASE64  base64 of the .p8 (or APPLE_IAP_PRIVATE_KEY, raw PEM)
 *   APPLE_IAP_BUNDLE_ID           default 'com.chattybooks.app'
 *   APPLE_IAP_APP_APPLE_ID        numeric App Store app id (required to verify
 *                                 production notifications)
 *
 * Used by POST /api/billing/apple/validate and POST /api/webhooks/apple.
 */

const fs = require('fs');
const path = require('path');
const {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  Status,
  NotificationTypeV2
} = require('@apple/app-store-server-library');

const BUNDLE_ID = process.env.APPLE_IAP_BUNDLE_ID || 'com.chattybooks.app';
const APP_APPLE_ID = process.env.APPLE_IAP_APP_APPLE_ID
  ? Number(process.env.APPLE_IAP_APP_APPLE_ID)
  : undefined;

// App Store subscription Status → User.subscription.status. A subscription in
// its billing grace period is still entitled (Apple keeps serving it while it
// retries the charge); BILLING_RETRY without grace is past_due; REVOKED
// (refund / family-sharing revoke) is cancelled.
const STATUS_TO_STATUS = {
  [Status.ACTIVE]: 'active',
  [Status.BILLING_GRACE_PERIOD]: 'active',
  [Status.BILLING_RETRY]: 'past_due',
  [Status.EXPIRED]: 'expired',
  [Status.REVOKED]: 'cancelled'
};

const ROOT_CERTS_DIR = process.env.APPLE_ROOT_CERTS_DIR
  || path.join(__dirname, '..', 'data', 'apple-root-certs');

let _rootCerts = null;
function loadRootCerts() {
  if (_rootCerts) return _rootCerts;
  try {
    const files = fs.readdirSync(ROOT_CERTS_DIR).filter((f) => f.endsWith('.cer'));
    _rootCerts = files.map((f) => fs.readFileSync(path.join(ROOT_CERTS_DIR, f)));
  } catch (err) {
    console.error('[apple] Failed to load Apple root certs:', err.message);
    _rootCerts = [];
  }
  return _rootCerts;
}

function loadPrivateKey() {
  const b64 = process.env.APPLE_IAP_PRIVATE_KEY_BASE64;
  const raw = process.env.APPLE_IAP_PRIVATE_KEY;
  return b64 ? Buffer.from(b64, 'base64').toString('utf8') : raw || null;
}

function isConfigured() {
  return !!(
    process.env.APPLE_IAP_KEY_ID &&
    process.env.APPLE_IAP_ISSUER_ID &&
    loadPrivateKey() &&
    loadRootCerts().length > 0
  );
}

// One API client + verifier per environment. The same binary produces both
// Production and Sandbox (TestFlight / sandbox testers) transactions and we
// can't tell which up front, so callers try Production, then Sandbox.
const _clients = {};
const _verifiers = {};

function getClient(environment) {
  if (_clients[environment]) return _clients[environment];
  const signingKey = loadPrivateKey();
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuerId = process.env.APPLE_IAP_ISSUER_ID;
  if (!signingKey || !keyId || !issuerId) {
    throw Object.assign(new Error('Apple App Store API key not configured'), {
      code: 'APPLE_NOT_CONFIGURED'
    });
  }
  _clients[environment] = new AppStoreServerAPIClient(
    signingKey, keyId, issuerId, BUNDLE_ID, environment
  );
  return _clients[environment];
}

function getVerifier(environment) {
  if (_verifiers[environment]) return _verifiers[environment];
  const roots = loadRootCerts();
  if (!roots.length) {
    throw Object.assign(new Error('Apple root certs not configured'), {
      code: 'APPLE_NOT_CONFIGURED'
    });
  }
  // enableOnlineChecks → OCSP revocation check against Apple's responder.
  _verifiers[environment] = new SignedDataVerifier(
    roots, true, environment, BUNDLE_ID, APP_APPLE_ID
  );
  return _verifiers[environment];
}

const ENVIRONMENTS = [Environment.PRODUCTION, Environment.SANDBOX];

function statusFromAppleStatus(status) {
  return STATUS_TO_STATUS[status] || 'none';
}

/**
 * Validate an auto-renewable subscription by any of its transaction ids and
 * return a normalized snapshot of its current period. Uses
 * getAllSubscriptionStatuses (the authority for renewal state) and verifies the
 * signed transaction + renewal info.
 *
 * @returns {{
 *   status: string, appleStatus: number|null, productId: string|null,
 *   originalTransactionId: string|null, transactionId: string|null,
 *   expiresDate: Date|null, purchaseDate: Date|null, autoRenew: boolean,
 *   environment: string
 * }}
 */
async function validateSubscription({ transactionId }) {
  let lastErr = null;
  for (const environment of ENVIRONMENTS) {
    try {
      const client = getClient(environment);
      const verifier = getVerifier(environment);
      const statusResponse = await client.getAllSubscriptionStatuses(transactionId);

      // Keep the line item with the latest expiry — the current period.
      let best = null;
      for (const group of statusResponse.data || []) {
        for (const item of group.lastTransactions || []) {
          if (!item.signedTransactionInfo) continue;
          const tx = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
          let renewal = null;
          if (item.signedRenewalInfo) {
            try {
              renewal = await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo);
            } catch (e) {
              console.warn('[apple] renewal info decode failed:', e.message);
            }
          }
          if (!best || (tx.expiresDate || 0) > (best.tx.expiresDate || 0)) {
            best = { appleStatus: item.status, tx, renewal };
          }
        }
      }

      if (!best) {
        return {
          status: 'none', appleStatus: null, productId: null,
          originalTransactionId: null, transactionId: null, expiresDate: null,
          purchaseDate: null, autoRenew: false, environment
        };
      }

      const { tx, renewal, appleStatus } = best;
      return {
        status: statusFromAppleStatus(appleStatus),
        appleStatus,
        productId: tx.productId || null,
        originalTransactionId: tx.originalTransactionId || null,
        transactionId: tx.transactionId || null,
        expiresDate: tx.expiresDate ? new Date(tx.expiresDate) : null,
        purchaseDate: tx.purchaseDate ? new Date(tx.purchaseDate) : null,
        // autoRenewStatus: 1 = will renew, 0 = turned off.
        autoRenew: renewal ? renewal.autoRenewStatus === 1 : false,
        environment
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not validate App Store subscription');
}

/** Verify + decode an App Store Server Notification V2 signedPayload. */
async function verifyNotification(signedPayload) {
  let lastErr = null;
  for (const environment of ENVIRONMENTS) {
    try {
      return await getVerifier(environment).verifyAndDecodeNotification(signedPayload);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not verify App Store notification');
}

/** Verify + decode a signed transaction (e.g. inside a notification). */
async function verifyTransaction(signedTransactionInfo) {
  let lastErr = null;
  for (const environment of ENVIRONMENTS) {
    try {
      return await getVerifier(environment).verifyAndDecodeTransaction(signedTransactionInfo);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not verify App Store transaction');
}

module.exports = {
  isConfigured,
  validateSubscription,
  verifyNotification,
  verifyTransaction,
  statusFromAppleStatus,
  STATUS_TO_STATUS,
  NotificationTypeV2
};
