/**
 * Community publishing on Solana (Seeker build).
 *
 *   1. submit   A user with a linked wallet uploads a book. It's private
 *               (pending_review) until an admin approves it.
 *   2. mint     The publisher signs one transaction that pays the publishing
 *               fee in SKR to the treasury and creates a Metaplex Core asset
 *               for the book, owned by their wallet. The asset is a fresh
 *               keypair the server generates and co-signs; the server sends
 *               the transaction and checks the asset and fee on-chain. The
 *               book then goes public.
 *   3. earn     Every chat or voice charge on the book's characters credits
 *               the book `revenueShareBps` of the tokens' face value.
 *   4. claim    Whoever holds the asset (it can be sold or transferred) claims
 *               the unclaimed earnings in USDC or SKR, sent from the payout
 *               wallet (SOLANA_PAYOUT_SECRET_KEY).
 *
 * Amounts are integer micro-USD (1e-6 USD), which is also USDC's base unit.
 */
const Book = require('../../models/bookModel');
const Character = require('../../models/characterModel');
const PublisherPayout = require('../../models/publisherPayoutModel');
const CostEstimateService = require('../costEstimateService');
const payments = require('./payments');
const {
  rpc,
  normalizeAddress,
  serializeTransaction,
  tokenTransferCheckedInstruction,
  generateKeypair,
  keypairFromSecret,
  base58Encode,
  parseTransaction,
  signTransaction,
  transactionSignature,
  verifyEd25519,
  createCoreAssetInstruction,
  coreAssetOwner,
  createAssociatedTokenAccountIdempotentInstruction
} = require('./core');

const { httpError, formatUnits } = payments;

// One token's face value: tokens are priced at TOKEN_TO_USD_RATE per dollar.
const MICRO_USD_PER_TOKEN = 1e6 / CostEstimateService.TOKEN_TO_USD_RATE;

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name] !== '' ? value : fallback;
};
const shareBps = () => envNumber('PUBLISHER_SHARE_BPS', 2000);
const publishFeeUsd = () => envNumber('PUBLISH_FEE_USD', 2);
const minClaimMicroUsd = () => Math.round(envNumber('PUBLISHER_MIN_CLAIM_USD', 0.01) * 1e6);
const maxClaimMicroUsd = () => Math.round(envNumber('PUBLISHER_MAX_CLAIM_USD', 25) * 1e6);
const MAX_PENDING_SUBMISSIONS = 3;

let payoutKeypair;
function payoutWallet() {
  if (payoutKeypair === undefined) {
    try {
      payoutKeypair = process.env.SOLANA_PAYOUT_SECRET_KEY ? keypairFromSecret(process.env.SOLANA_PAYOUT_SECRET_KEY) : null;
    } catch (err) {
      console.error('[publishing] SOLANA_PAYOUT_SECRET_KEY is invalid:', err.message);
      payoutKeypair = null;
    }
  }
  return payoutKeypair;
}

// ── Earnings ─────────────────────────────────────────────────────────────────

/**
 * Credit a published book (and the character) for `tokens` a reader just
 * spent on it. Never throws: earnings must not break a chat.
 */
async function recordInteraction({ bookId, characterId, tokens }) {
  try {
    if (!tokens || tokens <= 0) return;
    const book = await Book.findById(bookId, 'publishing.status publishing.revenueShareBps').lean();
    if (book?.publishing?.status !== 'minted') return;
    const microUsd = Math.floor((tokens * MICRO_USD_PER_TOKEN * (book.publishing.revenueShareBps ?? shareBps())) / 10000);
    await Promise.all([
      Book.updateOne({ _id: bookId }, {
        $inc: { 'publishing.interactions': 1, 'publishing.earnedMicroUsd': microUsd }
      }),
      characterId && Character.updateOne({ _id: characterId, bookId }, {
        $inc: { 'earnings.interactions': 1, 'earnings.microUsd': microUsd }
      })
    ]);
  } catch (err) {
    console.error(`[publishing] Could not record earnings for book ${bookId}:`, err.message);
  }
}

// ── Submission and review ────────────────────────────────────────────────────

async function checkCanSubmit(user) {
  if (!user.walletAddress) throw httpError(400, 'Link a Solana wallet before publishing a book');
  const pending = await Book.countDocuments({ 'publishing.publisher': user._id, 'publishing.status': 'pending_review' });
  if (pending >= MAX_PENDING_SUBMISSIONS) {
    throw httpError(429, `You have ${pending} books waiting for review. Publish more once they're reviewed.`);
  }
}

async function review(bookId, { approve, note }) {
  const book = await Book.findOneAndUpdate(
    { _id: bookId, 'publishing.status': 'pending_review' },
    {
      $set: {
        'publishing.status': approve ? 'approved' : 'rejected',
        'publishing.reviewNote': note || undefined,
        'publishing.reviewedAt': new Date()
      }
    },
    { new: true }
  );
  if (!book) throw httpError(404, 'No submission waiting for review');
  return book;
}

// ── Minting ──────────────────────────────────────────────────────────────────

const SKR = () => payments.currencies().SKR;

/** The publishing fee in SKR base units, or null if there's none to pay. */
async function publishFee() {
  const usd = publishFeeUsd();
  const skr = SKR();
  if (!(usd > 0) || !skr?.mint || !payments.isEnabled()) return null;
  if (!(await payments.treasuryTokenAccount(skr.mint).catch(() => null))) return null;
  const q = await payments.quote('SKR', usd);
  return { currency: 'SKR', usd, mint: q.mint, amount: q.amount, decimals: q.decimals };
}

async function loadForMint(bookId, user) {
  const book = await Book.findById(bookId).select('+publishing.pendingAssetSecret');
  if (!book?.publishing?.status) throw httpError(404, 'Book not found');
  if (String(book.publishing.publisher) !== String(user._id)) throw httpError(403, 'Only the publisher can mint this book');
  return book;
}

/**
 * The publisher's mint transaction (base64, co-signed by the asset keypair),
 * for the wallet to sign. `metadataUri` is where the asset's JSON is served.
 */
async function buildMintTransaction(bookId, user, metadataUri) {
  const book = await loadForMint(bookId, user);
  if (book.publishing.status === 'minted') throw httpError(409, 'This book is already published on Solana');
  if (await finalizeMint(book)) return { minted: true, book };
  if (book.publishing.status !== 'approved') throw httpError(409, 'This book is waiting for review');
  const wallet = normalizeAddress(user.walletAddress || '');
  if (!wallet) throw httpError(400, 'Link a Solana wallet before publishing a book');

  const instructions = [];
  const fee = await publishFee();
  if (fee) {
    const { programId } = await payments.mintInfo(fee.mint);
    const accounts = (await payments.tokenAccounts(wallet, fee.mint)).sort((a, b) => (b.amount > a.amount ? 1 : -1));
    const source = accounts.find((a) => a.amount >= fee.amount);
    if (!source) {
      const held = accounts.reduce((t, a) => t + a.amount, 0n);
      throw httpError(422, `Publishing costs ${formatUnits(fee.amount, fee.decimals)} SKR (about $${fee.usd}), and this ` +
        `wallet has ${formatUnits(held, fee.decimals)} SKR.`);
    }
    instructions.push(tokenTransferCheckedInstruction({
      programId,
      source: source.address,
      mint: fee.mint,
      destination: await payments.treasuryTokenAccount(fee.mint),
      owner: wallet,
      amount: fee.amount,
      decimals: fee.decimals
    }));
  }

  const asset = generateKeypair();
  instructions.push(createCoreAssetInstruction({
    asset: asset.publicKey,
    payer: wallet,
    owner: wallet,
    updateAuthority: wallet,
    name: book.title.slice(0, 64),
    uri: metadataUri
  }));
  const { value: { blockhash } } = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const tx = signTransaction(serializeTransaction({ feePayer: wallet, recentBlockhash: blockhash, instructions }), asset);

  book.publishing.pendingAsset = asset.publicKey;
  book.publishing.pendingAssetSecret = base58Encode(asset.secretKey);
  book.publishing.mintSignature = undefined;
  book.publishing.holder = wallet;
  await book.save();

  return {
    transaction: tx.toString('base64'),
    asset: asset.publicKey,
    fee: fee && { currency: fee.currency, amount: fee.amount.toString(), decimals: fee.decimals, usd: fee.usd }
  };
}

async function waitForConfirmation(signature, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value: [status] } = await rpc('getSignatureStatuses', [[signature]]);
    if (status?.err) return { ok: false, err: status.err };
    if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus)) return { ok: true };
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return { ok: false, timeout: true };
}

/** Whether landed transaction `signature` paid the treasury at least `amount` of `mint`. */
async function paidTreasury(signature, mint, amount) {
  const tx = await rpc('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  if (!tx?.meta || tx.meta.err) return false;
  const sum = (balances) => (balances || [])
    .filter((b) => b.mint === mint && b.owner === payments.treasury())
    .reduce((total, b) => total + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances) >= BigInt(amount);
}

/**
 * If the pending asset exists on-chain, owned by the publisher, mark the book
 * minted and public. Returns whether it did.
 */
async function finalizeMint(book) {
  const { pendingAsset, mintSignature } = book.publishing;
  if (!pendingAsset || book.publishing.status !== 'approved') return false;
  const owner = await coreAssetOwner(pendingAsset);
  if (!owner) return false;

  const fee = await publishFee();
  if (fee && !(mintSignature && (await paidTreasury(mintSignature, fee.mint, fee.amount)))) {
    console.warn(`[publishing] Asset ${pendingAsset} for book ${book._id} exists but the fee wasn't found`);
    return false;
  }

  const updated = await Book.findOneAndUpdate(
    { _id: book._id, 'publishing.status': 'approved', 'publishing.pendingAsset': pendingAsset },
    {
      $set: {
        is_public: true,
        'publishing.status': 'minted',
        'publishing.asset': pendingAsset,
        'publishing.mintedAt': new Date(),
        'publishing.holder': owner,
        'publishing.revenueShareBps': shareBps()
      },
      $unset: { 'publishing.pendingAsset': 1, 'publishing.pendingAssetSecret': 1 }
    },
    { new: true }
  );
  if (updated) book.set(updated.toObject());
  return !!updated;
}

/**
 * Send the wallet-signed mint transaction and finish publishing. Returns the
 * minted book, or null if it hasn't shown up on-chain yet. Re-applies
 * the asset's signature in case the wallet changed the message (e.g. added a
 * priority fee); what landed is checked on-chain, not trusted.
 */
async function submitMintTransaction(bookId, user, signedBase64) {
  const book = await loadForMint(bookId, user);
  if (book.publishing.status === 'minted') return book;
  if (await finalizeMint(book)) return book;
  // No transaction: the app is checking whether an earlier one has landed.
  if (!signedBase64) return null;
  const { pendingAsset, pendingAssetSecret } = book.publishing;
  if (!pendingAsset || !pendingAssetSecret) throw httpError(409, 'Start publishing again');

  let tx;
  try {
    tx = signTransaction(Buffer.from(String(signedBase64 || ''), 'base64'), keypairFromSecret(pendingAssetSecret));
  } catch {
    throw httpError(400, 'That transaction is not the one for this book');
  }
  const { message, signers, sigStart, buf } = parseTransaction(tx);
  const wallet = normalizeAddress(user.walletAddress || '');
  const payerSlot = signers.indexOf(wallet);
  if (payerSlot !== 0 || !verifyEd25519({ address: wallet, message, signature: buf.subarray(sigStart, sigStart + 64) })) {
    throw httpError(400, 'The transaction must be signed by your linked wallet');
  }

  const signature = transactionSignature(tx, 0);
  await Book.updateOne({ _id: book._id }, { $set: { 'publishing.mintSignature': signature } });
  book.publishing.mintSignature = signature;

  try {
    await rpc('sendTransaction', [tx.toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  } catch (err) {
    throw httpError(422, `The network rejected the transaction: ${err.message.replace(/^Solana RPC \w+ failed: /, '')}`);
  }
  const result = await waitForConfirmation(signature);
  if (result.err) throw httpError(422, 'The transaction failed on-chain. Try publishing again.');
  // Not visible yet (or still confirming): the caller reports it as pending.
  return (await finalizeMint(book)) ? book : null;
}

// ── Holders and claims ───────────────────────────────────────────────────────

/** Re-read who holds a minted book's asset (it can be transferred or sold). */
async function refreshHolder(book) {
  if (book.publishing?.status !== 'minted' || !book.publishing.asset) return book.publishing?.holder;
  const owner = await coreAssetOwner(book.publishing.asset).catch(() => null);
  if (owner && owner !== book.publishing.holder) {
    await Book.updateOne({ _id: book._id }, { $set: { 'publishing.holder': owner } });
    book.publishing.holder = owner;
  }
  return book.publishing.holder;
}

/**
 * Why `user` can't edit `book`, or null if they can. Admins always can; the
 * publisher until it's minted; after that, whoever holds its NFT (editing
 * rights move with it). Rejected books can't be edited.
 */
async function editRefusal(book, user) {
  const status = book?.publishing?.status;
  if (!status) return 'Book not found';
  if (user.role === 'admin') return null;
  if (status === 'rejected') return "This book wasn't approved, so it can't be edited";
  if (status === 'minted') {
    const holder = await refreshHolder(book);
    return user.walletAddress && user.walletAddress === holder ? null : "Only the wallet holding this book's NFT can edit it";
  }
  return String(book.publishing.publisher) === String(user._id) ? null : 'Only the publisher can edit this book';
}

/** Payout currencies the payout wallet can pay right now. */
async function payoutCurrencies() {
  const wallet = payoutWallet();
  if (!wallet) return [];
  const all = payments.currencies();
  const out = [];
  for (const code of ['USDC', 'SKR']) {
    const mint = all[code]?.mint;
    if (!mint) continue;
    const accounts = await payments.tokenAccounts(wallet.publicKey, mint).catch(() => []);
    if (accounts.some((a) => a.amount > 0n)) out.push(code);
  }
  return out;
}

async function payoutQuote(currency, microUsd) {
  const c = payments.currencies()[currency];
  if (!c?.mint) throw httpError(400, `${currency} payouts are not available`);
  const { decimals, programId } = await payments.mintInfo(c.mint);
  let usdPrice = 1;
  if (c.priceId) {
    usdPrice = (await payments.usdPrices())[c.priceId];
    if (!usdPrice) throw httpError(503, `Can't get a ${currency} price right now. Try again or claim in USDC.`);
  }
  // Round down: never pay out more than was earned.
  const amount = BigInt(Math.floor((microUsd / 1e6 / usdPrice) * 10 ** decimals));
  return { mint: c.mint, decimals, programId, usdPrice, amount };
}

/**
 * An unsigned transfer of `amount` of `mint` from `payer`'s largest token
 * account to `recipient`, creating the recipient's token account if needed
 * (the payer covers its rent).
 */
async function buildPayoutTransaction({ payer, recipient, mint, programId, amount, decimals, currency = 'Token' }) {
  const sources = (await payments.tokenAccounts(payer, mint)).sort((a, b) => (b.amount > a.amount ? 1 : -1));
  if (!sources[0] || sources[0].amount < amount) throw httpError(503, `${currency} payouts are not available right now`);
  const [existing] = await payments.tokenAccounts(recipient, mint);
  const instructions = [];
  let destination = existing?.address;
  if (!destination) {
    const create = createAssociatedTokenAccountIdempotentInstruction({ payer, owner: recipient, mint, tokenProgram: programId });
    destination = create.keys[1].pubkey;
    instructions.push(create);
  }
  instructions.push(tokenTransferCheckedInstruction({
    programId,
    source: sources[0].address,
    mint,
    destination,
    owner: payer,
    amount,
    decimals
  }));
  const { value: { blockhash } } = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  return serializeTransaction({ feePayer: payer, recentBlockhash: blockhash, instructions });
}

async function claim(bookId, user, currency = 'USDC') {
  const wallet = payoutWallet();
  if (!wallet) throw httpError(503, 'Payouts are not available right now');
  const book = await Book.findById(bookId);
  if (book?.publishing?.status !== 'minted') throw httpError(404, 'Book not found');

  const holder = await refreshHolder(book);
  if (!user.walletAddress || user.walletAddress !== holder) {
    throw httpError(403, "Only the wallet holding this book's NFT can claim its earnings");
  }
  const claimed = book.publishing.claimedMicroUsd || 0;
  const available = (book.publishing.earnedMicroUsd || 0) - claimed;
  if (available < minClaimMicroUsd()) {
    throw httpError(422, `You can claim once this book has earned at least $${(minClaimMicroUsd() / 1e6).toFixed(2)}`);
  }
  const microUsd = Math.min(available, maxClaimMicroUsd());
  const q = await payoutQuote(currency, microUsd);
  if (q.amount <= 0n) throw httpError(422, 'That amount is too small to pay out');

  // Reserve the earnings first so a concurrent claim can't pay them twice.
  const reserved = await Book.updateOne(
    { _id: book._id, 'publishing.claimedMicroUsd': claimed },
    { $inc: { 'publishing.claimedMicroUsd': microUsd } }
  );
  if (!reserved.modifiedCount) throw httpError(409, 'Another claim is in progress. Try again in a moment.');
  const payout = await PublisherPayout.create({
    bookId: book._id,
    userId: user._id,
    wallet: holder,
    microUsd,
    currency,
    mint: q.mint,
    amount: q.amount.toString(),
    decimals: q.decimals,
    usdPrice: q.usdPrice
  });
  const release = async (error) => {
    await Book.updateOne({ _id: book._id }, { $inc: { 'publishing.claimedMicroUsd': -microUsd } });
    await PublisherPayout.updateOne({ _id: payout._id }, { $set: { status: 'failed', error } });
  };

  let tx;
  try {
    tx = signTransaction(await buildPayoutTransaction({ payer: wallet.publicKey, recipient: holder, currency, ...q }), wallet);
  } catch (err) {
    await release(err.message);
    throw err.status ? err : httpError(502, 'The payout could not be prepared. Try again.');
  }
  const signature = transactionSignature(tx, 0);
  await PublisherPayout.updateOne({ _id: payout._id }, { $set: { signature } });
  try {
    await rpc('sendTransaction', [tx.toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  } catch (err) {
    // An RPC error means the node refused it, so nothing was sent and the
    // earnings go back. Anything else (a dropped connection) is ambiguous: the
    // confirmation check below decides.
    if (/^Solana RPC sendTransaction failed: (?!HTTP 5)/.test(err.message)) {
      await release(err.message);
      throw httpError(502, 'The payout could not be sent. Try again.');
    }
    console.error(`[publishing] Payout ${payout._id} send was ambiguous:`, err.message);
  }

  const result = await waitForConfirmation(signature);
  if (result.err) {
    await release(JSON.stringify(result.err));
    throw httpError(502, 'The payout failed on-chain. Your earnings are still available.');
  }
  // A timeout leaves the payout 'sending' with its earnings reserved: it may
  // still land, and paying twice is worse than a short wait.
  if (result.ok) await PublisherPayout.updateOne({ _id: payout._id }, { $set: { status: 'confirmed' } });
  return {
    status: result.ok ? 'confirmed' : 'sending',
    signature,
    currency,
    amount: q.amount.toString(),
    decimals: q.decimals,
    usd: microUsd / 1e6
  };
}

// ── Views ────────────────────────────────────────────────────────────────────

const usd = (micro) => Math.round(micro || 0) / 1e6;

/** A book as its publisher or holder sees it. */
async function bookSummary(book) {
  const p = book.publishing || {};
  const characters = await Character.find({ bookId: book._id }, 'firstName lastName image_url earnings').lean();
  return {
    id: book._id,
    title: book.title,
    author: book.author,
    image_url: book.image_url,
    status: p.status,
    reviewNote: p.reviewNote,
    asset: p.asset,
    holder: p.holder,
    mintedAt: p.mintedAt,
    revenueShareBps: p.revenueShareBps ?? shareBps(),
    interactions: p.interactions || 0,
    earnedUsd: usd(p.earnedMicroUsd),
    claimedUsd: usd(p.claimedMicroUsd),
    availableUsd: usd((p.earnedMicroUsd || 0) - (p.claimedMicroUsd || 0)),
    characters: characters
      .map((c) => ({
        id: c._id,
        name: [c.firstName, c.lastName].filter(Boolean).join(' '),
        image_url: c.image_url,
        interactions: c.earnings?.interactions || 0,
        earnedUsd: usd(c.earnings?.microUsd)
      }))
      .sort((a, b) => b.earnedUsd - a.earnedUsd)
  };
}

/** Books this user published, plus any whose NFT their wallet now holds. */
async function booksFor(user) {
  const or = [{ 'publishing.publisher': user._id }];
  if (user.walletAddress) or.push({ 'publishing.holder': user.walletAddress });
  const books = await Book.find({ 'publishing.status': { $exists: true }, $or: or }).sort({ createdAt: -1 });
  await Promise.all(books.map(refreshHolder));
  return Promise.all(books.map(async (book) => ({
    ...(await bookSummary(book)),
    canEdit: !(await editRefusal(book, user))
  })));
}

async function settings() {
  const fee = await publishFee().catch(() => null);
  return {
    revenueShareBps: shareBps(),
    publishFee: fee && { currency: fee.currency, amount: fee.amount.toString(), decimals: fee.decimals, usd: fee.usd },
    minClaimUsd: usd(minClaimMicroUsd()),
    maxClaimUsd: usd(maxClaimMicroUsd()),
    payoutCurrencies: await payoutCurrencies().catch(() => [])
  };
}

/** Metaplex JSON for a published book's asset. */
function metadata(book, webUrl) {
  return {
    name: book.title,
    symbol: 'CHATTY',
    description: book.description || `${book.title}${book.author ? ` by ${book.author}` : ''}, published on Chatty Books. ` +
      "Holding this asset earns a share of what readers spend talking to the book's characters.",
    image: book.image_url,
    external_url: `${webUrl}/b/${book._id}`,
    attributes: [
      book.author && { trait_type: 'Author', value: book.author },
      { trait_type: 'Revenue share', value: `${(book.publishing?.revenueShareBps ?? shareBps()) / 100}%` }
    ].filter(Boolean),
    properties: { category: 'image', files: book.image_url ? [{ uri: book.image_url, type: 'image/jpeg' }] : [] }
  };
}

module.exports = {
  recordInteraction,
  checkCanSubmit,
  review,
  buildMintTransaction,
  submitMintTransaction,
  claim,
  bookSummary,
  booksFor,
  settings,
  metadata,
  buildPayoutTransaction,
  refreshHolder,
  editRefusal
};
