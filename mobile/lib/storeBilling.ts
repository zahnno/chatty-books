// In-app subscriptions through the App Store (StoreKit) and Google Play Billing,
// via react-native-iap.
//
// The store sheet takes payment; the server decides what it bought. After a
// purchase we send its id to /api/billing/{apple,play}/validate, which checks it
// with Apple / Google, moves the account onto the plan and grants the tokens.
// Only then do we finish the transaction: an unfinished transaction is replayed
// on the next launch (and Play refunds unacknowledged ones), so a failed
// validate is retried rather than lost.
//
// Product ids come from the server's plan list (appleProductId / playProductId),
// so the catalog lives in one place.
import { Linking } from 'react-native';
import { authFetch } from '@talkingbook/shared';
import { STORE_PROVIDER } from './billingMode';
import type { Plan } from './subscription';

// Play replacement modes for a plan change. Upgrades charge the prorated
// difference now; downgrades switch now and credit the unused time.
const REPLACEMENT_MODE_WITH_TIME_PRORATION = 1;
const REPLACEMENT_MODE_CHARGE_PRORATED_PRICE = 2;

const PLAY_PACKAGE = 'com.chattybooks.app';

export type ValidateResult = { status: string; planId?: string; endDate?: string; granted?: boolean };

// Lazy so web never loads the native module.
let _iap: typeof import('react-native-iap') | null = null;
function iap() {
  if (!STORE_PROVIDER) throw new Error('In-app purchases are not available in this build');
  if (!_iap) _iap = require('react-native-iap');
  return _iap!;
}

export function productIdFor(plan: Plan): string | undefined {
  return STORE_PROVIDER === 'apple' ? plan.appleProductId : plan.playProductId;
}

function purchaseProductId(purchase: any): string | undefined {
  return purchase.productId || (Array.isArray(purchase.productIds) ? purchase.productIds[0] : undefined);
}

function validate(purchase: any): Promise<ValidateResult> {
  if (STORE_PROVIDER === 'apple') {
    const transactionId = purchase.transactionId || purchase.originalTransactionIdentifierIOS;
    if (!transactionId) throw new Error('App Store purchase is missing a transaction id');
    return authFetch({ path: '/api/billing/apple/validate', method: 'POST', body: { transactionId } });
  }
  const purchaseToken = purchase.purchaseToken || purchase.purchaseTokenAndroid;
  if (!purchaseToken) throw new Error('Google Play purchase is missing a token');
  return authFetch({ path: '/api/billing/play/validate', method: 'POST', body: { purchaseToken } });
}

// ── Connection + purchase listener ───────────────────────────────────────────

// The UI blocks while a purchase is in flight, so one pending flow is enough.
type PendingFlow = { productId: string; resolve: (r: ValidateResult) => void; reject: (e: unknown) => void };
let _pending: PendingFlow | null = null;
let _connected = false;
let _subs: { remove: () => void }[] = [];
let _onReconciled: (() => void) | null = null;

async function handlePurchaseUpdate(purchase: any) {
  // An older transaction can replay while a purchase is in flight; only the
  // product being bought settles the flow.
  const flow = _pending?.productId === purchaseProductId(purchase) ? _pending : null;
  if (flow) _pending = null;
  try {
    const result = await validate(purchase);
    // Play: payment still processing. Leave it unfinished; the server
    // provisions it from Google's notification once it clears.
    if (result.status !== 'pending') {
      await iap().finishTransaction({ purchase, isConsumable: false });
    }
    if (flow) flow.resolve(result);
    else _onReconciled?.();
  } catch (err) {
    // Leave it unfinished so it replays on the next launch and reconciles.
    if (flow) flow.reject(err);
  }
}

function handlePurchaseError(err: unknown) {
  const flow = _pending;
  _pending = null;
  flow?.reject(err);
}

/**
 * Connect to the store and start listening for purchases (idempotent). Called
 * while signed in so transactions finished outside the app — Ask to Buy
 * approvals, a validate that failed last time, a purchase made in the store's
 * own UI — are bound to the account when they replay. `onReconciled` runs
 * after one of those is applied, so the UI can refresh.
 */
export async function init(onReconciled?: () => void): Promise<void> {
  if (!STORE_PROVIDER) return;
  if (onReconciled) _onReconciled = onReconciled;
  const lib = iap();
  if (!_connected) {
    await lib.initConnection();
    if (STORE_PROVIDER === 'play') {
      try {
        await lib.flushFailedPurchasesCachedAsPendingAndroid();
      } catch {
        // non-fatal
      }
    }
    _connected = true;
  }
  if (!_subs.length) {
    _subs = [lib.purchaseUpdatedListener(handlePurchaseUpdate), lib.purchaseErrorListener(handlePurchaseError)];
  }
}

/** Stop listening and disconnect (on sign-out). */
export async function teardown(): Promise<void> {
  if (!STORE_PROVIDER || !_connected) return;
  _subs.forEach((s) => s.remove());
  _subs = [];
  _onReconciled = null;
  _pending = null;
  try {
    await iap().endConnection();
  } catch {
    // non-fatal
  }
  _connected = false;
}

// ── Products ─────────────────────────────────────────────────────────────────

export type StoreOffer = { productId: string; price: string; offerToken?: string };

/**
 * Localized store prices for the given plans, keyed by productId. Plans the
 * store doesn't return (not set up / not approved yet) are missing from the map
 * and shouldn't be offered.
 */
export async function getOffers(plans: Plan[]): Promise<Record<string, StoreOffer>> {
  await init();
  const skus = plans.map(productIdFor).filter((id): id is string => !!id);
  if (!skus.length) return {};
  const subs: any[] = await iap().getSubscriptions({ skus });
  const offers: Record<string, StoreOffer> = {};
  for (const sub of subs) {
    if (STORE_PROVIDER === 'apple') {
      offers[sub.productId] = { productId: sub.productId, price: sub.localizedPrice || sub.displayPrice || '' };
      continue;
    }
    const plan = plans.find((p) => p.playProductId === sub.productId);
    const details: any[] = sub.subscriptionOfferDetails || [];
    // The base plan itself (no offerId), not a promotional offer on it.
    const offer =
      details.find((d) => d.basePlanId === (plan?.playBasePlanId || 'monthly') && !d.offerId) || details[0];
    if (!offer) continue;
    const phase = offer.pricingPhases?.pricingPhaseList?.slice(-1)[0];
    offers[sub.productId] = {
      productId: sub.productId,
      price: phase?.formattedPrice || '',
      offerToken: offer.offerToken,
    };
  }
  return offers;
}

// ── Purchase ─────────────────────────────────────────────────────────────────

/**
 * Buy (or switch to) a plan. Resolves once the server has provisioned it —
 * `status: 'pending'` means Play is still waiting on the payment.
 *
 * On Play a plan change must replace the current purchase: pass its token and
 * whether the new plan costs more. The App Store handles changes within the
 * subscription group itself.
 */
export async function purchase(
  plan: Plan,
  offer: StoreOffer,
  change?: { purchaseToken: string; isUpgrade: boolean },
): Promise<ValidateResult> {
  await init();
  if (_pending) throw new Error('A purchase is already in progress');

  const result = new Promise<ValidateResult>((resolve, reject) => {
    _pending = { productId: offer.productId, resolve, reject };
  });
  try {
    if (STORE_PROVIDER === 'apple') {
      await iap().requestSubscription({
        sku: offer.productId,
        andDangerouslyFinishTransactionAutomaticallyIOS: false,
      });
    } else {
      if (!offer.offerToken) throw new Error(`${plan.name} is not available on Google Play`);
      await iap().requestSubscription({
        subscriptionOffers: [{ sku: offer.productId, offerToken: offer.offerToken }],
        ...(change
          ? {
              purchaseTokenAndroid: change.purchaseToken,
              replacementModeAndroid: change.isUpgrade
                ? REPLACEMENT_MODE_CHARGE_PRORATED_PRICE
                : REPLACEMENT_MODE_WITH_TIME_PRORATION,
            }
          : {}),
      });
    }
  } catch (err) {
    _pending = null;
    throw err;
  }
  return result;
}

/** True when the user closed the store sheet without buying. */
export function isUserCancelled(err: any): boolean {
  if (err?.code === 'E_USER_CANCELLED') return true;
  // getAvailablePurchases passes StoreKit's own error through: SKErrorPaymentCancelled
  // is code 2, e.g. when the user cancels the Apple Account sign-in during restore.
  return /SKErrorDomain error 2\b/.test(String(err?.message ?? ''));
}

/**
 * Re-link subscriptions this store account owns to the signed-in account (new
 * device, reinstall). Required by App Review. Returns how many were restored.
 */
export async function restore(plans: Plan[]): Promise<number> {
  await init();
  const ours = new Set(plans.map(productIdFor).filter(Boolean));
  const purchases: any[] = await iap().getAvailablePurchases();
  let restored = 0;
  for (const p of purchases) {
    if (!ours.has(purchaseProductId(p))) continue;
    try {
      const result = await validate(p);
      if (result.status === 'active' || result.status === 'past_due') restored++;
    } catch {
      // Expired, or linked to another account — skip it.
    }
  }
  return restored;
}

/** Open the store's own subscription management (cancel / change billing). */
export async function openManageSubscriptions(productId?: string): Promise<void> {
  if (STORE_PROVIDER === 'apple') {
    await Linking.openURL('https://apps.apple.com/account/subscriptions');
    return;
  }
  await Linking.openURL(
    productId
      ? `https://play.google.com/store/account/subscriptions?sku=${productId}&package=${PLAY_PACKAGE}`
      : 'https://play.google.com/store/account/subscriptions',
  );
}
