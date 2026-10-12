// One-off migration: renames provider-specific service/action names in MongoDB
// to the provider-neutral names used since the switch to the Privateer API.
//   CostEstimate.service:  gemini -> text (or image for image_generation), gemini_image -> image, veo -> video
//   ServiceRate:           gemini.* -> text.*, gemini_image.imagen3 -> image.standard, veo.* -> video.*
//   TokenCost.action:      GEMINI_TEXT_GENERATION -> TEXT_GENERATION
// Usage: node scripts/migrateAiProviderNames.js [--dry-run]
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');

const dryRun = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(process.env.ATLAS_URI, { dbName: 'talkingbooks' });
  const db = mongoose.connection.db;

  const ops = [
    ['costestimates', { service: 'gemini', action: 'image_generation' }, { $set: { service: 'image' } }],
    ['costestimates', { service: 'gemini' }, { $set: { service: 'text' } }],
    ['costestimates', { service: 'gemini_image' }, { $set: { service: 'image' } }],
    ['costestimates', { service: 'veo' }, { $set: { service: 'video' } }],
    ['servicerates', { service: 'gemini' }, { $set: { service: 'text', description: null } }],
    ['servicerates', { service: 'gemini_image', key: 'imagen3' }, { $set: { service: 'image', key: 'standard', name: 'Standard Image', description: 'Image generation' } }],
    ['servicerates', { service: 'veo' }, { $set: { service: 'video', description: null } }],
    ['tokencosts', { action: 'GEMINI_TEXT_GENERATION' }, { $set: { action: 'TEXT_GENERATION' } }],
  ];

  for (const [collection, filter, update] of ops) {
    const count = await db.collection(collection).countDocuments(filter);
    console.log(`${collection} ${JSON.stringify(filter)}: ${count} document(s)`);
    if (!dryRun && count > 0) {
      await db.collection(collection).updateMany(filter, update);
    }
  }

  if (!dryRun) {
    const rates = db.collection('servicerates');
    await rates.updateMany({ service: 'text', key: 'input' }, { $set: { description: 'Text generation input cost' } });
    await rates.updateMany({ service: 'text', key: 'output' }, { $set: { description: 'Text generation output cost' } });
    for (const key of ['720p', '1080p', '4k']) {
      await rates.updateMany({ service: 'video', key }, { $set: { description: `${key} video generation` } });
    }
  }

  console.log(dryRun ? 'Dry run complete — no changes written.' : 'Migration complete.');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
