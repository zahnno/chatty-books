// Sets the App Store / Google Play product ids on the paid subscription plans so
// in-app purchases map back to a plan. Only `$set`s the store fields — prices,
// tokens and Stripe ids are untouched. Idempotent; the free tier is skipped.
//
// Ids must match what's created in the stores:
//   App Store Connect: one auto-renewable subscription per tier, all in one
//                      subscription group, id `chattybooks_<tier>_monthly`
//                      (Apple ids are unique per developer account, and the
//                      Privateer app already uses sub_<tier>_monthly).
//   Play Console:      one subscription per tier, id `sub_<tier>`, with an
//                      auto-renewing monthly base plan `monthly`.
// Usage: node scripts/addStoreProductIds.js [--dry-run]
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const Subscription = require('../models/subscriptionModel');

const dryRun = process.argv.includes('--dry-run');
const PAID_TIERS = ['basic', 'standard', 'premium', 'enterprise'];

async function run() {
  await mongoose.connect(process.env.ATLAS_URI, { dbName: 'talkingbooks' });

  for (const tier of PAID_TIERS) {
    const ids = {
      appleProductId: `chattybooks_${tier}_monthly`,
      playProductId: `sub_${tier}`,
      playBasePlanId: 'monthly'
    };
    const plans = await Subscription.find({ tier }).select('name price isActive');
    if (!plans.length) {
      console.log(`  - ${tier}: no plan`);
      continue;
    }
    if (plans.length > 1) {
      console.warn(`  ! ${tier}: ${plans.length} plans share this tier — set ids by hand`);
      continue;
    }
    const [plan] = plans;
    console.log(`  ✓ ${tier} (${plan.name}, $${plan.price}${plan.isActive ? '' : ', inactive'}) → ` +
      `${ids.appleProductId} / ${ids.playProductId}:${ids.playBasePlanId}`);
    if (!dryRun) await Subscription.updateOne({ _id: plan._id }, { $set: ids });
  }

  await mongoose.disconnect();
  console.log(dryRun ? 'Dry run — nothing written.' : 'Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
