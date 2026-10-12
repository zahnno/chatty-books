/**
 * Script to fix broken image URLs by checking what the gallery API returns
 * 
 * This script:
 * 1. Queries the gallery API endpoint (same as frontend)
 * 2. Checks each imageUrl against S3
 * 3. Finds WebP versions if PNG/JPG don't exist
 * 4. Updates database records directly
 * 
 * Usage:
 *   node server/scripts/fixGalleryImageUrls.js [options]
 * 
 * Options:
 *   --dry-run          Show what would be fixed without making changes
 */

// Load environment variables from config.env (or .env as fallback)
const path = require('path');
const fs = require('fs');

const configEnvPath = path.join(__dirname, '../config.env');
if (fs.existsSync(configEnvPath)) {
  require('dotenv').config({ path: configEnvPath });
  console.log('📄 Loaded environment from config.env\n');
} else {
  require('dotenv').config();
  console.log('📄 Loaded environment from .env\n');
}

const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const ImageGeneration = require('../models/imageGenerationModel');

// Initialize S3
function initializeS3() {
  const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_ACCESS_SECRET || process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    console.error('❌ AWS credentials not found!');
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

const options = {
  dryRun: process.argv.includes('--dry-run')
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
    if (url.startsWith('http')) {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1);
    }
    return url;
  } catch (e) {
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
 * Try to find WebP version
 */
async function findWebPVersion(originalKey) {
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
 * Process records from direct collection access
 */
async function processDirectRecords(records) {
  const recordsToFix = [];

  // Check each image URL
  for (let i = 0; i < records.length; i++) {
    const image = records[i];
    const imageUrl = image.imageUrl;
    
    if (!imageUrl) {
      console.log(`⚠️  Missing URL: ${image._id}`);
      continue;
    }

    stats.checked++;
    const key = extractKeyFromUrl(imageUrl);
    
    if (!key) {
      console.log(`❌ Invalid URL format: ${image._id} - ${imageUrl}`);
      continue;
    }

    const exists = await fileExists(key);
    
    if (!exists) {
      stats.broken++;
      console.log(`\n🔍 Broken URL found:`);
      console.log(`   ID: ${image._id}`);
      console.log(`   URL: ${imageUrl}`);
      console.log(`   Key: ${key}`);

      // Try to find WebP version
      const webpKey = await findWebPVersion(key);
      
      if (webpKey) {
        const newUrl = getUrlFromKey(webpKey);
        recordsToFix.push({
          id: image._id,
          oldUrl: imageUrl,
          oldKey: key,
          newUrl,
          newKey: webpKey
        });
        console.log(`   ✅ Found WebP: ${webpKey}`);
      } else {
        stats.notFound++;
        console.log(`   ⚠️  WebP version not found in S3`);
      }
    }

    // Small delay every 10 images
    if (i % 10 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Fix broken URLs
  if (recordsToFix.length > 0) {
    console.log(`\n🔧 Fixing ${recordsToFix.length} broken URLs...\n`);
    
    for (const item of recordsToFix) {
      if (options.dryRun) {
        console.log(`[DRY RUN] Would update ${item.id}:`);
        console.log(`   Old: ${item.oldUrl}`);
        console.log(`   New: ${item.newUrl}`);
      } else {
        try {
          await mongoose.connection.db.collection('imagegenerations').updateOne(
            { _id: item.id },
            { $set: { imageUrl: item.newUrl } }
          );
          stats.fixed++;
          console.log(`✅ Fixed ${item.id}`);
        } catch (error) {
          console.error(`❌ Error fixing ${item.id}:`, error.message);
        }
      }
    }
  } else {
    console.log(`\n✅ No broken URLs found!`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Checking gallery images and fixing broken URLs...\n');

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
    console.log('✅ Connected to MongoDB');
    console.log(`   Database: ${mongoose.connection.db.databaseName}\n`);
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }

  try {
    // Query exactly like the gallery does
    console.log('📋 Querying ImageGeneration records (same as gallery)...\n');
    
    const allImages = await ImageGeneration.find({
      status: 'completed',
      characterId: { $exists: false }
    }).lean();
    
    console.log(`Found ${allImages.length} completed images (no characterId)\n`);
    
    if (allImages.length === 0) {
      console.log('⚠️  No images found via model. Checking collection directly...');
      
      // Query collection directly
      const directCollection = mongoose.connection.db.collection('imagegenerations');
      const directCount = await directCollection.countDocuments({});
      console.log(`   Direct collection count: ${directCount} records\n`);
      
      if (directCount > 0) {
        console.log('✅ Found records in collection! Querying directly...\n');
        
        // Get all records from collection directly
        const directRecords = await directCollection.find({
          status: 'completed',
          characterId: { $exists: false }
        }).toArray();
        
        console.log(`Found ${directRecords.length} completed images (no characterId) via direct query\n`);
        
        if (directRecords.length === 0) {
          // Try without filters
          const allDirect = await directCollection.find({}).limit(5).toArray();
          console.log(`   Sample records from collection:`);
          allDirect.forEach((rec, idx) => {
            console.log(`   ${idx + 1}. ID: ${rec._id}, Status: ${rec.status}, imageUrl: ${rec.imageUrl ? 'exists' : 'missing'}`);
          });
          return;
        }
        
        // Process direct records
        await processDirectRecords(directRecords);
        return;
      }
      
      // List collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log(`\n   Available collections:`);
      collections.forEach(col => {
        console.log(`     - ${col.name}`);
      });
      
      return;
    }

    const recordsToFix = [];

    // Check each image URL
    for (let i = 0; i < allImages.length; i++) {
      const image = allImages[i];
      const imageUrl = image.imageUrl;
      
      if (!imageUrl) {
        console.log(`⚠️  Missing URL: ${image._id}`);
        continue;
      }

      stats.checked++;
      const key = extractKeyFromUrl(imageUrl);
      
      if (!key) {
        console.log(`❌ Invalid URL format: ${image._id} - ${imageUrl}`);
        continue;
      }

      const exists = await fileExists(key);
      
      if (!exists) {
        stats.broken++;
        console.log(`\n🔍 Broken URL found:`);
        console.log(`   ID: ${image._id}`);
        console.log(`   URL: ${imageUrl}`);
        console.log(`   Key: ${key}`);

        // Try to find WebP version
        const webpKey = await findWebPVersion(key);
        
        if (webpKey) {
          const newUrl = getUrlFromKey(webpKey);
          recordsToFix.push({
            id: image._id,
            oldUrl: imageUrl,
            oldKey: key,
            newUrl,
            newKey: webpKey
          });
          console.log(`   ✅ Found WebP: ${webpKey}`);
        } else {
          stats.notFound++;
          console.log(`   ⚠️  WebP version not found in S3`);
        }
      }

      // Small delay every 10 images
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Fix broken URLs
    if (recordsToFix.length > 0) {
      console.log(`\n🔧 Fixing ${recordsToFix.length} broken URLs...\n`);
      
      for (const item of recordsToFix) {
        if (options.dryRun) {
          console.log(`[DRY RUN] Would update ${item.id}:`);
          console.log(`   Old: ${item.oldUrl}`);
          console.log(`   New: ${item.newUrl}`);
        } else {
          try {
            await ImageGeneration.updateOne(
              { _id: item.id },
              { $set: { imageUrl: item.newUrl } }
            );
            stats.fixed++;
            console.log(`✅ Fixed ${item.id}`);
          } catch (error) {
            console.error(`❌ Error fixing ${item.id}:`, error.message);
          }
        }
      }
    } else {
      console.log(`\n✅ No broken URLs found!`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Images checked:         ${stats.checked}`);
    console.log(`Broken URLs found:      ${stats.broken}`);
    console.log(`URLs fixed:             ${stats.fixed}`);
    console.log(`WebP not found:         ${stats.notFound}`);
    console.log('='.repeat(60));

    if (options.dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('   Run without --dry-run to apply fixes.');
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

module.exports = { main };

