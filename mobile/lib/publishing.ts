// Community publishing on Solana (Seeker build): submit a book, mint it as a
// Metaplex Core asset once it's approved, and claim what readers' chats with
// its characters earn. Server side: server/routes/publishing.js.
import { authFetch } from '@talkingbook/shared';
import { signServerTransaction } from './solana';

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
  const result = await signServerTransaction<{ transaction?: string; minted?: boolean }>(() =>
    authFetch({ path: `/api/publishing/books/${bookId}/mint`, method: 'POST', body: {} }),
  );
  if (result.minted) return 'minted';

  const submitted = await authFetch({
    path: `/api/publishing/books/${bookId}/mint/submit`,
    method: 'POST',
    body: { transaction: result.signed },
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
