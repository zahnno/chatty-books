/**
 * Script to fix broken image URLs in database
 * 
 * This script:
 * 1. Finds all image URLs in the database
 * 2. Checks if the files exist in S3
 * 3. If not found, tries to find the WebP version
 * 4. Updates database records with correct URLs
 * 
 * Usage:
 *   node server/scripts/fixBrokenImageUrls.js [options]
 * 
 * Options:
 *   --dry-run          Show what would be fixed without making changes
 *   --fix-all          Fix all broken URLs automatically
 */

// Load environment variables from config.env (or .env as fallback)
const path = require('path');
const fs = require('fs');

// Try config.env first (common in this project)
const configEnvPath = path.join(__dirname, '../config.env');
if (fs.existsSync(configEnvPath)) {
  require('dotenv').config({ path: configEnvPath });
  console.log('📄 Loaded environment from config.env\n');
} else {
  // Fallback to .env
  require('dotenv').config();
  console.log('📄 Loaded environment from .env\n');
}

const mongoose = require('mongoose');
const AWS = require('aws-sdk');

// Initialize S3
function initializeS3() {
  const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_ACCESS_SECRET || process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    console.error('❌ AWS credentials not found!');
    console.error('   Please check your config.env file has:');
    console.error('   - S3_ACCESS_KEY');
    console.error('   - S3_ACCESS_SECRET');
    process.exit(1);
  }

  AWS.config.update({
    accessKeyId,
    secretAccessKey,
    region
  });

  return new AWS.S3();
}

const s3 = initializeS3();

// Load models
const Book = require('../models/bookModel');
const Character = require('../models/characterModel');
const Page = require('../models/pageModel');
const ImageGeneration = require('../models/imageGenerationModel');
const User = require('../models/userModel');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  fixAll: args.includes('--fix-all')
};

const stats = {
  checked: 0,
  broken: 0,
  fixed: 0,
  notFound: 0
};

/**
 * Extract S3 key from URL
 */
function extractKeyFromUrl(url) {
  if (!url) return null;
  
  try {
    // Handle full URLs
    if (url.startsWith('http')) {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // Remove leading slash
    }
    // Already a key
    return url;
  } catch (e) {
    // If parsing fails, try to extract key manually
    const match = url.match(/talkingbooks\/(.+)$/);
    return match ? match[1] : url;
  }
}

/**
 * Check if file exists in S3
 */
async function fileExists(key) {
  try {
    await s3.headObject({
      Bucket: 'talkingbooks',
      Key: key
    }).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound' || error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Try to find WebP version of a file
 */
async function findWebPVersion(originalKey) {
  // Remove extension and add .webp
  const keyWithoutExt = originalKey.replace(/\.[^/.]+$/, '');
  const webpKey = `${keyWithoutExt}.webp`;
  
  if (await fileExists(webpKey)) {
    return webpKey;
  }
  
  return null;
}

/**
 * Get full URL from S3 key
 */
function getUrlFromKey(key) {
  return `https://talkingbooks.s3.amazonaws.com/${key}`;
}

/**
 * Check and fix URLs in a collection
 */
async function checkAndFixCollection(Model, fieldName, collectionName) {
  console.log(`\n📋 Checking ${collectionName}...`);
  
  const docs = await Model.find({ [fieldName]: { $exists: true, $ne: null, $ne: '' } }).lean();
  console.log(`   Found ${docs.length} records with ${fieldName}`);
  
  const broken = [];
  
  for (const doc of docs) {
    const url = doc[fieldName];
    const key = extractKeyFromUrl(url);
    
    if (!key) {
      console.log(`   ⚠️  Invalid URL format: ${url}`);
      continue;
    }
    
    stats.checked++;
    
    const exists = await fileExists(key);
    
    if (!exists) {
      stats.broken++;
      console.log(`   ❌ Broken: ${key}`);
      
      // Try to find WebP version
      const webpKey = await findWebPVersion(key);
      
      if (webpKey) {
        const newUrl = getUrlFromKey(webpKey);
        broken.push({
          id: doc._id,
          oldUrl: url,
          oldKey: key,
          newUrl,
          newKey: webpKey
        });
        console.log(`      ✅ Found WebP version: ${webpKey}`);
      } else {
        stats.notFound++;
        console.log(`      ⚠️  WebP version not found`);
      }
    }
  }
  
  // Fix broken URLs
  if (broken.length > 0) {
    console.log(`\n   🔧 Fixing ${broken.length} broken URLs...`);
    
    for (const item of broken) {
      if (options.dryRun) {
        console.log(`   [DRY RUN] Would update ${collectionName} ${item.id}:`);
        console.log(`      Old: ${item.oldUrl}`);
        console.log(`      New: ${item.newUrl}`);
      } else {
        try {
          await Model.updateOne(
            { _id: item.id },
            { $set: { [fieldName]: item.newUrl } }
          );
          stats.fixed++;
          console.log(`   ✅ Fixed ${collectionName} ${item.id}`);
        } catch (error) {
          console.error(`   ❌ Error fixing ${collectionName} ${item.id}:`, error.message);
        }
      }
    }
  } else {
    console.log(`   ✅ No broken URLs found`);
  }
  
  return broken.length;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Starting broken image URL fix script...\n');
  console.log('Options:', JSON.stringify(options, null, 2));
  console.log('');

  // Connect to MongoDB
  try {
    const mongoUri = process.env.ATLAS_URI || 
                     process.env.MONGODB_URI || 
                     process.env.MONGO_URI;
    
    if (!mongoUri) {
      console.error('❌ MongoDB URI not found!');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      w: 'majority',
      dbName: 'talkingbooks' // Explicitly set database name like the app does
    });
    console.log('✅ Connected to MongoDB\n');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }

  try {
    // Check all collections
    await checkAndFixCollection(Book, 'image_url', 'Books');
    await checkAndFixCollection(Character, 'image_url', 'Characters');
    await checkAndFixCollection(Page, 'image_url', 'Pages');
    await checkAndFixCollection(ImageGeneration, 'imageUrl', 'ImageGeneration');
    await checkAndFixCollection(User, 'profileImage', 'Users');

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`URLs checked:        ${stats.checked}`);
    console.log(`Broken URLs found:   ${stats.broken}`);
    console.log(`URLs fixed:          ${stats.fixed}`);
    console.log(`Not found in S3:     ${stats.notFound}`);
    console.log('='.repeat(60));

    if (options.dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('   Run without --dry-run to apply fixes.');
    } else if (stats.fixed > 0) {
      console.log(`\n✅ Successfully fixed ${stats.fixed} broken image URLs!`);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n✅ MongoDB connection closed');
    }
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { main, checkAndFixCollection, findWebPVersion };

