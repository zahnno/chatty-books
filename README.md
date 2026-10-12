# Chatty Books

Talk to the characters in the books you read. Chatty Books turns a book into a cast of AI
characters you can text or speak with, alongside the reader, audiobooks and image
generation. It runs on the web, iOS, Android, and the Solana **Seeker**.

## Seeker and Solana

The Seeker build (Solana dApp Store) adds features that the App Store and Play builds
can't offer:

| Feature | How |
|---|---|
| Sign In With Solana | Log in with a wallet or link one in Settings. Uses Mobile Wallet Adapter, and Seed Vault signs on Seeker. |
| Seeker Genesis Token bonus | A one-time credit grant per SGT. Claims are keyed on the SGT mint, so moving it to another wallet can't claim twice. |
| Plan passes in **SKR**, USDC or SOL | 30-day passes paid on-chain and verified by the server against the landed transaction. |
| **Publish on Solana** | Anyone with a wallet can submit a book. Once it's approved, they mint it as a **Metaplex Core NFT**, paying the fee in **SKR**. From then on, every chat or voice reply with the book's characters earns the NFT's holder a share of what the reader spent, claimable in USDC or SKR. The earnings follow the NFT, so a book's revenue stream can be sold or traded. |

The app ships no Solana SDK: the server builds every transaction and verifies every
signature, and the wallet only signs. Details: [`docs/seeker-solana.md`](docs/seeker-solana.md).

## Verify it on-chain (mainnet)

Everything below happened on Solana mainnet from the Seeker app, as shown in the demo video.

| Flow | Transaction | What it shows |
|---|---|---|
| Buy a 30-day plan pass in **SKR** | [`37S9Ny…z9sG`](https://solscan.io/tx/37S9Nyhw9dmE92bidy4MB1L6xcpLnrhyd2mSaoUL5RZ2iSiAuiiJtUCFeksXaurWs6HPBBo8bC1LYbpBAh8Vz9sG) | 176.95 SKR ($2.99 Explorer pass) from the reader's wallet to the treasury, verified by the server before the pass activates |
| Publish *Momentum*: SKR fee + Metaplex Core mint | [`46D61G…J4BAE`](https://solscan.io/tx/46D61GStPjqeCJMa3vz8j6dE7v9eTtx8gVYt8vYCUffKc2YYFv86rPhQ7boKVJ7BrywF6YjbrWBWntHFFxBJ4BAE) | 113.76 SKR to the treasury and the book's NFT created in **one** transaction |
| Publish *The Gift of the Magi*: SKR fee + Metaplex Core mint | [`svBSaZ…CobA`](https://solscan.io/tx/svBSaZuWVj5yKTmJSqtNgxcckLrYc43dPbpvxsGSL3dJWbru55c43TEJ6xmcNy5zUpikMU7Q5kEi9gE8441CobA) | 117.68 SKR fee + NFT |
| Holder claims chat revenue (SKR) | [`4cgmpQ…d2pr`](https://solscan.io/tx/4cgmpQS7JQQvrfa1V88k6oTqwiNiTjgcuGWNQStkSyjuLPAKYifPiydRLn422UBYeENvyQh6tcWdmggJUXpJd2pr) | 0.6025 SKR ($0.01) from the payout wallet to the NFT holder |
| Holder claims chat revenue (SKR) | [`5XfJU2…8vj1`](https://solscan.io/tx/5XfJU29pqSpQwithr3gy15NWs4vJCAtDJq1Qafh44X1iYePCqsi2tXdPNFvRU3D81uM9cQiHkF9tWQwgFGiz8vj1) | 0.7615 SKR ($0.013) |

| Account | Address |
|---|---|
| *Momentum* book NFT (Metaplex Core) | [`A4E3VRqjqvspNXfYMkn3QPM2GLxCimUJzbhHmoU4STQ2`](https://core.metaplex.com/explorer/A4E3VRqjqvspNXfYMkn3QPM2GLxCimUJzbhHmoU4STQ2) |
| *The Gift of the Magi* book NFT | [`EDBSFriNtkLhZnX3d19js9qXoVwWyqtNFW3Hwq1PMZRz`](https://core.metaplex.com/explorer/EDBSFriNtkLhZnX3d19js9qXoVwWyqtNFW3Hwq1PMZRz) |
| Treasury (fees and passes) | [`DyRj9Dpjacv7HejpZW1oRz7Nd51Ay3FeaibXFDnTXFvH`](https://solscan.io/account/DyRj9Dpjacv7HejpZW1oRz7Nd51Ay3FeaibXFDnTXFvH) |
| Payout wallet (holder claims) | [`GMj6eYWxAkMdZz6xwwZcsbameATQXuUBXGuwyWvkCsgD`](https://solscan.io/account/GMj6eYWxAkMdZz6xwwZcsbameATQXuUBXGuwyWvkCsgD) |
| SKR mint | [`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`](https://solscan.io/token/SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3) |
| Metaplex Core program | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` (no custom program; we use Core as deployed by Metaplex) |

Live API: `https://talkingbook.onrender.com` — for example
[`/api/publishing/settings`](https://talkingbook.onrender.com/api/publishing/settings) (fee, revenue share, payout
currencies) and each book NFT's metadata at `/api/publishing/books/<id>/metadata.json`.

## Where the Solana code is

| File | What it does |
|---|---|
| [`server/services/solana/core.js`](server/services/solana/core.js) | Hand-written Solana primitives (no SDK): JSON-RPC, base58, ed25519 sign/verify, legacy transaction serialization, PDA/ATA derivation, Metaplex Core `CreateV1` |
| [`server/services/solana/publishing.js`](server/services/solana/publishing.js) | Publish on Solana: mint transaction (SKR fee + Core asset), on-chain verification, per-character earnings, holder claims from the payout wallet |
| [`server/services/solana/payments.js`](server/services/solana/payments.js) | Plan passes in SKR / USDC / SOL: live pricing, transaction building, verification by balance deltas |
| [`server/services/solana/siws.js`](server/services/solana/siws.js) | Sign In With Solana challenges and verification |
| [`server/services/solana/sgt.js`](server/services/solana/sgt.js) | Seeker Genesis Token detection and one-claim-per-token bonus |
| [`server/routes/publishing.js`](server/routes/publishing.js), [`server/routes/solana.js`](server/routes/solana.js) | The HTTP API the app calls |
| [`server/services/publishingReview.js`](server/services/publishingReview.js), [`server/services/publishingEdits.js`](server/services/publishingEdits.js) | AI screening, review emails, holder edits with revert |
| [`mobile/lib/solana.ts`](mobile/lib/solana.ts), [`mobile/lib/publishing.ts`](mobile/lib/publishing.ts) | Mobile Wallet Adapter: sign-in, sign-and-send, sign-only for co-signed mints |
| [`mobile/app/publish.tsx`](mobile/app/publish.tsx), [`mobile/app/edit-book/`](mobile/app/edit-book) | The Publish on Solana screens |

Design notes and every setting: [`docs/seeker-solana.md`](docs/seeker-solana.md).

## Layout

| Path | What |
|---|---|
| `mobile/` | Expo / React Native app (iOS, Android, Seeker). See [`mobile/README.md`](mobile/README.md). |
| `client/` | React web app |
| `server/` | Node / Express API on MongoDB. Solana code is in `server/services/solana/`. |
| `packages/shared/` | API client, auth and data hooks shared by web and mobile |
| `docs/` | Release, billing and Seeker notes |

## Run it

**Try the app:** install the [Seeker APK](https://github.com/zahnno/chatty-books/releases/download/v1.0-hackathon/chatty-books-seeker.apk)
on a Seeker or any Android phone with a Solana wallet. It talks to the live API on mainnet.

**Build the Seeker APK** (Node 20+, JDK 17, Android SDK):

```bash
npm install                                   # at the repo root (npm workspaces)
cd mobile
EXPO_PUBLIC_BILLING_MODE=dappstore EXPO_PUBLIC_SERVER_URI=https://talkingbook.onrender.com \
  npx expo prebuild --platform android
cd android && ./gradlew assembleRelease       # app/build/outputs/apk/release/app-release.apk
```

Or with EAS: `npm run build:seeker:local` (profile `seeker`).

**Run the server** (Node 18+, MongoDB):

```bash
cd server && npm install
cp /dev/null config.env                       # then set the variables below
npm start                                     # port 5001
```

Required: `ATLAS_URI`, `SECRET_KEY`, `PRIVATEER_API_KEY`. For the Solana features: `SOLANA_TREASURY_ADDRESS`,
`SOLANA_RPC_URL`, `SOLANA_PAYOUT_SECRET_KEY` (payouts), and optionally `PUBLISH_FEE_USD`,
`PUBLISHER_SHARE_BPS`, `SOLANA_CLUSTER=devnet`. The full list with defaults is in
[`docs/seeker-solana.md`](docs/seeker-solana.md).
