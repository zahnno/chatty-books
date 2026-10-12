/**
 * Seeker Genesis Token (SGT): the soulbound Token-2022 NFT minted to every
 * Seeker phone. Holding one in a wallet the reader proved with Sign In With
 * Solana earns a one-time token bonus.
 *
 * Verification follows Solana Mobile's guide
 * (docs.solanamobile.com/marketing/engaging-seeker-users): among the wallet's
 * Token-2022 accounts with a non-zero balance, find a mint whose metadata
 * pointer and token-group-member extensions both point at the SGT group.
 * Only the group's update authority can add members, so the group check is
 * what makes this unforgeable.
 *
 * Anti-sybil: the bonus is keyed on the SGT *mint*, not the wallet — moving
 * the SGT to a new wallet (or linking it to a second account) can't claim it
 * again. One bonus per account too.
 */
const TokenTransaction = require('../../models/tokenTransactionModel');
const User = require('../../models/userModel');
const ProcessedBillingEvent = require('../../models/processedBillingEventModel');
const { claimEvent } = require('../storeSubscriptionService');
const { rpc, TOKEN_2022_PROGRAM } = require('./core');

const SGT_GROUP = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const SGT_METADATA = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const BATCH = 100;

function bonusTokens() {
  const n = parseInt(process.env.SGT_BONUS_TOKENS, 10);
  return Number.isFinite(n) && n >= 0 ? n : 50000;
}

/** The SGT mint `wallet` holds, or null. */
async function findSgtMint(wallet) {
  const { value: accounts } = await rpc('getTokenAccountsByOwner', [
    wallet,
    { programId: TOKEN_2022_PROGRAM },
    { encoding: 'jsonParsed', commitment: 'confirmed' }
  ]);
  // Transferring an SGT away leaves the old account open with a 0 balance.
  const mints = accounts
    .map((a) => a.account?.data?.parsed?.info)
    .filter((info) => info?.mint && info.tokenAmount?.amount !== '0')
    .map((info) => info.mint);

  for (let i = 0; i < mints.length; i += BATCH) {
    const batch = mints.slice(i, i + BATCH);
    const { value } = await rpc('getMultipleAccounts', [batch, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    for (let j = 0; j < batch.length; j++) {
      const account = value[j];
      if (account?.owner !== TOKEN_2022_PROGRAM) continue;
      const extensions = account.data?.parsed?.info?.extensions || [];
      const ext = (name) => extensions.find((e) => e.extension === name)?.state;
      if (ext('metadataPointer')?.metadataAddress === SGT_METADATA && ext('tokenGroupMember')?.group === SGT_GROUP) {
        return batch[j];
      }
    }
  }
  return null;
}

/**
 * Whether `user` could claim the Seeker bonus right now, without claiming it.
 * Returns { eligible, tokens, reason? } with the same reasons as
 * claimSeekerBonus.
 */
async function checkSeekerBonus(user) {
  const tokens = bonusTokens();
  if (!user.walletAddress) return { eligible: false, tokens, reason: 'no_wallet' };
  if (user.seekerBonus?.claimedAt) return { eligible: false, tokens, reason: 'already_claimed' };
  const mint = await findSgtMint(user.walletAddress);
  if (!mint) return { eligible: false, tokens, reason: 'no_sgt' };
  if (await ProcessedBillingEvent.exists({ provider: 'solana', eventId: `sgt:${mint}` })) {
    return { eligible: false, tokens, reason: 'sgt_used' };
  }
  return { eligible: true, tokens };
}

/**
 * Grant the Seeker bonus to `user` if their linked wallet holds an unclaimed
 * SGT. Returns { granted, tokens?, reason? } — reason is 'no_wallet',
 * 'already_claimed' (this account), 'no_sgt', or 'sgt_used' (another account
 * already claimed with this SGT).
 */
async function claimSeekerBonus(user) {
  if (!user.walletAddress) return { granted: false, reason: 'no_wallet' };
  if (user.seekerBonus?.claimedAt) return { granted: false, reason: 'already_claimed' };

  const mint = await findSgtMint(user.walletAddress);
  if (!mint) return { granted: false, reason: 'no_sgt' };

  const eventId = `sgt:${mint}`;
  if (!(await claimEvent('solana', eventId, 'sgt_bonus'))) return { granted: false, reason: 'sgt_used' };

  const tokens = bonusTokens();
  try {
    // Mark the account first (conditional, so two concurrent claims with
    // different SGTs can't both land), then credit.
    const marked = await User.updateOne(
      { _id: user._id, 'seekerBonus.claimedAt': { $exists: false } },
      { $set: { seekerBonus: { sgtMint: mint, claimedAt: new Date(), tokens } } }
    );
    if (!marked.modifiedCount) {
      await ProcessedBillingEvent.deleteOne({ provider: 'solana', eventId });
      return { granted: false, reason: 'already_claimed' };
    }
    if (tokens > 0) {
      await TokenTransaction.createTransaction({
        userId: user._id,
        amount: tokens,
        type: 'credit',
        action: 'seeker_bonus',
        description: 'Seeker Genesis Token bonus',
        metadata: { sgtMint: mint, wallet: user.walletAddress }
      });
    }
  } catch (err) {
    // Leave both unclaimed so the reader can retry.
    await ProcessedBillingEvent.deleteOne({ provider: 'solana', eventId });
    await User.updateOne({ _id: user._id, 'seekerBonus.sgtMint': mint }, { $unset: { seekerBonus: 1 } });
    throw err;
  }
  return { granted: true, tokens };
}

module.exports = { findSgtMint, checkSeekerBonus, claimSeekerBonus, bonusTokens };
