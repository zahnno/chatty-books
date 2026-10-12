require('dotenv').config({ path: "./config.env" });
const mongoose = require('mongoose');
const Character = require('../models/characterModel');
const Book = require('../models/bookModel');
const privateer = require('../services/privateerClient');

const regenerateCharacterIntro = async (character, book) => {
  try {
    const prompt = `Based on this character from the book "${book.title}":

Name: ${character.firstName} ${character.lastName}
Description: ${character.description}
Personality Traits: ${character.personalityTraits.join(', ')}
Appearance: ${character.appearance}
Events: ${character.events}

Generate a new intro quip for this character. The intro should be:
- A one-line introduction as if the character is speaking directly to the reader
- Under 50 words
- In the character's voice and personality
- Engaging and memorable
- Appropriate to their role in the story

Respond with ONLY the intro text, no quotes, no additional formatting or explanation.`;

    const { text } = await privateer.generateText(prompt);
    const newIntro = text.trim();
    
    // Remove any quotes that might have been added
    const cleanedIntro = newIntro.replace(/^["']|["']$/g, '');
    
    return cleanedIntro;
  } catch (error) {
    console.error(`Error generating intro for ${character.firstName} ${character.lastName}:`, error);
    throw error;
  }
};

const regenerateAllCharacterIntros = async () => {
  try {
    console.log('Starting character intro regeneration...');
    
    // Get all characters with their associated books
    const characters = await Character.find({}).populate('bookId');
    
    if (characters.length === 0) {
      console.log('No characters found in the database.');
      return;
    }
    
    console.log(`Found ${characters.length} characters to process.`);
    
    let processed = 0;
    let errors = 0;
    
    for (const character of characters) {
      try {
        if (!character.bookId) {
          console.log(`⚠️  Skipping character ${character.firstName} ${character.lastName} - no associated book`);
          continue;
        }
        
        console.log(`🔄 Processing: ${character.firstName} ${character.lastName} from "${character.bookId.title}"`);
        
        const newIntro = await regenerateCharacterIntro(character, character.bookId);
        
        // Update the character in the database
        await Character.findByIdAndUpdate(character._id, { intro: newIntro });
        
        console.log(`✅ Updated intro for ${character.firstName} ${character.lastName}`);
        console.log(`   Old intro: ${character.intro || 'None'}`);
        console.log(`   New intro: ${newIntro}`);
        console.log('');
        
        processed++;
        
        // Add a small delay to avoid hitting API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing ${character.firstName} ${character.lastName}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`Total characters processed: ${processed}`);
    console.log(`Errors encountered: ${errors}`);
    console.log('Character intro regeneration completed!');
    
  } catch (error) {
    console.error('Error during character intro regeneration:', error);
    throw error;
  }
};

// Run the script if this file is run directly
if (require.main === module) {
  mongoose.connect(process.env.ATLAS_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: 'talkingbooks'
  })
    .then(() => {
      console.log('Connected to MongoDB Atlas!');
      return regenerateAllCharacterIntros();
    })
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { regenerateAllCharacterIntros, regenerateCharacterIntro }; 