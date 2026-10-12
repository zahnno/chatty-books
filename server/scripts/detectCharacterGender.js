const mongoose = require('mongoose');
const Character = require('../models/characterModel');
require('dotenv').config({ path: "./config.env" });

// Gender indicators
const MALE_INDICATORS = {
  pronouns: ['he', 'him', 'his'],
  titles: ['mr', 'mister', 'sir', 'lord', 'king', 'prince', 'duke', 'baron', 'father', 'brother', 'son', 'uncle', 'grandfather', 'nephew', 'husband', 'boyfriend'],
  terms: ['man', 'boy', 'male', 'gentleman', 'guy', 'dude', 'fellow', 'lad']
};

const FEMALE_INDICATORS = {
  pronouns: ['she', 'her', 'hers'],
  titles: ['ms', 'mrs', 'miss', 'madam', 'lady', 'queen', 'princess', 'duchess', 'baroness', 'mother', 'sister', 'daughter', 'aunt', 'grandmother', 'niece', 'wife', 'girlfriend'],
  terms: ['woman', 'girl', 'female', 'lady', 'gal', 'lass']
};

// Common gendered names (basic list)
const MALE_NAMES = [
  'john', 'james', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'christopher',
  'charles', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'frank', 'alexander', 'patrick', 'raymond', 'jack', 'dennis', 'jerry', 'tyler',
  'aaron', 'henry', 'douglas', 'nathan', 'peter', 'noah', 'ethan', 'arthur', 'sean', 'luke'
];

const FEMALE_NAMES = [
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'nancy', 'lisa', 'betty', 'helen', 'sandra', 'donna', 'carol', 'ruth', 'sharon', 'michelle',
  'laura', 'sarah', 'kimberly', 'deborah', 'dorothy', 'lisa', 'nancy', 'karen', 'betty', 'helen',
  'sandra', 'donna', 'carol', 'ruth', 'sharon', 'michelle', 'laura', 'sarah', 'kimberly', 'deborah',
  'amy', 'angela', 'brenda', 'emma', 'olivia', 'cynthia', 'marie', 'janet', 'catherine', 'frances',
  'christine', 'samantha', 'debra', 'rachel', 'carolyn', 'janet', 'virginia', 'maria', 'heather', 'diane'
];

const analyzeTextForGender = (text) => {
  if (!text) return { male: 0, female: 0 };
  
  const lowerText = text.toLowerCase();
  let maleScore = 0;
  let femaleScore = 0;
  
  // Check for pronouns (higher weight)
  MALE_INDICATORS.pronouns.forEach(pronoun => {
    const matches = (lowerText.match(new RegExp(`\\b${pronoun}\\b`, 'g')) || []).length;
    maleScore += matches * 3; // Higher weight for pronouns
  });
  
  FEMALE_INDICATORS.pronouns.forEach(pronoun => {
    const matches = (lowerText.match(new RegExp(`\\b${pronoun}\\b`, 'g')) || []).length;
    femaleScore += matches * 3; // Higher weight for pronouns
  });
  
  // Check for titles and terms (medium weight)
  MALE_INDICATORS.titles.forEach(title => {
    if (lowerText.includes(title)) maleScore += 2;
  });
  
  MALE_INDICATORS.terms.forEach(term => {
    const matches = (lowerText.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;
    maleScore += matches * 2;
  });
  
  FEMALE_INDICATORS.titles.forEach(title => {
    if (lowerText.includes(title)) femaleScore += 2;
  });
  
  FEMALE_INDICATORS.terms.forEach(term => {
    const matches = (lowerText.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;
    femaleScore += matches * 2;
  });
  
  return { male: maleScore, female: femaleScore };
};

const analyzeNameForGender = (firstName) => {
  if (!firstName) return { male: 0, female: 0 };
  
  const lowerName = firstName.toLowerCase();
  
  if (MALE_NAMES.includes(lowerName)) {
    return { male: 4, female: 0 }; // Strong indicator
  }
  
  if (FEMALE_NAMES.includes(lowerName)) {
    return { male: 0, female: 4 }; // Strong indicator
  }
  
  // Check for name endings
  if (lowerName.endsWith('a') || lowerName.endsWith('ia') || lowerName.endsWith('ine')) {
    return { male: 0, female: 1 }; // Weak indicator
  }
  
  return { male: 0, female: 0 };
};

const detectCharacterGender = (character) => {
  let totalMaleScore = 0;
  let totalFemaleScore = 0;
  
  // Analyze name
  const nameAnalysis = analyzeNameForGender(character.firstName);
  totalMaleScore += nameAnalysis.male;
  totalFemaleScore += nameAnalysis.female;
  
  // Analyze all text fields
  const textFields = [
    character.intro,
    character.description,
    character.events,
    character.appearance,
    ...(character.personalityTraits || []),
    ...(character.strengths || []),
    ...(character.weaknesses || []),
    ...(character.goals || [])
  ];
  
  textFields.forEach(field => {
    const analysis = analyzeTextForGender(field);
    totalMaleScore += analysis.male;
    totalFemaleScore += analysis.female;
  });
  
  // Determine gender based on scores
  if (totalMaleScore > totalFemaleScore && totalMaleScore > 0) {
    return {
      gender: 'male',
      confidence: Math.min(100, Math.round((totalMaleScore / (totalMaleScore + totalFemaleScore)) * 100)),
      maleScore: totalMaleScore,
      femaleScore: totalFemaleScore
    };
  } else if (totalFemaleScore > totalMaleScore && totalFemaleScore > 0) {
    return {
      gender: 'female',
      confidence: Math.min(100, Math.round((totalFemaleScore / (totalMaleScore + totalFemaleScore)) * 100)),
      maleScore: totalMaleScore,
      femaleScore: totalFemaleScore
    };
  } else {
    return {
      gender: 'unknown',
      confidence: 0,
      maleScore: totalMaleScore,
      femaleScore: totalFemaleScore
    };
  }
};

const detectAllCharacterGenders = async () => {
  try {
    console.log('Starting character gender detection...');
    
    // Get all characters
    const characters = await Character.find({});
    
    if (characters.length === 0) {
      console.log('No characters found in the database.');
      return;
    }
    
    console.log(`Found ${characters.length} characters to analyze.`);
    
    let processed = 0;
    let maleCount = 0;
    let femaleCount = 0;
    let unknownCount = 0;
    
    const results = [];
    
    for (const character of characters) {
      try {
        const analysis = detectCharacterGender(character);
        
        console.log(`👤 ${character.firstName} ${character.lastName}:`);
        console.log(`   Detected: ${analysis.gender} (${analysis.confidence}% confidence)`);
        console.log(`   Scores: Male=${analysis.maleScore}, Female=${analysis.femaleScore}`);
        
        // Update character with gender field
        await Character.findByIdAndUpdate(character._id, { 
          gender: analysis.gender,
        });
        
        results.push({
          name: `${character.firstName} ${character.lastName}`,
          ...analysis
        });
        
        if (analysis.gender === 'male') maleCount++;
        else if (analysis.gender === 'female') femaleCount++;
        else unknownCount++;
        
        processed++;
        
      } catch (error) {
        console.error(`❌ Error processing ${character.firstName} ${character.lastName}:`, error.message);
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`Total characters processed: ${processed}`);
    console.log(`Male characters: ${maleCount}`);
    console.log(`Female characters: ${femaleCount}`);
    console.log(`Unknown gender: ${unknownCount}`);
    
    // Show low confidence detections
    const lowConfidence = results.filter(r => r.confidence > 0 && r.confidence < 70);
    if (lowConfidence.length > 0) {
      console.log('\n⚠️  Low confidence detections (review recommended):');
      lowConfidence.forEach(result => {
        console.log(`   ${result.name}: ${result.gender} (${result.confidence}%)`);
      });
    }
    
    // Show unknown genders
    const unknownGenders = results.filter(r => r.gender === 'unknown');
    if (unknownGenders.length > 0) {
      console.log('\n❓ Characters with unknown gender:');
      unknownGenders.forEach(result => {
        console.log(`   ${result.name}`);
      });
    }
    
    console.log('\nCharacter gender detection completed!');
    
  } catch (error) {
    console.error('Error during character gender detection:', error);
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
      return detectAllCharacterGenders();
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

module.exports = { detectAllCharacterGenders, detectCharacterGender };