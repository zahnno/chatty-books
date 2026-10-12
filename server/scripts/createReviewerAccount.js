// Creates (or resets) the App Store / Google Play review account: email already
// verified, on the free plan so reviewers can test buying a subscription, and
// with enough tokens to try every feature. AI consent is left unset so review
// sees the one-time consent prompt. Idempotent: re-running resets the password
// and tops the balance back up.
//
// Usage: node scripts/createReviewerAccount.js --email appreview@chattybooks.com \
//          --password '<strong password>' [--tokens 50000] [--dry-run]
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const User = require('../models/userModel');
const Subscription = require('../models/subscriptionModel');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const email = arg('email');
const password = arg('password');
const tokens = parseInt(arg('tokens') || '50000', 10);
const dryRun = process.argv.includes('--dry-run');

async function run() {
  if (!email || !password || password.length < 10) {
    console.error('Usage: --email <address> --password <at least 10 characters> [--tokens N] [--dry-run]');
    process.exit(1);
  }
  await mongoose.connect(process.env.ATLAS_URI, { dbName: 'talkingbooks' });

  const freePlan = await Subscription.findOne({ tier: 'free', isActive: true });
  let user = await User.findOne({ email });
  console.log(`${user ? 'Resetting' : 'Creating'} ${email} (free plan: ${freePlan ? freePlan.name : 'none found'}, ${tokens} tokens)`);

  if (!dryRun) {
    if (!user) user = new User({ email, username: 'App Review', role: 'reader' });
    user.password = password; // hashed by the model's pre-save hook
    user.isEmailVerified = true;
    user.tokenBalance = tokens;
    user.lastTokenRefresh = new Date();
    if (freePlan) {
      user.subscription = {
        plan: freePlan._id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'active',
        autoRenew: true
      };
    }
    await user.save();
  }

  await mongoose.disconnect();
  console.log(dryRun ? 'Dry run — nothing written.' : 'Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
