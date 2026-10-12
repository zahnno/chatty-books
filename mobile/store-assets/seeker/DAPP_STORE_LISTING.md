# Chatty Books: Solana dApp Store listing

Field-by-field values for the dApp Store publisher portal ("Let's add your dApp details"), in
form order. The character counts have been checked against each field's limit. Assets live
in this folder and in `../android/`.

| Field | Value |
| --- | --- |
| App Name (25) | `Chatty Books` |
| Package Name | `com.chattybooks.app` |
| Subtitle (50) | `Read, listen and talk with the characters` (41, from the Play short description) |
| Your Solana Wallet | `DyRj9Dpjacv7HejpZW1oRz7Nd51Ay3FeaibXFDnTXFvH` (already selected; also the payments treasury) |
| Language | English |
| Countries | All countries |
| App Website | `https://www.chattybooks.com` |
| Support Email | `support@chattybooks.com` |
| Contact Email | `support@chattybooks.com`, or your own address if Solana Mobile should reach you directly |
| Terms of Use | `https://www.chattybooks.com/terms` |
| Privacy Policy | `https://www.chattybooks.com/privacy` |
| Editor's Choice | Yes. See [Editor's Choice](#editors-choice) below. |

Other subtitles that fit: `Talk to the characters in classic books` (39),
`Classic books whose characters talk back` (40).

## Description

Adapted from the Google Play full description (`../STORE_LISTING.md` §3). The only
changes are a "Made for Seeker" section and Seeker wording for the billing paragraph.

```
Books have always talked to you. Now you can talk back.

Chatty Books is a reading app where the characters come to life. Read a classic, listen along with a narrator, and when a scene grabs you, open a conversation with the people inside the story. Ask Elizabeth Bennet what she really thinks of Mr. Darcy. Ask Van Helsing how to stop a vampire. Ask the Mad Hatter why a raven is like a writing desk. Every character knows their book, their world and their secrets.

Talk to the characters
• Chat with the heroes, villains and side characters of every book
• Each character answers in their own personality and voice, grounded in their story
• Suggested questions help you dig deeper into plot, motives and relationships
• A literary guide for every book, for when you want context rather than character

Voice conversations
• Tap the mic and just talk. No typing needed
• Characters reply out loud in a voice matched to who they are
• Tap any reply to hear it spoken again

Every book, narrated
• Full audiobook narration for the catalogue, with a choice of narrators
• Narration stays in sync with your page, so you can switch between reading and listening
• Keeps playing in the background and remembers where you left off

A reader that feels like paper
• Clean, typography-first reader set in Literata, a typeface made for long reading
• Paper, Sepia and Night themes, plus adjustable text size
• Your progress saves automatically and follows you to the web

A gallery of scenes
• Browse illustrations and short films of favorite scenes, created by the Chatty Books community
• Like, comment and discover new books through the scenes other readers loved

Discover your next read
• Timeless classics like Pride and Prejudice, Dracula, Alice's Adventures in Wonderland, Jane Eyre, Frankenstein and The Wonderful Wizard of Oz, plus new original fiction
• Save books to your library and pick up right where you stopped

Made for Seeker
• Sign in with your Solana wallet. No email or password needed
• Seeker Genesis Token holders get a one-time bonus of free tokens
• Pay for plans in USDC, SOL or SKR, straight from your wallet

Free to start
Create a free account to start reading and chatting. Upgrade to a 30-day plan for more character conversations, paid from your wallet. Plans don't renew automatically, so there's nothing to cancel. Your plan and progress work on both mobile and web.

Characters are AI-generated interpretations of fictional characters and can make mistakes.
```

## Release notes (1.0.0)

```
Welcome to Chatty Books on Seeker! Read the classics, listen along with a narrator, and talk to the characters, out loud if you like.

Made for Seeker:
• Sign in with your Solana wallet, no email needed
• Seeker Genesis Token holders get a one-time token bonus
• Pay for 30-day plans in USDC, SOL or SKR
```

## Assets

| Slot | File | Spec check |
| --- | --- | --- |
| dApp Icon (512×512, no transparency) | `app-icon_512x512.png` | 512×512, no alpha ✓ |
| Banner (1200×600) | `banner_1200x600.png` | 1200×600 ✓ |
| dApp Preview (4–8, portrait 9:16, 3 MB max) | `../android/screenshots/phone_1080x1920/01…07` | 1080×1920, all under 1.6 MB ✓ |

Upload all 7 screenshots in filename order, as for Play. They show reading, voice and
chat, not the Seeker features. An 8th slot is free: a screenshot of the Subscription screen
with the USDC / SOL / SKR picker and the Seeker perk card would show that it's
Solana-native. Take it from the Seeker APK once it's installed.

## Editor's Choice

| Field | Value |
| --- | --- |
| Headline (50) | `Ask the characters of classic books anything` (44) |
| Tag (12) | `Book chats` (10) |
| Graphic (1200×1200) | `editors-choice_1200x1200.png` (1200×1200, no alpha, 1 MB) |

Other headlines: `Read it. Hear it. Talk to it.` (29, matches the banner),
`Your favorite characters, ready to talk` (39). Other tags: `Classics` (8), `Read & talk` (11).

The graphic follows the banner's design: the logo, "Read it. Hear it. Talk to it.", the
five classic covers, Elizabeth Bennet and the Mad Hatter, and a "Made for Seeker" pill. The
covers and portraits are the production ones.

## Before you submit

- **The release APK is signed with the Seeker key** (`../../credentials/seeker.jks`, not the
  Play key). Back up the keystore and `credentials.json`: every future update must be signed
  with that same key.
- **Switch the server to mainnet** before the listing goes live (remove `SOLANA_CLUSTER` on
  Render) and fund the treasury's USDC and SKR token accounts. On devnet, the SGT bonus and
  USDC/SKR checkout don't work (see `docs/seeker-solana.md`).
- **The terms and privacy policy** should mention crypto payments: passes don't renew,
  on-chain payments are final, and the linked wallet address is stored. Update `/terms` and
  `/privacy` if they don't yet.
- **Update `../../dapp-store/config.yaml`.** It still says "Talkingbook" and `talkingbook.app`.
  If you publish with the CLI instead of the portal, bring it in line with this page.
