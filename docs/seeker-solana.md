# Seeker: Solana features

Only in the Seeker build (`EXPO_PUBLIC_BILLING_MODE=dappstore`, `lib/billingMode.ts` → `IS_SEEKER`).
Store builds never show any of this: Apple and Google Play don't allow crypto payment for
digital goods.

| Feature | App | Server |
|---|---|---|
| Sign In With Solana: log in with a wallet (creates a wallet-only account), or link one in Settings | `app/(auth)/login.tsx`, `components/SeekerWallet.tsx` | `routes/solana.js`, `services/solana/siws.js` |
| Seeker Genesis Token bonus: one-time token grant for Seeker owners | `SeekerBonus` on the Subscription screen, auto-claimed after wallet login | `services/solana/sgt.js` |
| 30-day plan passes paid in USDC, SOL or SKR | `app/subscription.tsx`, `lib/solana.ts` | `services/solana/payments.js`, `services/solana/pass.js` |
| Publish on Solana: mint a book as a Metaplex Core NFT (fee in SKR); its holder earns a share of readers' chat spend, claimed in USDC or SKR | `app/publish.tsx`, `lib/publishing.ts` | `routes/publishing.js`, `services/solana/publishing.js` |

The app talks to the wallet through Mobile Wallet Adapter
(`@solana-mobile/mobile-wallet-adapter-protocol`; Seed Vault signs on Seeker). The server
builds every transaction and verifies every signature, so the app ships no Solana SDK. The
server has no Solana SDK either: `@solana/web3.js` needs Node ≥ 20.18, so
`services/solana/core.js` hand-rolls the few pieces needed (RPC, base58, ed25519, legacy
transaction encoding). The encoding was cross-checked against web3.js.

## How it works

**Sign-in.** `POST /api/solana/auth/challenge` issues a single-use nonce (10 min TTL,
`SolanaNonce`). The wallet signs a SIWS message for it. `POST /api/solana/auth/verify` checks
the ed25519 signature, that the message names our domain (the host of `SIWS_URI`) and the
signing address, and consumes the nonce. Wallets without sign-in support fall back to
`signMessages` over the same text. Wallet-only accounts have no email or password;
`User.walletAddress` is unique.

**Seeker bonus.** `POST /api/solana/seeker-bonus` looks for a Seeker Genesis Token in the
account's linked wallet, using Solana Mobile's check: a Token-2022 mint whose metadata pointer
and token-group member both point to `GT22s89n…f99Te`. Claims are keyed on the **SGT mint**
(`ProcessedBillingEvent` `sgt:<mint>`), plus one per account, so moving the SGT to another
wallet can't claim twice. Bonus tokens land in the current balance. Like every other token,
they reset at the next plan period.

**Passes.** A pass is one period of a normal plan (`subscription.provider = 'solana'`) with
the same tokens and reset rules as the store plans. It never auto-renews.
- Buying your live plan again prepays another period. `subscription.solana.paidUntil` moves
  out 30 days, and the tokens arrive when that period starts.
- The hourly `rollOverSolanaPasses` job starts each prepaid period (reset balance, then credit
  the plan's tokens) and drops lapsed passes to the free plan.
- Switching tier while a pass is live is refused, so prepaid time is never thrown away.
- Buying a pass is refused while a Stripe, App Store or Play plan is live. The web refuses
  Stripe purchases while a pass is live.

**Checkout.** `POST /api/solana/payments` quotes the plan's USD price in the chosen currency
(USDC is 1:1; SOL and SKR use Jupiter's price API, rounded up). It returns an unsigned
transfer to the treasury tagged with a unique Solana Pay `reference` key. The wallet signs
and sends it, and the app polls `POST /api/solana/payments/:id/confirm`. The server finds the
transaction by its reference and checks that the treasury's balance rose by at least the
quote, whatever other instructions the wallet added. Each transaction signature can settle
only one payment. The 2-minute `reconcilePendingPayments` job settles payments the app never
reported back.

## Setup

1. **Migrate the email index before deploying.** The old unique `email_1` index allows only
   one account with no email. Run:
   ```bash
   cd server && node scripts/migrateEmailIndexForWallets.js --dry-run
   node scripts/migrateEmailIndexForWallets.js
   ```
2. **Treasury wallet.** Use a wallet you control, ideally a hardware wallet or multisig; the
   server never holds its keys. It must already have token accounts for **USDC and SKR**
   (send it a small amount of each, or create the associated token accounts). A currency
   whose token account is missing is simply not offered.
3. **Environment** (`server/config.env` / Render):

   | Var | Required | Notes |
   |---|---|---|
   | `SOLANA_TREASURY_ADDRESS` | yes, for payments | Checkout is off without it. Sign-in and the bonus still work. |
   | `SOLANA_RPC_URL` | strongly recommended | A Helius (or similar) URL for the same cluster as `SOLANA_CLUSTER`. The public RPC rate-limits hard: `getTokenAccountsByOwner` and confirm polling hit 429s quickly. If the key is locked to allowed domains, set `SOLANA_RPC_ORIGIN` to one of them (e.g. `https://talkingbook.onrender.com`); server requests otherwise send no `Origin` and get 403. |
   | `SOLANA_RPC_ORIGIN` | if the RPC key has allowed domains | Sent as the `Origin` header on RPC calls. |
   | `SGT_BONUS_TOKENS` | no | Default `50000` ($5 at 10,000 tokens/$). |
   | `SOLANA_CLUSTER` | no | `mainnet-beta` (default) or `devnet`. Devnet takes devnet USDC and SOL; SKR is mainnet-only. |
   | `SIWS_URI` | no | Default `https://www.chattybooks.com`. Must match `IDENTITY.uri` in `mobile/lib/solana.ts`. |
   | `JUPITER_API_KEY` | recommended | Prices come from Jupiter, falling back to CoinGecko; both rate-limit Render's shared IPs without a key. With a key, prices use `api.jup.ag`. |
   | `COINGECKO_API_KEY` | no | CoinGecko demo key for the fallback. |
   | `SOLANA_USDC_MINT`, `SOLANA_SKR_MINT`, `SOLANA_PRICE_URL` | no | Overrides. |
4. Build with `npm run build:seeker`. The wallet adapter is a native module, so this needs a
   dev or release build; Expo Go can't run it.

## Publishing and revenue share

1. **Submit.** `POST /api/publishing/books` (multipart `bookFile`, `rightsConfirmed=true`) needs a
   linked wallet. It runs the same pipeline as the admin upload, but the book is private
   (`publishing.status = pending_review`) and characters are generated in the background. Each
   publisher can have at most 3 books in review.
2. **Review.** Admins approve or reject from the Publish screen
   (`/api/publishing/admin/*`).
3. **Mint.** `POST /books/:id/mint` builds one transaction with the publisher as fee payer. It
   contains the publishing fee in SKR to the treasury (`PUBLISH_FEE_USD`, skipped if SKR isn't
   available) and a Metaplex Core `CreateV1` for a fresh asset keypair, owned by the publisher,
   with metadata served at `/api/publishing/books/:id/metadata.json`. The server co-signs as the
   asset. The wallet **signs** it (MWA `signTransactions`), and `/mint/submit` re-applies the
   asset signature, sends the transaction, then checks on-chain that the asset exists, is owned by
   the publisher, and that the fee reached the treasury. Only then does the book go public.
4. **Earn.** After each successful chat or voice charge, `recordInteraction` credits the book
   (and the character) `tokens × $0.0001 × PUBLISHER_SHARE_BPS / 10000`, in integer micro-USD.
   That's 20% of the tokens' face value by default.
5. **Claim.** `POST /books/:id/claim` pays the unclaimed balance (capped at
   `PUBLISHER_MAX_CLAIM_USD`) to **whoever holds the asset now**, read from chain, so the
   earnings move with the NFT. The holder must have that wallet linked. The amount is reserved on
   the book before sending, so concurrent claims can't pay twice. A refused send releases it; an
   ambiguous one (timeout) stays reserved as a `sending` `PublisherPayout`.

| Variable | Default | |
|---|---|---|
| `SOLANA_PAYOUT_SECRET_KEY` | none (payouts off) | Hot wallet that pays claims: base58 secret key or a `solana-keygen` JSON array. Fund it with USDC and/or SKR, plus SOL for fees and recipients' token-account rent. Keep the balance small. |
| `PUBLISHER_SHARE_BPS` | `2000` | Holder's share of token face value. Fixed per book when it's minted. |
| `PUBLISH_FEE_USD` | `2` | Publishing fee, charged in SKR. `0` turns it off. |
| `PUBLISHER_MIN_CLAIM_USD` / `PUBLISHER_MAX_CLAIM_USD` | `0.01` / `25` | Claim limits |
| `PUBLIC_API_URL` | request host | Base URL for asset metadata URIs |

## Testing notes

- Tested: SIWS (including replay and wrong-signer rejection), wallet-only accounts, linking,
  pass start / extend / rollover / lapse, and payment confirmation idempotency, all against an
  in-memory MongoDB. The SGT check ran against a real mainnet holder. The payment verifier ran
  on real mainnet USDC and SOL transfers, and built SKR transfers passed `simulateTransaction`.
- **Not yet tested:** a full wallet round trip on a Seeker or Android device with a real
  wallet app (MWA authorize, sign-in and signAndSend). Try it on devnet first:
  `SOLANA_CLUSTER=devnet` and a devnet treasury holding devnet USDC.
