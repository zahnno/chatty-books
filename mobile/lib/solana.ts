// Solana on the Seeker build, over Mobile Wallet Adapter (the wallet app on
// the phone — Seed Vault on Seeker — does the signing):
//   - Sign In With Solana: log in with a wallet, or link one to this account
//   - the Seeker Genesis Token bonus
//   - paying for a 30-day plan pass in USDC, SOL or SKR
//
// The server builds every transaction and verifies every signature
// (server/routes/solana.js), so the app only moves base64 between the wallet
// and the API and needs no Solana SDK.
import { authFetch, setToken } from '@talkingbook/shared';
import { IS_SEEKER } from './billingMode';

export type Currency = 'USDC' | 'SOL' | 'SKR';
// `chain` is a wallet-standard id such as 'solana:mainnet'.
export type SolanaConfig = { chain: `${string}:${string}`; currencies: Currency[]; seekerBonusTokens: number };
export type Quotes = Record<string, Partial<Record<Currency, { amount: string; decimals: number }>>>;
export type WalletStatus = {
  walletAddress: string | null;
  seekerBonus: { claimedAt: string; tokens: number } | null;
  canUnlink: boolean;
};
export type BonusResult = { granted: true; tokens: number };

// What the wallet shows the user when we connect. `icon` is relative to `uri`,
// and the sign-in domain the server checks is `uri`'s host.
const IDENTITY = { name: 'Chatty Books', uri: 'https://www.chattybooks.com', icon: 'book-logo-light.png' };

// Lazy so store builds never load the native module.
type Mwa = typeof import('@solana-mobile/mobile-wallet-adapter-protocol');
let _mwa: Mwa | null = null;
function mwa(): Mwa {
  if (!IS_SEEKER) throw new Error('Solana wallets are not available in this build');
  if (!_mwa) _mwa = require('@solana-mobile/mobile-wallet-adapter-protocol');
  return _mwa!;
}

// ── base64 (Hermes has atob/btoa) ────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ── API ──────────────────────────────────────────────────────────────────────

export const fetchSolanaConfig = (): Promise<SolanaConfig> =>
  authFetch({ path: '/api/solana/config', method: 'GET', requireAuth: false });

export const fetchQuotes = async (): Promise<Quotes> =>
  (await authFetch({ path: '/api/solana/quotes', method: 'GET', requireAuth: false })).quotes;

export const fetchWalletStatus = (): Promise<WalletStatus> =>
  authFetch({ path: '/api/solana/wallet', method: 'GET' });

export const unlinkWallet = (): Promise<WalletStatus> =>
  authFetch({ path: '/api/solana/wallet', method: 'DELETE' });

export type BonusEligibility = {
  eligible: boolean;
  tokens: number;
  reason?: 'no_wallet' | 'already_claimed' | 'no_sgt' | 'sgt_used';
};

/** Whether the linked wallet's Seeker Genesis Token can claim the bonus (doesn't claim). */
export const checkSeekerBonus = (): Promise<BonusEligibility> =>
  authFetch({ path: '/api/solana/seeker-bonus', method: 'GET' });

/** Throws with `.reason` ('no_sgt', 'sgt_used', …) when there's nothing to grant. */
export const claimSeekerBonus = (): Promise<BonusResult> =>
  authFetch({ path: '/api/solana/seeker-bonus', method: 'POST', body: {} });

/** "12.5 SOL" from base units. */
export function formatAmount(amount: string, decimals: number, currency: Currency): string {
  const whole = Number(amount) / 10 ** decimals;
  const digits = currency === 'USDC' ? 2 : whole >= 100 ? 0 : whole >= 1 ? 2 : 4;
  return `${whole.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: currency === 'USDC' ? 2 : 0 })} ${currency}`;
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

// ── Sign In With Solana ──────────────────────────────────────────────────────

type SignInProof = { address: string; signedMessage: string; signature: string };

async function signInProof(): Promise<SignInProof> {
  const [{ chain }, challenge] = await Promise.all([
    fetchSolanaConfig(),
    authFetch({ path: '/api/solana/auth/challenge', method: 'POST', body: {}, requireAuth: false }),
  ]);
  return mwa().transact(async (wallet) => {
    const auth = await wallet.authorize({ chain, identity: IDENTITY, sign_in_payload: challenge });
    const result = auth.sign_in_result;
    if (result) {
      return { address: result.address, signedMessage: result.signed_message, signature: result.signature };
    }

    // Wallet without sign-in support: sign the same message ourselves.
    const address = auth.accounts[0].address;
    const { message } = await authFetch({
      path: '/api/solana/auth/challenge',
      method: 'POST',
      body: { address },
      requireAuth: false,
    });
    const payload = bytesToBase64(new TextEncoder().encode(message));
    const { signed_payloads } = await wallet.signMessages({ addresses: [address], payloads: [payload] });
    // Some wallets return the bare signature, others message + signature.
    const signed = base64ToBytes(signed_payloads[0]);
    return { address, signedMessage: payload, signature: bytesToBase64(signed.slice(signed.length - 64)) };
  });
}

/** Log in with the wallet (creating an account for a new wallet). */
export async function signInWithWallet(): Promise<{ created: boolean }> {
  const proof = await signInProof();
  const data = await authFetch({ path: '/api/solana/auth/verify', method: 'POST', body: proof, requireAuth: false });
  await setToken(data.token);
  return { created: !!data.created };
}

/** Prove a wallet and link it to the signed-in account. */
export async function linkWallet(): Promise<WalletStatus> {
  const proof = await signInProof();
  return authFetch({ path: '/api/solana/wallet/link', method: 'POST', body: proof });
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export type PaymentResult = { status: 'confirmed' | 'pending' | 'expired'; kind?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Buy a 30-day pass for `planId` in `currency`. Resolves 'confirmed' once the
 * server has seen the payment on chain, or 'pending' if it hasn't landed
 * within ~45s — the server's reconcile job still applies it when it does.
 */
export async function payForPlan(planId: string, currency: Currency): Promise<PaymentResult> {
  const { chain } = await fetchSolanaConfig();
  const { paymentId, signature } = await mwa().transact(async (wallet) => {
    const auth = await wallet.authorize({ chain, identity: IDENTITY });
    const payer = auth.accounts[0].address;
    // Built while the wallet session is open so its blockhash is fresh.
    const payment = await authFetch({
      path: '/api/solana/payments',
      method: 'POST',
      body: { planId, currency, payer },
    });
    const { signatures } = await wallet.signAndSendTransactions({ payloads: [payment.transaction] });
    return { paymentId: payment.paymentId as string, signature: signatures[0] };
  });

  for (let i = 0; i < 20; i++) {
    await sleep(i < 6 ? 1500 : 3000);
    try {
      const result: PaymentResult = await authFetch({
        path: `/api/solana/payments/${paymentId}/confirm`,
        method: 'POST',
        body: { signature },
      });
      if (result.status !== 'pending') return result;
    } catch {
      // Transient — keep polling.
    }
  }
  return { status: 'pending' };
}

/**
 * Have the wallet sign — not send — a transaction the server builds while the
 * wallet session is open (so its blockhash is fresh). `build` returns the
 * server's response; when it carries a `transaction`, the result adds `signed`.
 */
export async function signServerTransaction<T extends { transaction?: string }>(
  build: () => Promise<T>,
): Promise<T & { signed?: string }> {
  const { chain } = await fetchSolanaConfig();
  return mwa().transact(async (wallet) => {
    await wallet.authorize({ chain, identity: IDENTITY });
    const response = await build();
    if (!response.transaction) return response;
    const { signed_payloads } = await wallet.signTransactions({ payloads: [response.transaction] });
    return { ...response, signed: signed_payloads[0] };
  });
}

/** True when the user backed out in the wallet (not an error to report). */
export function isUserDeclined(err: any): boolean {
  // Protocol codes: -1 authorization declined, -3 signing declined. The
  // session closes when the user leaves the wallet without answering.
  // (-4, not submitted, is a real failure and is reported.)
  const code = err?.code;
  return (
    code === -1 ||
    code === -3 ||
    code === 'ERROR_AUTHORIZATION_FAILED' ||
    code === 'ERROR_NOT_SIGNED' ||
    code === 'ERROR_SESSION_CLOSED' ||
    code === 'ERROR_ASSOCIATION_CANCELLED'
  );
}

/** A message for a wallet error (no wallet app installed, etc.). */
export function walletErrorMessage(err: any): string {
  if (err?.code === 'ERROR_WALLET_NOT_FOUND') return 'No Solana wallet app was found on this phone.';
  return err?.message || 'Something went wrong with the wallet.';
}
