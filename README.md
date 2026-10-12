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

## Layout

| Path | What |
|---|---|
| `mobile/` | Expo / React Native app (iOS, Android, Seeker). See [`mobile/README.md`](mobile/README.md). |
| `client/` | React web app |
| `server/` | Node / Express API on MongoDB. Solana code is in `server/services/solana/`. |
| `packages/shared/` | API client, auth and data hooks shared by web and mobile |
| `docs/` | Release, billing and Seeker notes |

## Build the Seeker APK

```bash
npm install                      # at the repo root (npm workspaces)
cd mobile
npm run build:seeker:local       # EAS local build, profile "seeker" (EXPO_PUBLIC_BILLING_MODE=dappstore)
```

Server: `cd server && npm install && npm start`. Configuration is read from `server/config.env`,
which isn't committed.
