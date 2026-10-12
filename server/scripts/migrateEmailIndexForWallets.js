// Lets wallet-only accounts (Sign In With Solana on the Seeker build) exist
// without an email. The old `email_1` index is unique over *every* user, so a
// second account with no email would collide on the missing value. This
// swaps it for a unique index over accounts that have an email, and makes
// sure the wallet index exists.
//
// Run once before deploying the Seeker build's server changes:
//   node scripts/migrateEmailIndexForWallets.js [--dry-run]
// Idempotent.
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');

const dryRun = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(process.env.ATLAS_URI, { dbName: 'talkingbooks' });
  const users = mongoose.connection.db.collection('users');
  const indexes = await users.indexes();
  const email = indexes.find((i) => i.name === 'email_1');

  if (email?.partialFilterExpression) {
    console.log('  ✓ email_1 is already partial');
  } else {
    console.log(`  → ${email ? 'replace' : 'create'} email_1 as unique where email is a string`);
    if (!dryRun) {
      if (email) await users.dropIndex('email_1');
      await users.createIndex(
        { email: 1 },
        { name: 'email_1', unique: true, partialFilterExpression: { email: { $type: 'string' } } }
      );
    }
  }

  if (indexes.some((i) => i.name === 'walletAddress_1')) {
    console.log('  ✓ walletAddress_1 exists');
  } else {
    console.log('  → create walletAddress_1 (unique, sparse)');
    if (!dryRun) await users.createIndex({ walletAddress: 1 }, { unique: true, sparse: true });
  }

  console.log(dryRun ? 'Dry run — nothing changed.' : 'Done.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
