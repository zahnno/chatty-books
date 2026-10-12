/**
 * Sign In With Solana (SIWS) for the Seeker build.
 *
 * The app asks for a challenge, hands its fields to the wallet as Mobile
 * Wallet Adapter's `sign_in_payload`, and the wallet signs a message in the
 * SIWS text format. Wallets without sign-in support fall back to signing the
 * same text via signMessages (challenge called again with the address).
 * Either way we get back the exact bytes signed, and verify:
 *   - the ed25519 signature over those bytes by the claimed address,
 *   - the first line names our domain and the second line is that address,
 *   - the nonce is one we issued, unexpired and unused (consumed here).
 */
const crypto = require('crypto');
const SolanaNonce = require('../../models/solanaNonceModel');
const { CLUSTER, verifyEd25519, normalizeAddress } = require('./core');

const NONCE_TTL_MS = 10 * 60 * 1000;
// Must match the identity uri the app gives Mobile Wallet Adapter: wallets
// flag a sign-in whose domain differs from the requesting app's.
const URI = process.env.SIWS_URI || 'https://www.chattybooks.com';
const DOMAIN = new URL(URI).host;
const STATEMENT = 'Sign in to Chatty Books.';
const CHAIN_ID = CLUSTER === 'devnet' ? 'devnet' : 'mainnet';

/** A fresh challenge. With `address`, also the exact message to sign (fallback path). */
async function createChallenge(address) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
  await SolanaNonce.create({ nonce, expiresAt });

  const payload = {
    domain: DOMAIN,
    statement: STATEMENT,
    uri: URI,
    version: '1',
    chainId: CHAIN_ID,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString()
  };
  return address ? { ...payload, message: formatMessage({ ...payload, address }) } : payload;
}

// The SIWS / CAIP-122 plain-text format wallets produce from a sign-in payload.
function formatMessage(p) {
  const lines = [`${p.domain} wants you to sign in with your Solana account:`, p.address];
  if (p.statement) lines.push('', p.statement);
  const fields = [
    ['URI', p.uri],
    ['Version', p.version],
    ['Chain ID', p.chainId],
    ['Nonce', p.nonce],
    ['Issued At', p.issuedAt],
    ['Expiration Time', p.expirationTime]
  ].filter(([, v]) => v);
  if (fields.length) lines.push('', ...fields.map(([k, v]) => `${k}: ${v}`));
  return lines.join('\n');
}

function field(lines, name) {
  const line = lines.find((l) => l.startsWith(`${name}: `));
  return line ? line.slice(name.length + 2).trim() : null;
}

/**
 * Verify a signed SIWS message. Returns the base58 wallet address.
 * Throws an Error with .status 401 when it doesn't check out.
 *
 * @param {object} args  all base64 (as Mobile Wallet Adapter returns them)
 * @param {string} args.address
 * @param {string} args.signedMessage
 * @param {string} args.signature
 */
async function verifySignIn({ address, signedMessage, signature }) {
  const fail = (message) => Object.assign(new Error(message), { status: 401 });

  const wallet = normalizeAddress(address);
  if (!wallet || typeof signedMessage !== 'string' || typeof signature !== 'string') {
    throw fail('Invalid sign-in response');
  }
  const messageBytes = Buffer.from(signedMessage, 'base64');
  const signatureBytes = Buffer.from(signature, 'base64');
  if (signatureBytes.length !== 64 || messageBytes.length === 0 || messageBytes.length > 2048) {
    throw fail('Invalid sign-in response');
  }
  if (!verifyEd25519({ address: wallet, message: messageBytes, signature: signatureBytes })) {
    throw fail('Signature does not match the wallet');
  }

  const lines = messageBytes.toString('utf8').split('\n');
  if (lines[0] !== `${DOMAIN} wants you to sign in with your Solana account:` || lines[1] !== wallet) {
    throw fail('Sign-in message is not for this app');
  }
  const expiration = field(lines, 'Expiration Time');
  if (expiration && !(new Date(expiration) > new Date())) throw fail('Sign-in request expired');

  const nonce = field(lines, 'Nonce');
  const used = nonce && await SolanaNonce.findOneAndDelete({ nonce, expiresAt: { $gt: new Date() } });
  if (!used) throw fail('Sign-in request expired or already used');

  return wallet;
}

module.exports = { createChallenge, verifySignIn, formatMessage };
