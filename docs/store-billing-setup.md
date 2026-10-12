# Store Billing Setup Checklist

A step-by-step checklist for turning on App Store and Google Play subscriptions. Tick the boxes
as you go. More detail is in `mobile/README.md` under **Subscriptions (in-app purchases)**.

> **Safe until finished:** until the server environment variables are set, the validate
> endpoints return **503**. Nobody can be charged without getting their plan: the store
> re-delivers any unfinished purchase on the next app launch.

---

## 0. Before you start

- [ ] App Store Connect: the **Paid Applications agreement**, banking and tax are active.
      Products won't load without these.
- [ ] Play Console: the app has been uploaded once, to any test track, with the billing
      library. Play won't let you create subscriptions before that.
- [ ] You have access to the Render dashboard to set server env vars.

Bundle ID / package name on both stores: `com.chattybooks.app`

---

## 1. Add store product IDs to the plans (database)

From `server/`:

```bash
node scripts/addStoreProductIds.js --dry-run   # check what it will change
node scripts/addStoreProductIds.js             # apply it
```

- [ ] Dry run looks right
- [ ] Ran it for real

This sets on each paid plan:

| Store | Product ID | Notes |
| --- | --- | --- |
| Apple | `chattybooks_<tier>_monthly` | |
| Google Play | `sub_<tier>` | with base plan `monthly` |

Write down the tier names it prints. You'll need the exact IDs in steps 2 and 3.

| Tier | Apple ID | Play ID | Price |
| --- | --- | --- | --- |
| | | | |
| | | | |
| | | | |

---

## 2. App Store Connect (iOS)

### 2a. Subscriptions
- [ ] Create **one subscription group**.
- [ ] Add one **auto-renewable, 1-month** subscription per paid tier, ID `chattybooks_<tier>_monthly`.
- [ ] Order tiers **highest first** in the group, so moving up counts as an upgrade.
- [ ] Prices match what each plan promises.

### 2b. In-App Purchase key
Users and Access → Integrations → **In-App Purchase** → generate a key, download the `.p8`.

- [ ] Base64 the key: `base64 -i SubscriptionKey_XXXX.p8 | pbcopy`
- [ ] Set on the server (Render):

| Variable | Value |
| --- | --- |
| `APPLE_IAP_KEY_ID` | Key ID shown next to the key |
| `APPLE_IAP_ISSUER_ID` | Issuer ID at the top of the keys page |
| `APPLE_IAP_PRIVATE_KEY_BASE64` | base64 of the `.p8` |
| `APPLE_IAP_APP_APPLE_ID` | numeric Apple ID of the app (App Information) |
| `APPLE_IAP_BUNDLE_ID` | *optional*, defaults to `com.chattybooks.app` |

### 2c. Server notifications
App Information → App Store Server Notifications → **Version 2**.

- [ ] Production URL: `https://talkingbook.onrender.com/api/webhooks/apple`
- [ ] Sandbox URL: `https://talkingbook.onrender.com/api/webhooks/apple`

---

## 3. Google Play Console (Android)

### 3a. Subscriptions
- [ ] One subscription per paid tier, ID `sub_<tier>`.
- [ ] Each has an auto-renewing monthly base plan with ID `monthly`.
- [ ] Prices match what each plan promises.

### 3b. Service account (for verifying purchases)
- [ ] Google Cloud: create a service account and download its JSON key.
- [ ] Google Cloud: enable the **Google Play Android Developer API**.
- [ ] Play Console → Users and permissions: invite the service account's email with
      **view financial data** and **manage orders and subscriptions** access.
- [ ] Base64 the JSON: `base64 -i service-account.json | pbcopy`
- [ ] Set on the server:

| Variable | Value |
| --- | --- |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` | base64 of the service account JSON |
| `ANDROID_PACKAGE_NAME` | *optional*, defaults to `com.chattybooks.app` |

### 3c. Real-time notifications (Pub/Sub)
- [ ] Google Cloud Pub/Sub: create a topic.
- [ ] Give `google-play-developer-notifications@system.gserviceaccount.com` the
      **Pub/Sub Publisher** role on that topic.
- [ ] Create a **push** subscription on the topic:
  - Endpoint: `https://talkingbook.onrender.com/api/webhooks/play`
  - **Enable authentication**, pick a service account, and set an audience.
- [ ] Set on the server:

| Variable | Value |
| --- | --- |
| `GOOGLE_PLAY_PUBSUB_AUDIENCE` | the audience set on the push subscription |
| `GOOGLE_PLAY_PUBSUB_SA_EMAIL` | the service account the push subscription signs with |

- [ ] Play Console → Monetization setup → Real-time developer notifications: enter the topic
      name.
- [ ] Click **Send test notification** and check the server logs show it arriving.

---

## 4. Redeploy and check the server

- [ ] Redeploy on Render after adding the env vars.
- [ ] `POST /api/billing/apple/validate` and `/api/billing/play/validate` no longer return 503.
- [ ] Server unit checks pass: `node server/test/storeBilling.test.js`

---

## 5. Build the apps

IAP needs a dev or release build. It does **not** work in Expo Go.

- [ ] **iOS:** build with EAS. It hasn't been built natively yet (local Xcode is too old), so
      this is the first real iOS build with the billing module.
- [ ] **Android:** build with EAS (the debug APK already builds locally with billing).
- [ ] **Check the Android target SDK.** The generated project targets **SDK 34**. Google Play
      may require a newer target for updates, so check before submitting.
- [ ] **Seeker / dApp Store build:** it uses `EXPO_PUBLIC_BILLING_MODE=dappstore` and keeps
      the web "manage on the web" flow. No store billing there.

---

## 6. Test purchases

### iOS (sandbox)
- [ ] Create a sandbox Apple ID in App Store Connect.
- [ ] Install via TestFlight or a dev build on a device and sign in with it.
- [ ] (The server tries Production first, then falls back to Sandbox automatically.)

### Android (test track)
- [ ] Add your Google account as a **license tester**.
- [ ] Install from the **internal testing** track.
- [ ] Test subscriptions renew every few minutes, which exercises the renewal webhook.

### What to check on each platform
- [ ] **First purchase:** the plan switches and the plan's tokens are **added** to the balance.
- [ ] **Renewal:** the balance **resets** to the plan's allowance (not added again).
- [ ] **Upgrade / change plan:** the plan changes and the balance resets to the new allowance.
- [ ] **Restore purchases** works after reinstalling.
- [ ] **Manage subscription** opens the store's subscription page.
- [ ] **Cancel / let it expire:** the account drops back when the period ends.
- [ ] **No double billing:**
  - [ ] A user paying through Stripe can't subscribe again in the app.
  - [ ] A user paying through one store can't subscribe on the other.
  - [ ] On the web, changing or cancelling a store-billed plan returns a 409.
  - [ ] Buying in the app cancels any live Stripe subscription.
- [ ] **Store builds show no web billing links** (outside payment breaks store rules).

---

## 7. Before App Review

Apple checks the subscription screen for all of these. They're already built, so just confirm
they show up:

- [ ] Store prices
- [ ] Buy / change plan
- [ ] Restore purchases
- [ ] Manage subscription
- [ ] Renewal terms
- [ ] Terms of Use and Privacy Policy links

---

## Reference: how it works

**Buying:** the store takes payment → the app sends the purchase to
`POST /api/billing/{apple,play}/validate` → the server checks it with Apple or Google, switches
the plan and grants tokens → only then does the app mark the purchase complete. If the check
fails, the store re-delivers the purchase on the next launch, so nothing is lost.

**Later events:** renewals, plan changes, cancellations and refunds arrive at
`/api/webhooks/apple` and `/api/webhooks/play`.

**Tokens:** same rules as Stripe. The first purchase adds the plan's tokens; each renewal or plan
change resets the balance to the plan's allowance. Every grant is tied to the store's
per-period transaction or order ID (`ProcessedBillingEvent`), so the app and a notification
can't both credit the same period.

**Differences from treeview:**
- Subscriptions only, no one-off token packs.
- Product IDs live on the plans in the database (`appleProductId` / `playProductId`), so the
  app doesn't keep its own catalog.
- Play Billing Library 8 needed two build fixes on Expo SDK 52:
  - The version is set on the root Gradle project (`mobile/plugins/withPlayBilling.js`); the
    plugin's own setting overrides anything else.
  - Only the billing module skips Kotlin's version check, since Billing 8 is built with a newer
    Kotlin. Remove this once you upgrade to an Expo SDK with Kotlin 2.
- Server libraries are pinned to versions that run on Node 18 (what Render uses).

**Key files:**
- `mobile/lib/storeBilling.ts`: connect, prices, purchase, restore, manage links
- `mobile/app/subscription.tsx`: the subscription screen
- `mobile/lib/billingMode.ts`: store vs. dApp Store (web) billing mode
- `mobile/plugins/withPlayBilling.js`: Billing 8 Gradle pin
- `patches/react-native-iap+12.16.4.patch`: Billing 8 patch, applied on `postinstall`
- `server/scripts/addStoreProductIds.js`: step 1
- `server/test/storeBilling.test.js`: unit checks
