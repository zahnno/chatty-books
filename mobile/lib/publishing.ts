// Community publishing on Solana (Seeker build): submit a book, mint it as a
// Metaplex Core asset once it's approved, and claim what readers' chats with
// its characters earn. Server side: server/routes/publishing.js.
import { authFetch } from '@talkingbook/shared';
import { signTransaction } from './solana';

export type PayoutCurrency = 'USDC' | 'SKR';

export type PublishingSettings = {
  revenueShareBps: number;
  publishFee: { currency: 'SKR'; amount: string; decimals: number; usd: number } | null;
  minClaimUsd: number;
  maxClaimUsd: number;
  payoutCurrencies: PayoutCurrency[];
};

export type PublishedBook = {
  id: string;
  title: string;
  author?: string;
  image_url?: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'minted';
  reviewNote?: string;
  asset?: string;
  holder?: string;
  mintedAt?: string;
  revenueShareBps: number;
  interactions: number;
  earnedUsd: number;
  claimedUsd: number;
  availableUsd: number;
  characters: { id: string; name: string; image_url?: string; interactions: number; earnedUsd: number }[];
  canEdit?: boolean;
};

export type ClaimResult = {
  status: 'confirmed' | 'sending';
  signature: string;
  currency: PayoutCurrency;
  amount: string;
  decimals: number;
  usd: number;
};

export const fetchPublishingSettings = (): Promise<PublishingSettings> =>
  authFetch({ path: '/api/publishing/settings', method: 'GET', requireAuth: false });

export const fetchMyPublishedBooks = async (): Promise<PublishedBook[]> =>
  (await authFetch({ path: '/api/publishing/books', method: 'GET' })).books;

/** Upload a PDF, EPUB or TXT for review. Takes a minute: the server reads the book and writes its details. */
export async function submitBook(file: { uri: string; name: string; mimeType: string }): Promise<PublishedBook> {
  const form = new FormData();
  form.append('bookFile', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  form.append('rightsConfirmed', 'true');
  return (await authFetch({ path: '/api/publishing/books', method: 'POST', body: form })).book;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mint an approved book: the wallet signs the server's transaction (fee in SKR
 * plus the Core asset), the server sends it. Resolves 'minted', or 'pending'
 * if it hasn't shown up on-chain yet.
 */
export async function mintBook(bookId: string): Promise<'minted' | 'pending'> {
  // Built before the wallet opens: a refusal (not enough SKR, not approved)
  // comes back as a normal error the screen can show.
  const built: { transaction?: string; minted?: boolean } = await authFetch({
    path: `/api/publishing/books/${bookId}/mint`,
    method: 'POST',
    body: {},
  });
  if (built.minted || !built.transaction) return 'minted';
  const signed = await signTransaction(built.transaction);

  const submitted = await authFetch({
    path: `/api/publishing/books/${bookId}/mint/submit`,
    method: 'POST',
    body: { transaction: signed },
  });
  if (submitted.book) return 'minted';
  // Landing late: checking again finishes it once the asset is visible.
  for (let i = 0; i < 6; i++) {
    await sleep(5000);
    const check = await authFetch({ path: `/api/publishing/books/${bookId}/mint/submit`, method: 'POST', body: {} }).catch(
      () => null,
    );
    if (check?.book) return 'minted';
  }
  return 'pending';
}

export const claimEarnings = (bookId: string, currency: PayoutCurrency): Promise<ClaimResult> =>
  authFetch({ path: `/api/publishing/books/${bookId}/claim`, method: 'POST', body: { currency } });

// Admin review
export const fetchSubmissions = async (): Promise<PublishedBook[]> =>
  (await authFetch({ path: '/api/publishing/admin/submissions', method: 'GET' })).books;

export const reviewBook = (bookId: string, approve: boolean, note?: string) =>
  authFetch({ path: `/api/publishing/admin/books/${bookId}/review`, method: 'POST', body: { approve, note } });

export const formatUsd = (usd: number) =>
  `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: usd > 0 && usd < 1 ? 3 : 2 })}`;

export const explorerUrl = (asset: string) => `https://core.metaplex.com/explorer/${asset}`;

// ── Editing (publisher before minting, NFT holder after) ─────────────────────

export type EditableBook = {
  id: string;
  title: string;
  author?: string;
  description?: string;
  tagline?: string;
  categories?: string[];
  image_url?: string;
  status: PublishedBook['status'];
  authorLocked: boolean;
  live: boolean;
};

export type EditableCharacter = {
  id: string;
  firstName: string;
  lastName?: string;
  intro?: string;
  description?: string;
  appearance?: string;
  events?: string;
  gender?: string;
  image_url?: string;
  personalityTraits?: string[];
  strengths?: string[];
  weaknesses?: string[];
  goals?: string[];
};

export type CharacterInput = Partial<Omit<EditableCharacter, 'id' | 'image_url'>>;

export const fetchEditableBook = (bookId: string): Promise<{ book: EditableBook; characters: EditableCharacter[] }> =>
  authFetch({ path: `/api/publishing/books/${bookId}/edit`, method: 'GET' });

export const saveBook = (bookId: string, fields: Partial<EditableBook>) =>
  authFetch({ path: `/api/publishing/books/${bookId}`, method: 'PATCH', body: fields });

const imageForm = (image: { uri: string; mimeType?: string | null }) => {
  const form = new FormData();
  const type = image.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  form.append('image', { uri: image.uri, name: type === 'image/png' ? 'image.png' : 'image.jpg', type } as any);
  return form;
};

export const saveCover = (bookId: string, image: { uri: string; mimeType?: string | null }) =>
  authFetch({ path: `/api/publishing/books/${bookId}/cover`, method: 'POST', body: imageForm(image) });

export const createCharacter = async (bookId: string, fields: CharacterInput): Promise<EditableCharacter> =>
  (await authFetch({ path: `/api/publishing/books/${bookId}/characters`, method: 'POST', body: fields })).character;

export const saveCharacter = async (bookId: string, characterId: string, fields: CharacterInput): Promise<EditableCharacter> =>
  (await authFetch({ path: `/api/publishing/books/${bookId}/characters/${characterId}`, method: 'PATCH', body: fields })).character;

export const deleteCharacter = (bookId: string, characterId: string) =>
  authFetch({ path: `/api/publishing/books/${bookId}/characters/${characterId}`, method: 'DELETE' });

export const savePortrait = async (bookId: string, characterId: string, image: { uri: string; mimeType?: string | null }) =>
  (await authFetch({ path: `/api/publishing/books/${bookId}/characters/${characterId}/portrait`, method: 'POST', body: imageForm(image) })).character as EditableCharacter;

export const paintPortrait = async (bookId: string, characterId: string) =>
  (await authFetch({ path: `/api/publishing/books/${bookId}/characters/${characterId}/portrait/generate`, method: 'POST', body: {} })).character as EditableCharacter;
