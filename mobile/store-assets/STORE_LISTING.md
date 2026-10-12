# Chatty Books: store listing kit

Copy-paste text and upload map for **App Store Connect** (bundle `com.chattybooks.app`) and
**Google Play Console** (package `com.chattybooks.app`). The character counts shown have been checked
against each field's limit. Fill in anything marked `TODO` first.

> **Read "Before you submit" at the bottom first.** It lists items that will get the build
> rejected (no account deletion, no content reporting, a missing reviewer login), and no
> listing copy can work around them.

---

## 1. Image assets (in this folder)

| File | Store / slot | Size |
| --- | --- | --- |
| `ios/app-icon_1024x1024.png` | App Store icon (no alpha) | 1024×1024 |
| `ios/screenshots/iphone-6.9in_1320x2868/*` | iPhone 6.9" (**required**) | 1320×2868 |
| `ios/screenshots/iphone-6.5in_1284x2778/*` | iPhone 6.5" (optional: Apple scales 6.9" down if omitted) | 1284×2778 |
| `ios/screenshots/ipad-13in_2064x2752/*` | iPad 13" (**required**: `supportsTablet: true`) | 2064×2752 |
| `android/app-icon_512x512.png` | Play hi-res icon | 512×512 |
| `android/feature-graphic_1024x500.png` | Play feature graphic (**required**) | 1024×500 |
| `android/screenshots/phone_1080x1920/*` | Play phone (**required**, 2–8) | 1080×1920 (9:16, eligible for promotion) |
| `android/screenshots/tablet-7in_1200x1920/*` | Play 7" tablet | 1200×1920 |
| `android/screenshots/tablet-10in_1600x2560/*` | Play 10" tablet | 1600×2560 |
| `seeker/app-icon_512x512.png`, `seeker/banner_1200x600.png` | Solana dApp Store (`dapp-store/config.yaml`) | 512², 1200×600 |

Every file is a flattened RGB PNG with no transparency, and all are under Play's 8 MB limit.

**Screenshot order.** Upload them in filename order; the first two carry the page.

| # | File | Headline |
| --- | --- | --- |
| 1 | `01-talk-to-characters` | Talk to the people *in the story.* |
| 2 | `02-voice-conversations` | Ask out loud. *They answer back.* |
| 3 | `03-audiobooks` | Every book, *narrated.* |
| 4 | `04-reader` | A reader that feels *like paper.* |
| 5 | `05-gallery` | Scenes, *imagined by readers.* |
| 6 | `06-discover` | Great books, *ready to talk.* |
| 7 | `07-every-character` | Every character *knows their story.* |

> The screens are pixel recreations of the current RN screens. They use the real theme
> tokens and fonts, and real catalogue covers, characters and gallery scenes from the
> production API. The chat lines are written for the shot. Before uploading, click through a
> production build and confirm the screens still match.
> Only public-domain titles appear, and gallery like counts are illustrative.

---

## 2. App Store Connect

### App information

| Field | Value |
| --- | --- |
| Name (30) | `Chatty Books: Talk to Stories` |
| Subtitle (30) | `Classics, audiobooks & AI chat` |
| Primary category | Books |
| Secondary category | Entertainment |
| Content rights | "Does your app contain, show, or access third-party content?" → **Yes**. The catalogue is public-domain classics plus titles you hold rights to. TODO: confirm licensing for any in-copyright titles in the catalogue. |
| Copyright | `2026 Hayden Bulk Tech Labs Inc.` |
| Privacy Policy URL | `https://www.chattybooks.com/privacy` |
| Support URL | `https://www.chattybooks.com/help` |
| Marketing URL | `https://www.chattybooks.com` |
| License Agreement | Keep Apple's **Standard EULA** (the default). Our Terms (`/terms`) sit alongside it and reference it. |
| Version | `1.0.0` (set in `app.json`; build numbers auto-increment on EAS) |

### Promotional text (170, editable without a new build)

```
Ask Elizabeth Bennet what she really thinks of Mr. Darcy, and hear her answer in her own voice. Voice conversations are here: just tap the mic and talk.
```

### Keywords (100, no spaces, don't repeat words from name/subtitle)

```
novel,literature,reading,character,roleplay,voice,narration,austen,dracula,alice,fiction,gothic
```

### Description (4000)

```
Books have always talked to you. Now you can talk back.

Chatty Books is a reading app where the characters come to life. Read a classic, listen along with a narrator, and when a scene grabs you, open a conversation with the people inside the story. Ask Elizabeth Bennet what she really thinks of Mr. Darcy. Ask Van Helsing how to stop a vampire. Ask the Mad Hatter why a raven is like a writing desk. Every character knows their book, their world and their secrets.

TALK TO THE CHARACTERS
• Chat with the heroes, villains and side characters of every book
• Each character answers in their own personality and voice, grounded in their story
• Suggested questions help you dig deeper into plot, motives and relationships
• A literary guide for every book, for when you want context rather than character

VOICE CONVERSATIONS
• Tap the mic and just talk. No typing needed
• Characters reply out loud in a voice matched to who they are
• Tap any reply to hear it spoken again

EVERY BOOK, NARRATED
• Full audiobook narration for the catalogue, with a choice of narrators
• Narration stays in sync with your page, so you can switch between reading and listening
• Keeps playing in the background and remembers where you left off

A READER THAT FEELS LIKE PAPER
• Clean, typography-first reader set in Literata, a typeface made for long reading
• Paper, Sepia and Night themes, plus adjustable text size
• Your progress saves automatically and follows you to the web

A GALLERY OF SCENES
• Browse illustrations and short films of favorite scenes, created by the Chatty Books community
• Like, comment and discover new books through the scenes other readers loved

DISCOVER YOUR NEXT READ
• Timeless classics like Pride and Prejudice, Dracula, Alice's Adventures in Wonderland, Jane Eyre, Frankenstein and The Wonderful Wizard of Oz, plus new original fiction
• Save books to your library and pick up right where you stopped

FREE TO START
Create a free account to start reading and chatting. Upgrade to a monthly plan for more character conversations. Your plan and progress work on both mobile and web.

SUBSCRIPTIONS
Chatty Books offers optional auto-renewing monthly subscriptions (Explorer, Enthusiastic Reader and Story Master). Payment is charged to your Apple ID account at confirmation of purchase. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period, and your account is charged for renewal within 24 hours before the end of the current period. Manage or cancel your subscription in your App Store account settings.

Terms of Use: https://www.chattybooks.com/terms
Privacy Policy: https://www.chattybooks.com/privacy

Characters are AI-generated interpretations of fictional characters and can make mistakes.
```

### What's New in This Version (first release)

```
Welcome to Chatty Books! Read the classics, listen along with a narrator, and talk to the characters, out loud if you like.
```

### App Review information

| Field | Value |
| --- | --- |
| Sign-in required | **Yes**. Create it with `cd server && node scripts/createReviewerAccount.js --email appreview@chattybooks.com --password '<strong password>'` (verified email, free plan so reviewers can test buying, 50,000 tokens). Re-run before each submission to reset it. |
| User name | `TODO: appreview@chattybooks.com` |
| Password | `TODO` |
| Contact | TODO first/last name, phone, `support@chattybooks.com` |

Notes:

```
Chatty Books requires an account. Use the demo account above. It is on the free plan with 50,000 tokens, so every feature works and the subscription purchase flow can be tested.

How to test:
1. Discover tab → open "Pride and Prejudice" → Start reading. Tap the "Aa" icon for reading themes and text size.
2. On the book page tap "Listen" to start the audiobook. It keeps playing in the background; the mini player sits above the tab bar.
3. On the book page tap "Characters" → Elizabeth Bennet. The first chat shows a one-time notice explaining that messages are processed by third-party AI providers (Anthropic, OpenAI, ElevenLabs via Privateer); tap "Agree and continue". Then type a question, or tap the microphone to talk out loud; replies can be played back in the character's voice (speaker icon).
4. Gallery tab: community illustrations of book scenes. Open any scene to like or comment. Tap ••• (top right) to report the scene or block its author; tap ••• on any comment (or long-press it) to report the comment or block its author. Reported content disappears for the reporter immediately and is reviewed by our moderators within 24 hours. Blocked readers can be managed in Settings → Blocked readers.
5. In a character chat, long-press any character reply to report AI-generated content.
6. Settings (person icon, top right) → Tokens / Plan: monthly plans via In-App Purchase, Restore Purchases, and Manage Subscription.
7. Settings → Delete account permanently deletes the account and all of its data.

Microphone and speech recognition are only used while the user holds a voice conversation with a character. Character replies are generated by an AI model from the book's text; they are fictional interpretations.
```

### Age rating questionnaire (guidance)

Answer from what's actually in the catalogue and what the AI chat can produce. Suggested answers:

| Question | Answer |
| --- | --- |
| Parental controls / age assurance | None |
| Unrestricted web access | No |
| User-generated content | **Yes** (gallery comments, community scenes) |
| Messaging & chat with other users | No (chat is with AI characters, not people) |
| Advertising | No |
| Cartoon or fantasy violence | Infrequent / mild |
| Realistic violence | Infrequent / mild (Dracula, Frankenstein, thrillers) |
| Horror / fear themes | Infrequent / mild |
| Mature or suggestive themes | Infrequent / mild; romance titles are in the catalogue |
| Sexual content or nudity | None, **unless** any romance titles are explicit; if so, Infrequent |
| Profanity / crude humor | Infrequent / mild |
| Alcohol, tobacco, drugs | Infrequent / mild (period novels) |
| Gambling / contests | No |
| Medical / wellness | No |

Expect **13+**. If the romance catalogue or unfiltered AI chat can produce sexual content, answer
honestly and accept **16+**; under-rating is a common rejection.

### App Privacy ("nutrition label")

Tracking: **No**. The apps have no ads, analytics or tracking SDKs, and the server never forwards app activity to Meta (the website's Meta ad measurement skips requests from the apps; see `server/services/requestContext.js`).

| Data type | Collected | Linked to user | Purpose |
| --- | --- | --- | --- |
| Contact Info → Name | Yes | Yes | App Functionality |
| Contact Info → Email Address | Yes | Yes | App Functionality |
| User Content → Photos | Yes (optional profile picture) | Yes | App Functionality |
| User Content → Audio Data | Yes (voice messages; server transcription fallback when the device has no speech recognizer) | Yes | App Functionality |
| User Content → Other User Content | Yes (character chats, gallery comments) | Yes | App Functionality |
| Identifiers → User ID | Yes | Yes | App Functionality |
| Purchases → Purchase History | Yes | Yes | App Functionality |
| Usage Data → Product Interaction | Yes (reading progress, library, likes) | Yes | App Functionality |

### In-App Purchases: auto-renewable subscriptions

Subscription group: **`Chatty Books Plans`**. Order tiers highest first (Story Master, then Enthusiastic
Reader, then Explorer) so moving up counts as an upgrade. Prices come from the live `/subscriptions` endpoint. Product IDs must match each plan's `appleProductId` (`server/scripts/addStoreProductIds.js`); `sub_<tier>_monthly` is taken by the Privateer app.
The `enterprise` tier isn't returned there, so leave it out unless it's meant to be sold.

| Product ID | Reference name | Display name (30) | Description (45) | Price |
| --- | --- | --- | --- | --- |
| `chattybooks_premium_monthly` | Story Master Monthly | `Story Master` | `200,000 tokens a month for character chats` | $19.99 |
| `chattybooks_standard_monthly` | Enthusiastic Reader Monthly | `Enthusiastic Reader` | `100,000 tokens a month for character chats` | $9.99 |
| `chattybooks_basic_monthly` | Explorer Monthly | `Explorer` | `30,000 tokens a month for character chats` | $2.99 |

Each product also needs a review screenshot. Use a device screenshot of `app/subscription.tsx`.
Group display name (30): `Chatty Books Plans`.

---

## 3. Google Play Console

### Main store listing

| Field | Value |
| --- | --- |
| App name (30) | `Chatty Books: Talk to Stories` |
| Short description (80) | `Read classic books, listen along, and talk with the characters, even out loud.` |
| App category | Books & Reference |
| Tags | Books, Audiobooks, Education, Entertainment (pick from Play's list) |
| Email | `support@chattybooks.com` |
| Website | `https://www.chattybooks.com` |
| Privacy policy | `https://www.chattybooks.com/privacy` |

### Full description (4000)

Play doesn't allow emoji spam, ALL-CAPS runs or testimonials. This version complies:

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

Free to start
Create a free account to start reading and chatting. Upgrade to a monthly plan for more character conversations; subscriptions are billed through Google Play and can be cancelled anytime in the Play Store. Your plan and progress work on both mobile and web.

Characters are AI-generated interpretations of fictional characters and can make mistakes.
```

### Release notes (en-US, 500)

```
Welcome to Chatty Books! Read the classics, listen along with a narrator, and talk to the characters, out loud if you like.
```

### App content (Policy → App content)

| Section | Answer |
| --- | --- |
| Privacy policy | `https://www.chattybooks.com/privacy` |
| Ads | **No**, the app does not contain ads |
| App access | **All or some functionality is restricted** → add the reviewer login (same demo account as Apple) with the instructions from the Apple review notes |
| Content rating (IARC) | Category: **Reference, News, or Educational** (or Entertainment). Violence/horror: mild, text-based. Sexual content: per catalogue (see Apple notes). **Users can interact / exchange content: Yes** (gallery comments). **Digital purchases: Yes**. Shares location: No. Expect **Teen**. |
| Target audience | **13–15, 16–17, 18+**. Do **not** include under-13 (that pulls in the Families policy). If rated 16+ on iOS, choose 16–17 and 18+ only. "Could the app unintentionally appeal to children?" → No |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | None |
| Data safety | See below |
| Account deletion | In app: Settings → Delete account. Web URL: `https://www.chattybooks.com/#/delete-account` (deletes after sign-in; also offers email deletion) |
| Generative AI | Declare AI-generated content (character chat). In-app reporting: long-press a character reply → Report |

### Data safety form

- Does the app collect or share user data? **Yes**
- Is all data encrypted in transit? **Yes** (HTTPS only; release builds only allow cleartext to localhost)
- Can users request deletion? **Yes** (in app, or at `https://www.chattybooks.com/#/delete-account`)
- Shared with third parties? **No.** The AI provider, S3 and Apple/Google act as service providers, which Play doesn't count as "sharing"

| Category → type | Collected | Optional? | Purpose |
| --- | --- | --- | --- |
| Personal info → Name | Yes | Required | Account management, App functionality |
| Personal info → Email address | Yes | Required | Account management, App functionality |
| Personal info → User IDs | Yes | Required | Account management |
| Financial info → Purchase history | Yes | Optional | App functionality (subscription state) |
| Messages → Other in-app messages | Yes | Optional | App functionality (character chats, comments) |
| Photos and videos → Photos | Yes | Optional | App functionality (profile picture) |
| Audio → Voice or sound recordings | Yes | Optional | App functionality (voice chat). Mark "processed ephemerally" **only** if the server deletes audio after transcription (TODO: verify) |
| App activity → App interactions | Yes | Required | App functionality (reading progress, library, likes) |
| App activity → Other user-generated content | Yes | Optional | App functionality (gallery comments) |
| Device or other IDs → Device or other IDs | Yes | Required | App functionality, Fraud prevention/security. Play flagged version code 11 for leaving this out; the ID travels in Google Play Billing (purchase tokens) and Google sign-in, not in our own code |

### Subscriptions (Monetize → Subscriptions)

Base plan ID `monthly`, auto-renewing, 1 month. Product IDs must match the server (`scripts/addStoreProductIds.js`).

| Product ID | Name | Price | Description (Play, 80) |
| --- | --- | --- | --- |
| `sub_basic` | Explorer | $2.99 | `30,000 tokens every month for character conversations on mobile and web.` |
| `sub_standard` | Enthusiastic Reader | $9.99 | `100,000 tokens every month for character conversations on mobile and web.` |
| `sub_premium` | Story Master | $19.99 | `200,000 tokens every month for character conversations on mobile and web.` |

Benefits (up to 4, 40 chars each), the same on every tier:

```
Talk with characters in any book
Voice conversations with characters
Tokens refresh every month
Use your plan on mobile and web
```

---

## 4. Before you submit (rejection risks found in the code)

1. ~~Account deletion~~ **Done.** `DELETE /auth/account`, Settings → Delete account (mobile + web),
   and the public page `/#/delete-account`. Deploy the server before submitting.
2. ~~Report / block~~ **Done.** Reports on scenes, comments and AI replies; blocking readers. Reports
   email `ADMIN_EMAIL`; someone must act on them within 24 hours (`GET /admin/reports`,
   `POST /admin/reports/:id/resolve` with `remove` or `dismiss`). Tell Apple in the review notes
   that you moderate. There's no admin UI for this yet.
3. ~~AI consent~~ **Done.** A one-time notice before a reader's first chat. It's stored on the account
   (`aiConsentAt`), so it's asked once per person, not per message, device or reinstall.
4. ~~Privacy policy~~ **Done.** Rewritten to cover the AI providers, voice, store billing, Meta
   (website only), community content, and deletion. Deploy the web client so the live
   `/privacy` matches.
5. ~~Reviewer demo account~~ **Script ready.** Run `scripts/createReviewerAccount.js` (above) against
   production, then paste the credentials into both consoles.
6. ~~Export compliance~~ **Done.** `ios.config.usesNonExemptEncryption: false`.
7. ~~Version~~ **Done.** `1.0.0`.
8. **Naming consistency.** `dapp-store/config.yaml` still says "Talkingbook" and `talkingbook.app`. Update it
   to Chatty Books if the Seeker release should match.
