// Matches a voice-chat voice to every character that doesn't have a usable one
// (characters created before voice chat existed, or whose voice has since left
// the catalogue). Characters within a book are matched one at a time so each
// can avoid voices already used in that book.
// Usage: node scripts/assignCharacterVoices.js [--dry-run] [--book <bookId>]
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const Character = require('../models/characterModel');
const { VOICES, assignVoice } = require('../services/characterVoices');

const dryRun = process.argv.includes('--dry-run');
const bookFlag = process.argv.indexOf('--book');
const bookId = bookFlag > -1 ? process.argv[bookFlag + 1] : null;

async function run() {
  await mongoose.connect(process.env.ATLAS_URI, { dbName: 'talkingbooks' });

  // No voice yet, or one that's no longer in the catalogue.
  const filter = { voice: { $nin: VOICES.map(v => v.id) }, ...(bookId ? { bookId } : {}) };
  const characters = await Character.find(filter).sort({ bookId: 1 });
  console.log(`${characters.length} character(s) without a usable voice${dryRun ? ' (dry run)' : ''}`);

  for (const character of characters) {
    const name = [character.firstName, character.lastName].filter(Boolean).join(' ');
    if (dryRun) {
      console.log(`  ${character._id} ${name}`);
      continue;
    }
    const voice = await assignVoice(character);
    console.log(`  ${name} -> ${voice} (${character.voiceReason})`);
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
