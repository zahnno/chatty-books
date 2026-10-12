// One-off fix for two plan data typos:
//   - free plan name "Free Trail" → "Free Trial"
//   - Story Master (premium) tokensPerMonth 2,000,000 → 200,000, in line with its
//     advertised "est. 3000 messages/month" (2× Enthusiastic Reader's 100,000)
// Only touches plans that still have the old value, so it's safe to re-run. Also
// lists premium users whose balance is above the new allowance; their balance
// resets to 200,000 on their next renewal.
// Usage: node scripts/fixPlanTypos.js [--dry-run]
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const Subscription = require('../models/subscriptionModel');
const User = require('../models/userModel');

const dryRun = process.argv.includes('--dry-run');
const PREMIUM_TOKENS = 200000;

async function run() {
  await mongoose.connect(process.env.ATLAS_URI, { dbName: 'talkingbooks' });

  const free = await Subscription.findOne({ tier: 'free', name: 'Free Trail' });
  if (free) {
    console.log(`  ✓ free: name "Free Trail" → "Free Trial"`);
    if (!dryRun) await Subscription.updateOne({ _id: free._id }, { $set: { name: 'Free Trial' } });
  } else {
    console.log('  - free: already fixed');
  }

  const premium = await Subscription.findOne({ tier: 'premium', tokensPerMonth: 2000000 });
  if (premium) {
    console.log(`  ✓ premium (${premium.name}): tokensPerMonth 2000000 → ${PREMIUM_TOKENS}`);
    if (!dryRun) {
      await Subscription.updateOne({ _id: premium._id }, { $set: { tokensPerMonth: PREMIUM_TOKENS } });
    }
    const over = await User.find({
      'subscription.plan': premium._id,
      tokenBalance: { $gt: PREMIUM_TOKENS }
    }).select('email tokenBalance');
    console.log(`  ${over.length} premium user(s) above ${PREMIUM_TOKENS} tokens (reset on next renewal):`);
    over.forEach((u) => console.log(`    ${u.email}: ${u.tokenBalance}`));
  } else {
    console.log('  - premium: already fixed');
  }

  await mongoose.disconnect();
  console.log(dryRun ? 'Dry run — nothing written.' : 'Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
