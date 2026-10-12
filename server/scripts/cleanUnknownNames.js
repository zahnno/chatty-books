const mongoose = require('mongoose');
const Character = require('../models/characterModel');
require('dotenv').config({ path: "./config.env" });

const cleanCharacterName = (character) => {
  let changes = {
    firstNameChanged: false,
    lastNameChanged: false,
    originalFirstName: character.firstName,
    originalLastName: character.lastName,
    newFirstName: character.firstName,
    newLastName: character.lastName
  };

  // Check if firstName is 'unknown' (case insensitive)
  if (character.firstName && character.firstName.toLowerCase().trim() === 'unknown') {
    changes.firstNameChanged = true;
    changes.newFirstName = null;
  }

  // Check if lastName is 'unknown' (case insensitive)
  if (character.lastName && character.lastName.toLowerCase().trim() === 'unknown') {
    changes.lastNameChanged = true;
    changes.newLastName = null;
  }

  return changes;
};

const cleanAllUnknownNames = async () => {
  try {
    console.log('Starting character name cleanup...');
    
    // Get all characters
    const characters = await Character.find({});
    
    if (characters.length === 0) {
      console.log('No characters found in the database.');
      return;
    }
    
    console.log(`Found ${characters.length} characters to analyze.`);
    
    let processed = 0;
    let firstNameChanges = 0;
    let lastNameChanges = 0;
    let totalChanges = 0;
    
    const changedCharacters = [];
    
    for (const character of characters) {
      try {
        const analysis = cleanCharacterName(character);
        
        // Only process if there are changes to make
        if (analysis.firstNameChanged || analysis.lastNameChanged) {
          const updateFields = {};
          
          if (analysis.firstNameChanged) {
            updateFields.firstName = null;
            firstNameChanges++;
          }
          
          if (analysis.lastNameChanged) {
            updateFields.lastName = null;
            lastNameChanges++;
          }
          
          // Update the character in the database
          await Character.findByIdAndUpdate(character._id, updateFields);
          
          console.log(`🔄 Updated: ${analysis.originalFirstName || '[null]'} ${analysis.originalLastName || '[null]'}`);
          if (analysis.firstNameChanged) {
            console.log(`   First name: "${analysis.originalFirstName}" → null`);
          }
          if (analysis.lastNameChanged) {
            console.log(`   Last name: "${analysis.originalLastName}" → null`);
          }
          console.log('');
          
          changedCharacters.push({
            originalFirstName: analysis.originalFirstName,
            originalLastName: analysis.originalLastName,
            firstNameChanged: analysis.firstNameChanged,
            lastNameChanged: analysis.lastNameChanged
          });
          
          totalChanges++;
        }
        
        processed++;
        
      } catch (error) {
        console.error(`❌ Error processing ${character.firstName} ${character.lastName}:`, error.message);
      }
    }
    
    console.log('📊 Summary:');
    console.log(`Total characters processed: ${processed}`);
    console.log(`Characters with name changes: ${totalChanges}`);
    console.log(`First names changed to null: ${firstNameChanges}`);
    console.log(`Last names changed to null: ${lastNameChanges}`);
    
    if (changedCharacters.length === 0) {
      console.log('✅ No characters found with "unknown" names. Database is clean!');
    } else {
      console.log('\n📝 Characters that were updated:');
      changedCharacters.forEach((char, index) => {
        const changes = [];
        if (char.firstNameChanged) changes.push('firstName');
        if (char.lastNameChanged) changes.push('lastName');
        console.log(`   ${index + 1}. "${char.originalFirstName || '[null]'} ${char.originalLastName || '[null]'}" - ${changes.join(', ')} set to null`);
      });
    }
    
    console.log('\nCharacter name cleanup completed!');
    
  } catch (error) {
    console.error('Error during character name cleanup:', error);
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
      return cleanAllUnknownNames();
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

module.exports = { cleanAllUnknownNames, cleanCharacterName }; 