/**
 * Minimal Solana plumbing for the Seeker (dApp Store) build: JSON-RPC, base58,
 * ed25519 verification and legacy-transaction serialization.
 *
 * Hand-rolled instead of @solana/web3.js because web3.js 1.9x pulls in
 * @solana/codecs-* (Node >= 20.18) and the server runs on Node 18. Everything
 * here is small; the serializer was cross-checked against web3.js's own
 * encoding of the same transfers.
 */
const crypto = require('crypto');

const CLUSTER = process.env.SOLANA_CLUSTER || 'mainnet-beta';
const RPC_URL = process.env.SOLANA_RPC_URL || (CLUSTER === 'devnet'
  ? 'https://api.devnet.solana.com'
  : 'https://api.mainnet-beta.solana.com');
// MWA / wallet-standard chain id the app authorizes against.
const CHAIN = CLUSTER === 'devnet' ? 'solana:devnet' : 'solana:mainnet';

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const MPL_CORE_PROGRAM = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

// ── JSON-RPC ─────────────────────────────────────────────────────────────────

// For RPC keys locked to allowed domains (e.g. Helius "Allowed Domains"):
// server requests carry no Origin unless we send one.
const RPC_ORIGIN = process.env.SOLANA_RPC_ORIGIN;

let rpcId = 0;
async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(RPC_ORIGIN ? { Origin: RPC_ORIGIN } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params })
  });
  if (!res.ok) {
    // Providers explain refusals (bad key, origin/IP rules) in the body.
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Solana RPC ${method} failed: HTTP ${res.status}${detail ? ` ${detail}` : ''}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`Solana RPC ${method} failed: ${data.error.message}`);
  return data.result;
}

// ── base58 ───────────────────────────────────────────────────────────────────

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ALPHABET_MAP = Object.fromEntries([...ALPHABET].map((c, i) => [c, BigInt(i)]));

function base58Encode(bytes) {
  const buf = Buffer.from(bytes);
  let n = BigInt('0x' + (buf.toString('hex') || '0'));
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of buf) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

function base58Decode(str) {
  if (typeof str !== 'string' || !str) throw new Error('Invalid base58 string');
  let n = 0n;
  for (const c of str) {
    const v = ALPHABET_MAP[c];
    if (v === undefined) throw new Error('Invalid base58 string');
    n = n * 58n + v;
  }
  let hex = n === 0n ? '' : n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const body = Buffer.from(hex, 'hex');
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;
  return Buffer.concat([Buffer.alloc(zeros), body]);
}

/**
 * A 32-byte public key from either base58 (how Solana writes addresses) or
 * base64 (how Mobile Wallet Adapter returns them). Returns the base58 form,
 * or null if it isn't a 32-byte key.
 */
function normalizeAddress(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    // Padded base64 of 32 bytes always ends in '='; base58 never contains it.
    const bytes = /[+/=]/.test(value)
      ? Buffer.from(value, 'base64')
      : base58Decode(value);
    return bytes.length === 32 ? base58Encode(bytes) : null;
  } catch {
    return null;
  }
}

/** A transaction signature (base58 or MWA's base64) as base58, or null. */
function normalizeSignature(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const bytes = /[+/=]/.test(value) ? Buffer.from(value, 'base64') : base58Decode(value);
    return bytes.length === 64 ? base58Encode(bytes) : null;
  } catch {
    return null;
  }
}

// ── ed25519 ──────────────────────────────────────────────────────────────────

function verifyEd25519({ address, message, signature }) {
  try {
    const key = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: base58Decode(address).toString('base64url') },
      format: 'jwk'
    });
    return crypto.verify(null, Buffer.from(message), key, Buffer.from(signature));
  } catch {
    return false;
  }
}

/** A fresh random public-key-shaped id, e.g. a Solana Pay reference. */
function randomAddress() {
  return base58Encode(crypto.randomBytes(32));
}

// ── Keypairs and signing ─────────────────────────────────────────────────────

/**
 * A keypair from a 64-byte secret key (seed + public key), given as base58
 * (how wallets export it) or a JSON byte array (solana-keygen's file format).
 */
function keypairFromSecret(secret) {
  const text = String(secret || '').trim();
  const bytes = text.startsWith('[') ? Buffer.from(JSON.parse(text)) : base58Decode(text);
  if (bytes.length !== 64) throw new Error('A Solana secret key is 64 bytes');
  return { publicKey: base58Encode(bytes.subarray(32)), secretKey: bytes };
}

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');
  const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  return { publicKey: base58Encode(pub), secretKey: Buffer.concat([seed, pub]) };
}

function signEd25519(message, secretKey) {
  const key = crypto.createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      d: Buffer.from(secretKey.subarray(0, 32)).toString('base64url'),
      x: Buffer.from(secretKey.subarray(32)).toString('base64url')
    },
    format: 'jwk'
  });
  return crypto.sign(null, Buffer.from(message), key);
}

function readShortvec(buf, offset) {
  let value = 0;
  let size = 0;
  for (;;) {
    const byte = buf[offset + size];
    value |= (byte & 0x7f) << (7 * size);
    size++;
    if ((byte & 0x80) === 0) return { value, size };
  }
}

/**
 * The parts of a serialized legacy transaction: signature slots, the message
 * they sign, and the message's signer keys (base58, in slot order).
 */
function parseTransaction(tx) {
  const buf = Buffer.from(tx);
  const sigs = readShortvec(buf, 0);
  const messageStart = sigs.size + 64 * sigs.value;
  const message = buf.subarray(messageStart);
  if (message[0] & 0x80) throw new Error('Versioned transactions are not supported');
  const keys = readShortvec(message, 3);
  const signers = [];
  for (let i = 0; i < message[0]; i++) {
    const at = 3 + keys.size + 32 * i;
    signers.push(base58Encode(message.subarray(at, at + 32)));
  }
  return { buf, sigCount: sigs.value, sigStart: sigs.size, message, signers };
}

/** Fill `keypair`'s signature slot in a serialized legacy transaction. Returns a new Buffer. */
function signTransaction(tx, keypair) {
  const { buf, sigStart, message, signers } = parseTransaction(tx);
  const slot = signers.indexOf(keypair.publicKey);
  if (slot < 0) throw new Error(`${keypair.publicKey} is not a signer of this transaction`);
  const out = Buffer.from(buf);
  signEd25519(message, keypair.secretKey).copy(out, sigStart + 64 * slot);
  return out;
}

/** The base58 signature in slot `slot` of a serialized transaction. */
function transactionSignature(tx, slot = 0) {
  const { buf, sigStart } = parseTransaction(tx);
  return base58Encode(buf.subarray(sigStart + 64 * slot, sigStart + 64 * (slot + 1)));
}

// ── Program addresses ────────────────────────────────────────────────────────

// Program-derived addresses must not be valid ed25519 points, so deriving one
// needs an on-curve check: decompress the point (RFC 8032 §5.1.3) and see
// whether x² = (y² − 1) / (d·y² + 1) has a square root.
const P = 2n ** 255n - 19n;
const mod = (a) => ((a % P) + P) % P;
function powMod(base, exp) {
  let result = 1n;
  let b = mod(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return result;
}
const ED25519_D = mod(-121665n * powMod(121666n, P - 2n));

function isOnCurve(bytes) {
  const y = mod(BigInt('0x' + Buffer.from(bytes).reverse().toString('hex')) & ((1n << 255n) - 1n));
  const y2 = (y * y) % P;
  const x2 = mod((y2 - 1n) * powMod(ED25519_D * y2 + 1n, P - 2n));
  return x2 === 0n || powMod(x2, (P - 1n) / 2n) === 1n;
}

function findProgramAddress(seeds, programId) {
  const program = base58Decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const hash = crypto.createHash('sha256')
      .update(Buffer.concat([...seeds.map((s) => Buffer.from(s)), Buffer.from([bump]), program, Buffer.from('ProgramDerivedAddress')]))
      .digest();
    if (!isOnCurve(hash)) return base58Encode(hash);
  }
  throw new Error('No program address found');
}

function associatedTokenAddress(owner, mint, tokenProgram = TOKEN_PROGRAM) {
  return findProgramAddress([base58Decode(owner), base58Decode(tokenProgram), base58Decode(mint)], ASSOCIATED_TOKEN_PROGRAM);
}

/** Create `owner`'s associated token account for `mint` unless it exists. */
function createAssociatedTokenAccountIdempotentInstruction({ payer, owner, mint, tokenProgram = TOKEN_PROGRAM }) {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress(owner, mint, tokenProgram), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false }
    ],
    data: Buffer.from([1])
  };
}

// ── Metaplex Core ────────────────────────────────────────────────────────────

const borshString = (value) => {
  const bytes = Buffer.from(value, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
};

/**
 * Metaplex Core CreateV1: a new asset (a fresh keypair, which must sign) owned
 * by `owner`, with no collection or plugins. Optional accounts left out are
 * passed as the program id, as Core's generated clients do.
 */
function createCoreAssetInstruction({ asset, payer, owner, updateAuthority, name, uri }) {
  const none = MPL_CORE_PROGRAM;
  return {
    programId: MPL_CORE_PROGRAM,
    keys: [
      { pubkey: asset, isSigner: true, isWritable: true },
      { pubkey: none, isSigner: false, isWritable: false }, // collection
      { pubkey: none, isSigner: false, isWritable: false }, // authority (defaults to payer)
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: none, isSigner: false, isWritable: false } // log wrapper
    ],
    // CreateV1 discriminator, DataState::AccountState, name, uri, plugins: None
    data: Buffer.concat([Buffer.from([0, 0]), borshString(name), borshString(uri), Buffer.from([0])])
  };
}

/** The owner of a Core asset (BaseAssetV1: key u8, owner, …), or null if it isn't one. */
async function coreAssetOwner(asset) {
  const { value } = await rpc('getAccountInfo', [asset, { encoding: 'base64', commitment: 'confirmed' }]);
  if (!value || value.owner !== MPL_CORE_PROGRAM) return null;
  const data = Buffer.from(value.data[0], 'base64');
  if (data[0] !== 1) return null; // Key::AssetV1
  return base58Encode(data.subarray(1, 33));
}

// ── Legacy transactions ──────────────────────────────────────────────────────

function shortvec(n) {
  const out = [];
  let rem = n;
  for (;;) {
    let elem = rem & 0x7f;
    rem >>= 7;
    if (rem === 0) {
      out.push(elem);
      return out;
    }
    elem |= 0x80;
    out.push(elem);
  }
}

/**
 * Serialize an unsigned legacy transaction (empty signature slots) for the
 * wallet to sign. Account ordering follows the runtime's rules: fee payer,
 * writable signers, read-only signers, writable non-signers, read-only
 * non-signers.
 *
 * @param {object} args
 * @param {string} args.feePayer          base58
 * @param {string} args.recentBlockhash   base58
 * @param {{programId: string, keys: {pubkey: string, isSigner: boolean, isWritable: boolean}[], data: Buffer}[]} args.instructions
 * @returns {Buffer}
 */
function serializeTransaction({ feePayer, recentBlockhash, instructions }) {
  const metas = new Map([[feePayer, { isSigner: true, isWritable: true }]]);
  const add = (pubkey, isSigner, isWritable) => {
    const meta = metas.get(pubkey) || { isSigner: false, isWritable: false };
    meta.isSigner = meta.isSigner || isSigner;
    meta.isWritable = meta.isWritable || isWritable;
    metas.set(pubkey, meta);
  };
  for (const ix of instructions) {
    for (const k of ix.keys) add(k.pubkey, k.isSigner, k.isWritable);
    add(ix.programId, false, false);
  }

  const entries = [...metas.entries()];
  const rank = ([key, m]) => (key === feePayer ? 0 : m.isSigner ? (m.isWritable ? 1 : 2) : (m.isWritable ? 3 : 4));
  // Array.prototype.sort is stable, so equal ranks keep insertion order.
  entries.sort((a, b) => rank(a) - rank(b));
  const keys = entries.map(([key]) => key);
  const index = new Map(keys.map((k, i) => [k, i]));

  const numSigners = entries.filter(([, m]) => m.isSigner).length;
  const numReadonlySigned = entries.filter(([, m]) => m.isSigner && !m.isWritable).length;
  const numReadonlyUnsigned = entries.filter(([, m]) => !m.isSigner && !m.isWritable).length;

  const parts = [
    Buffer.from([numSigners, numReadonlySigned, numReadonlyUnsigned]),
    Buffer.from(shortvec(keys.length)),
    ...keys.map(base58Decode),
    base58Decode(recentBlockhash),
    Buffer.from(shortvec(instructions.length))
  ];
  for (const ix of instructions) {
    parts.push(
      Buffer.from([index.get(ix.programId)]),
      Buffer.from(shortvec(ix.keys.length)),
      Buffer.from(ix.keys.map((k) => index.get(k.pubkey))),
      Buffer.from(shortvec(ix.data.length)),
      ix.data
    );
  }
  const message = Buffer.concat(parts);

  return Buffer.concat([Buffer.from(shortvec(numSigners)), Buffer.alloc(64 * numSigners), message]);
}

function u64le(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

/** SystemProgram.transfer, plus any extra read-only keys (Solana Pay references). */
function solTransferInstruction({ from, to, lamports, extraKeys = [] }) {
  const data = Buffer.alloc(12);
  data.writeUInt32LE(2, 0);
  u64le(lamports).copy(data, 4);
  return {
    programId: SYSTEM_PROGRAM,
    keys: [
      { pubkey: from, isSigner: true, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
      ...extraKeys.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }))
    ],
    data
  };
}

/** SPL Token TransferChecked (works for Token and Token-2022 mints). */
function tokenTransferCheckedInstruction({ programId, source, mint, destination, owner, amount, decimals, extraKeys = [] }) {
  return {
    programId,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      ...extraKeys.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }))
    ],
    data: Buffer.concat([Buffer.from([12]), u64le(amount), Buffer.from([decimals])])
  };
}

module.exports = {
  CLUSTER,
  CHAIN,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  ASSOCIATED_TOKEN_PROGRAM,
  MPL_CORE_PROGRAM,
  rpc,
  base58Encode,
  base58Decode,
  normalizeAddress,
  normalizeSignature,
  verifyEd25519,
  randomAddress,
  serializeTransaction,
  solTransferInstruction,
  tokenTransferCheckedInstruction,
  keypairFromSecret,
  generateKeypair,
  parseTransaction,
  signTransaction,
  transactionSignature,
  isOnCurve,
  findProgramAddress,
  associatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createCoreAssetInstruction,
  coreAssetOwner
};
