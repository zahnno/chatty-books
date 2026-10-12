# Subscription Renewal Process

## Overview

Talkingbook has two subscription categories: **Free Tier** and **Paid Tiers** (basic, standard, premium, enterprise). Each follows a different renewal path.

---

## Free Tier

### Initial Assignment
When a new user is created, a `pre('save')` hook in `server/models/userModel.js` automatically:
1. Finds the active free plan (`tier: 'free'`)
2. Sets `subscription.plan`, `startDate`, `endDate` (now + 30 days), `status: 'active'`, `autoRenew: true`
3. Sets `tokenBalance = freePlan.tokensPerMonth` directly (no TokenTransaction record)

### Manual Re-subscription
A user can explicitly subscribe to the free plan via `POST /api/subscriptions/subscribe`:
1. If the user has an active paid Stripe subscription, it is cancelled in Stripe first
2. Subscription dates are reset (startDate = now, endDate = now + `plan.duration` days)
3. Tokens are credited via a `TokenTransaction` with action `subscription_purchase`

### Renewal Limitation
> **Important:** There is no automated renewal process for the free tier. The `autoRenew: true` flag is stored on the user record, but no background job or cron currently re-triggers the free plan when `endDate` passes. Free tier renewal must be manually triggered (e.g., user visits the subscribe flow again) or a background renewal job needs to be implemented.

---

## Paid Tiers

Paid subscriptions are managed through **Stripe** and driven by **webhooks**.

### Initial Subscription (`POST /api/subscriptions/subscribe`)
1. A Stripe Customer is created (or updated with the new payment method)
2. Any existing Stripe subscription is cancelled immediately
3. A new Stripe subscription is created with `payment_behavior: 'default_incomplete'`
4. The initial PaymentIntent is confirmed synchronously
5. On success, the user record is updated:
   - `subscription.plan`, `startDate`, `endDate` (now + `plan.duration` days), `status: 'active'`, `autoRenew: true`, `stripeSubscriptionId`
6. Tokens are credited via a `TokenTransaction` with action `subscription_purchase` and `isInitial: true`

### Monthly Renewal (Stripe-driven)
Stripe automatically charges the customer each billing cycle. The `POST /webhooks/stripe` endpoint handles:

#### `invoice.payment_succeeded` + `billing_reason: subscription_cycle`
Calls `handleRenewalPayment()`:
1. Updates `subscription.startDate` and `endDate` from the invoice's `period_start` / `period_end`
2. Sets `subscription.status = 'active'`
3. Credits `plan.tokensPerMonth` tokens via a `TokenTransaction` with action `subscription_renewal`
4. Saves the user record

#### `invoice.payment_succeeded` + `billing_reason: subscription_update`
Calls `handlePlanChangePayment()` — same flow as renewal, but action is `subscription_plan_change`. Used when a user upgrades or downgrades.

#### `invoice.payment_succeeded` + `billing_reason: subscription_create`
Skipped — tokens are already added during the initial subscription flow above.

### Failed Payment (`invoice.payment_failed`)
1. `subscription.status` is set to `past_due`
2. `autoRenew` is set to `false`
3. Stripe will retry the charge automatically on its retry schedule
4. If `next_payment_attempt === null` (final retry exhausted):
   - `subscription.status` is set to `cancelled`
   - The Stripe subscription is cancelled via API

### Cancellation (`customer.subscription.deleted`)
Triggered when a subscription is cancelled in Stripe (either by the user, admin, or after final payment failure):
1. `subscription.status` is set to `cancelled`
2. `autoRenew` is set to `false`

A user can also cancel manually via `DELETE /api/subscriptions/cancel`, which cancels the Stripe subscription and updates the local status.

---

## Token Credit Summary

| Event | TokenTransaction Action | Tokens Added |
|---|---|---|
| New user (free plan) | *(direct balance set, no transaction)* | `freePlan.tokensPerMonth` |
| Subscribe to free plan | `subscription_purchase` | `plan.tokensPerMonth` |
| Subscribe to paid plan | `subscription_purchase` | `plan.tokensPerMonth` |
| Monthly renewal (paid) | `subscription_renewal` | `plan.tokensPerMonth` |
| Plan change (paid) | `subscription_plan_change` | `plan.tokensPerMonth` |

> Tokens are **additive** — renewal credits are added on top of the existing balance, not a reset.

---

## Key Files

| File | Role |
|---|---|
| `server/models/userModel.js` | Pre-save hook for free plan auto-assignment; `hasActiveSubscription()` method |
| `server/models/subscriptionModel.js` | Plan schema: `tier`, `tokensPerMonth`, `duration`, `stripePriceId` |
| `server/controllers/subscriptionController.js` | `subscribeToPlan()`, `cancelSubscription()` |
| `server/routes/webhooks.js` | Stripe webhook handlers for renewal, failure, cancellation |
| `server/scripts/seedSubscriptions.js` | Seeds the initial free plan (30 days, 100 tokens) |
