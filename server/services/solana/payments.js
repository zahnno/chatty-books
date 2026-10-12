/**
 * Crypto checkout for plan passes on the Seeker build — USDC, SOL or SKR.
 *
 * Flow (Solana Pay "transaction request" style, with the server building the
 * transaction so the app needs no Solana SDK):
 *   1. createPayment   quote the plan's USD price in the chosen currency, tag
 *                      it with a fresh `reference` key, and return an unsigned
 *                      transfer to the treasury carrying that reference.
 *   2. the app has the wallet sign and send it (Mobile Wallet Adapter).
 *   3. confirmPayment  find the landed transaction by its reference, check it
 *                      paid the treasury at least the quoted amount, and apply
 *                      the pass. The reconcile job does the same for payments
 *                      the app never reported back.
 *
 * Verification reads balance changes, not instruction layouts, so it holds up
 * when a wallet adds its own instructions (priority fees). Each transaction
 * signature can pay for one payment only (ProcessedBillingEvent tx:<sig>):
 * one transaction carrying two references can't buy two passes.
 */
const Subscription = require('../../models/subscriptionModel');
const SolanaPayment = require('../../models/solanaPaymentModel');
const ProcessedBillingEvent = require('../../models/processedBillingEventModel');
const { claimEvent } = require('../storeSubscriptionService');
const { checkPassPurchase, applyPassPayment } = require('./pass');
const {
  CLUSTER,
  rpc,
  normalizeAddress,
  normalizeSignature,
  randomAddress,
  serializeTransaction,
  solTransferInstruction,
  tokenTransferCheckedInstruction
} = require('./core');

const QUOTE_TTL_MS = 10 * 60 * 1000;
// Pending payments nobody reported back are given up on after this.
const ABANDON_AFTER_MS = 30 * 60 * 1000;
// Lamports kept back for the network fee when checking a SOL balance.
const FEE_RESERVE_LAMPORTS = 20000n;

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const MAINNET_MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  SKR: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'
};
const DEVNET_MINTS = {
  USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
};


// Currency → { mint?, priceId? } on this cluster. Stablecoins have no priceId
// (1 USDC = $1). Prices are always mainnet prices, even on devnet.
function currencies() {
  const mints = CLUSTER === 'devnet' ? DEVNET_MINTS : MAINNET_MINTS;
  const usdc = process.env.SOLANA_USDC_MINT || mints.USDC;
  const skr = process.env.SOLANA_SKR_MINT || mints.SKR;
  const out = { SOL: { priceId: WSOL_MINT } };
  if (usdc) out.USDC = { mint: usdc };
  if (skr) out.SKR = { mint: skr, priceId: MAINNET_MINTS.SKR };
  return out;
}

const treasury = () => normalizeAddress(process.env.SOLANA_TREASURY_ADDRESS || '');

function isEnabled() {
  return !!treasury();
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

// ── Chain lookups (cached) ───────────────────────────────────────────────────

const mintCache = new Map();
async function mintInfo(mint) {
  if (!mintCache.has(mint)) {
    const { value } = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
    const decimals = value?.data?.parsed?.info?.decimals;
    if (!value || typeof decimals !== 'number') throw new Error(`Mint ${mint} not found on ${CLUSTER}`);
    mintCache.set(mint, { programId: value.owner, decimals });
  }
  return mintCache.get(mint);
}

async function tokenAccounts(owner, mint) {
  const { value } = await rpc('getTokenAccountsByOwner', [
    owner,
    { mint },
    { encoding: 'jsonParsed', commitment: 'confirmed' }
  ]);
  return value.map((a) => ({
    address: a.pubkey,
    amount: BigInt(a.account.data.parsed.info.tokenAmount.amount)
  }));
}

// The treasury must already hold a token account for every mint it accepts,
// so buyers never pay rent to create one.
const treasuryAccountCache = new Map();
async function treasuryTokenAccount(mint) {
  if (!treasuryAccountCache.has(mint)) {
    const [account] = await tokenAccounts(treasury(), mint);
    if (!account) return null; // not cached: retry once the account exists
    treasuryAccountCache.set(mint, account.address);
  }
  return treasuryAccountCache.get(mint);
}

// Prices by mint. Jupiter first, CoinGecko for anything it didn't return;
// both rate-limit shared cloud IPs, so a fresh price is reused for a minute
// and the last good one for up to five if both sources fail.
const PRICE_FRESH_MS = 60 * 1000;
const PRICE_STALE_MS = 5 * 60 * 1000;
let priceCache = { at: 0, prices: {} };

async function jupiterPrices(ids) {
  const key = process.env.JUPITER_API_KEY;
  const url = process.env.SOLANA_PRICE_URL || (key ? 'https://api.jup.ag/price/v3' : 'https://lite-api.jup.ag/price/v3');
  const res = await fetch(`${url}?ids=${ids.join(',')}`, { headers: key ? { 'x-api-key': key } : {} });
  if (!res.ok) throw new Error(`Jupiter price HTTP ${res.status}`);
  const data = await res.json();
  return Object.fromEntries(ids.map((id) => [id, Number(data?.[id]?.usdPrice)]));
}

// Keyless CoinGecko takes one contract address per request.
async function coingeckoPrices(ids) {
  const key = process.env.COINGECKO_API_KEY;
  const out = {};
  for (const id of ids) {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${id}&vs_currencies=usd`,
      { headers: key ? { 'x-cg-demo-api-key': key } : {} }
    );
    if (!res.ok) throw new Error(`CoinGecko price HTTP ${res.status}`);
    out[id] = Number((await res.json())?.[id]?.usd);
  }
  return out;
}

async function usdPrices() {
  const age = Date.now() - priceCache.at;
  if (age < PRICE_FRESH_MS) return priceCache.prices;

  const ids = [...new Set(Object.values(currencies()).map((c) => c.priceId).filter(Boolean))];
  const prices = {};
  const take = (found) => {
    for (const [id, p] of Object.entries(found)) if (!prices[id] && Number.isFinite(p) && p > 0) prices[id] = p;
  };
  for (const source of [jupiterPrices, coingeckoPrices]) {
    const missing = ids.filter((id) => !prices[id]);
    if (!missing.length) break;
    try {
      take(await source(missing));
    } catch (err) {
      console.warn(`[solana] ${err.message}`);
    }
  }

  if (ids.every((id) => prices[id])) {
    priceCache = { at: Date.now(), prices };
    return prices;
  }
  if (age < PRICE_STALE_MS) return { ...priceCache.prices, ...prices };
  return prices;
}

/** Currencies checkout can take right now (treasury account present, price known). */
async function availableCurrencies() {
  if (!isEnabled()) return [];
  const all = currencies();
  const prices = await usdPrices().catch(() => ({}));
  const out = [];
  for (const [code, c] of Object.entries(all)) {
    if (c.priceId && !prices[c.priceId]) continue;
    if (c.mint && !(await treasuryTokenAccount(c.mint).catch(() => null))) continue;
    out.push(code);
  }
  // Stablecoin first.
  return ['USDC', 'SOL', 'SKR'].filter((code) => out.includes(code));
}

// ── Checkout ─────────────────────────────────────────────────────────────────

/** Base units as a readable amount, e.g. 2990000n (6 decimals) → "2.99". */
function formatUnits(value, decimals) {
  const whole = Number(value) / 10 ** decimals;
  return whole.toLocaleString('en-US', { maximumFractionDigits: whole >= 100 ? 0 : whole >= 1 ? 2 : 4 });
}

async function quote(currency, usdAmount) {
  const c = currencies()[currency];
  if (!c) throw httpError(400, `${currency} is not accepted`);
  const { decimals } = c.mint ? await mintInfo(c.mint) : { decimals: 9 };

  let usdPrice = 1;
  if (c.priceId) {
    usdPrice = (await usdPrices())[c.priceId];
    if (!usdPrice) throw httpError(503, `Can't get a ${currency} price right now. Try again or pay with USDC.`);
  }
  // Round up so the treasury never receives less than the plan price — less
  // a hair of float error, so $9.99 in USDC is 9990000 and not 9990001.
  const amount = BigInt(Math.ceil((usdAmount / usdPrice) * 10 ** decimals - 1e-6));
  return { mint: c.mint, decimals, usdPrice, amount };
}

/**
 * What each purchasable plan costs in each available currency right now:
 * { [planId]: { [currency]: { amount, decimals } } }. For display — the
 * binding quote is made at checkout.
 */
async function quotePlans() {
  const [codes, plans] = await Promise.all([
    availableCurrencies(),
    Subscription.find({ isActive: true, price: { $gt: 0 }, tier: { $ne: 'free' } })
  ]);
  const out = {};
  for (const plan of plans) {
    out[plan._id] = {};
    for (const code of codes) {
      const q = await quote(code, plan.price).catch(() => null);
      if (q) out[plan._id][code] = { amount: q.amount.toString(), decimals: q.decimals };
    }
  }
  return out;
}

/**
 * Start a checkout. Returns { payment, transaction } — transaction is the
 * base64 unsigned transfer for the wallet to sign and send.
 */
async function createPayment({ user, planId, currency, payer }) {
  if (!isEnabled()) throw httpError(503, 'Crypto payments are not available right now');
  const payerAddress = normalizeAddress(payer);
  if (!payerAddress) throw httpError(400, 'A valid payer wallet is required');

  const plan = await Subscription.findById(planId).catch(() => null);
  const refusal = await checkPassPurchase(user, plan);
  if (refusal) throw httpError(refusal.status, refusal.message);

  const q = await quote(currency, plan.price);
  const payment = await SolanaPayment.create({
    userId: user._id,
    plan: plan._id,
    currency,
    amount: q.amount.toString(),
    decimals: q.decimals,
    mint: q.mint,
    usdAmount: plan.price,
    usdPrice: q.usdPrice,
    payer: payerAddress,
    recipient: treasury(),
    reference: randomAddress(),
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS)
  });
  const transaction = await buildTransaction(payment);
  return { payment, transaction };
}

/**
 * The unsigned transfer for a pending payment, with a fresh blockhash (they
 * expire after ~1 minute, so a retry needs a new one). Base64.
 */
async function buildTransaction(payment) {
  if (payment.status !== 'pending') throw httpError(409, 'This payment is already settled');
  if (payment.expiresAt < new Date()) throw httpError(410, 'This price quote expired. Start the purchase again.');

  const amount = BigInt(payment.amount);
  const { value: { blockhash } } = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  let instruction;

  if (payment.currency === 'SOL') {
    const { value: balance } = await rpc('getBalance', [payment.payer, { commitment: 'confirmed' }]);
    if (BigInt(balance) < amount + FEE_RESERVE_LAMPORTS) {
      throw httpError(
        422,
        `This plan costs ${formatUnits(amount, 9)} SOL plus a small network fee, and this wallet has ` +
          `${formatUnits(BigInt(balance), 9)} SOL. Add SOL or choose another currency.`
      );
    }
    instruction = solTransferInstruction({
      from: payment.payer,
      to: payment.recipient,
      lamports: amount,
      extraKeys: [payment.reference]
    });
  } else {
    const { programId, decimals } = await mintInfo(payment.mint);
    const destination = await treasuryTokenAccount(payment.mint);
    if (!destination) throw httpError(503, `${payment.currency} payments are not available right now`);
    const accounts = (await tokenAccounts(payment.payer, payment.mint)).sort((a, b) => (b.amount > a.amount ? 1 : -1));
    const source = accounts.find((a) => a.amount >= amount);
    if (!source) {
      const held = accounts.reduce((t, a) => t + a.amount, 0n);
      throw httpError(
        422,
        `This plan costs ${formatUnits(amount, decimals)} ${payment.currency}, and this wallet has ` +
          `${formatUnits(held, decimals)} ${payment.currency}. Add ${payment.currency} or choose another currency.`
      );
    }
    instruction = tokenTransferCheckedInstruction({
      programId,
      source: source.address,
      mint: payment.mint,
      destination,
      owner: payment.payer,
      amount,
      decimals,
      extraKeys: [payment.reference]
    });
  }

  return serializeTransaction({
    feePayer: payment.payer,
    recentBlockhash: blockhash,
    instructions: [instruction]
  }).toString('base64');
}

// ── Confirmation ─────────────────────────────────────────────────────────────

/** Whether landed transaction `signature` pays `payment` in full. */
async function transactionPays(payment, signature) {
  const tx = await rpc('getTransaction', [
    signature,
    { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 1 }
  ]);
  if (!tx || !tx.meta || tx.meta.err) return false;

  // Static keys, then address-table keys in the order balances index them.
  const keys = [
    ...tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey)),
    ...(tx.meta.loadedAddresses?.writable || []),
    ...(tx.meta.loadedAddresses?.readonly || [])
  ];
  if (!keys.includes(payment.reference)) return false;

  const amount = BigInt(payment.amount);
  if (payment.currency === 'SOL') {
    const i = keys.indexOf(payment.recipient);
    if (i < 0) return false;
    return BigInt(tx.meta.postBalances[i]) - BigInt(tx.meta.preBalances[i]) >= amount;
  }

  const sum = (balances) => (balances || [])
    .filter((b) => b.mint === payment.mint && b.owner === payment.recipient)
    .reduce((total, b) => total + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances) >= amount;
}

/**
 * Look for the transaction that pays `payment` and, if found, apply the pass.
 * `hintSignature` (from the app) is checked first; the reference lookup
 * covers the case where the app never got that far.
 * @returns {Promise<{status: 'pending'|'confirmed'|'expired', kind?: string}>}
 */
async function confirmPayment(payment, hintSignature) {
  if (payment.status === 'confirmed') return { status: 'confirmed' };

  const candidates = [];
  const hint = normalizeSignature(hintSignature);
  if (hint) candidates.push(hint);
  const found = await rpc('getSignaturesForAddress', [payment.reference, { limit: 20, commitment: 'confirmed' }]);
  for (const s of found) {
    if (!s.err && !candidates.includes(s.signature)) candidates.push(s.signature);
  }

  for (const signature of candidates) {
    if (!(await transactionPays(payment, signature))) continue;

    const eventId = `tx:${signature}`;
    if (!(await claimEvent('solana', eventId, 'payment'))) continue; // paid for another payment

    const updated = await SolanaPayment.findOneAndUpdate(
      { _id: payment._id, status: { $ne: 'confirmed' } },
      { $set: { status: 'confirmed', signature, confirmedAt: new Date() } },
      { new: true }
    );
    if (!updated) {
      await ProcessedBillingEvent.deleteOne({ provider: 'solana', eventId });
      return { status: 'confirmed' };
    }
    try {
      const { kind } = await applyPassPayment(updated);
      return { status: 'confirmed', kind };
    } catch (err) {
      // Put it back so a retry (the app or the reconcile job) applies it.
      await SolanaPayment.updateOne(
        { _id: payment._id },
        { $set: { status: payment.status }, $unset: { signature: 1, confirmedAt: 1 } }
      );
      await ProcessedBillingEvent.deleteOne({ provider: 'solana', eventId });
      throw err;
    }
  }
  // A concurrent confirm may have settled it meanwhile.
  const current = await SolanaPayment.findById(payment._id, 'status');
  return { status: current?.status || payment.status };
}

/**
 * Settle payments the app didn't report back (it was closed, lost signal…)
 * and give up on abandoned ones. Runs on a schedule.
 */
async function reconcilePendingPayments() {
  const pending = await SolanaPayment.find({
    status: 'pending',
    createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
  for (const payment of pending) {
    try {
      const { status } = await confirmPayment(payment);
      if (status === 'pending' && payment.expiresAt < new Date(Date.now() - ABANDON_AFTER_MS)) {
        await SolanaPayment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'expired' } });
      }
    } catch (err) {
      console.error(`[solana] Reconcile failed for payment ${payment._id}:`, err.message);
    }
  }
}

module.exports = {
  // Shared with publishing.js
  currencies,
  treasury,
  mintInfo,
  tokenAccounts,
  treasuryTokenAccount,
  usdPrices,
  quote,
  formatUnits,
  httpError,
  isEnabled,
  availableCurrencies,
  quotePlans,
  createPayment,
  buildTransaction,
  confirmPayment,
  reconcilePendingPayments
};
