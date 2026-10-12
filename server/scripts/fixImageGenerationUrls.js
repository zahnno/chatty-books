/**
 * Script to fix ImageGeneration records with missing or invalid image URLs
 * 
 * This script:
 * 1. Finds ImageGeneration records with missing/invalid image URLs
 * 2. Checks their status (processing, completed, failed)
 * 3. Validates URLs point to existing S3 files
 * 4. Optionally cleans up failed/stale records
 * 
 * Usage:
 *   node server/scripts/fixImageGenerationUrls.js [options]
 * 
 * Options:
 *   --dry-run          Show what would be fixed without making changes
 *   --clean-failed     Remove records with failed status and no image
 *   --clean-stale      Remove records older than 7 days with no image
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
const ImageGeneration = require('../models/imageGenerationModel');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  cleanFailed: args.includes('--clean-failed'),
  cleanStale: args.includes('--clean-stale')
};

const stats = {
  total: 0,
  missingUrl: 0,
  invalidUrl: 0,
  brokenUrl: 0,
  processing: 0,
  failed: 0,
  completed: 0,
  fixed: 0,
  cleaned: 0
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
 * Try to find WebP version of a file
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
async function processDirectRecords(records, collectionName = 'imagegenerations') {
  console.log('Analyzing records from direct collection...\n');

  const recordsToFix = [];
  const recordsToClean = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    
    // Track status
    if (record.status === 'processing') stats.processing++;
    else if (record.status === 'failed') stats.failed++;
    else if (record.status === 'completed') stats.completed++;

    // Check for missing URL
    if (!record.imageUrl || record.imageUrl.trim() === '') {
      stats.missingUrl++;
      
      if (record.status === 'failed') {
        recordsToClean.push({ record, reason: 'failed status with no image' });
      } else if (record.status === 'processing') {
        console.log(`⏳ Processing: ${record._id} (status: ${record.status})`);
      } else if (record.createdAt && new Date(record.createdAt) < sevenDaysAgo) {
        recordsToClean.push({ record, reason: 'stale record (>7 days) with no image' });
      } else {
        console.log(`⚠️  Missing URL: ${record._id} (status: ${record.status})`);
      }
      continue;
    }

    // Check if URL is valid
    const key = extractKeyFromUrl(record.imageUrl);
    if (!key) {
      stats.invalidUrl++;
      console.log(`❌ Invalid URL format: ${record._id} - ${record.imageUrl}`);
      continue;
    }

    // Check if file exists
    const exists = await fileExists(key);
    
    if (!exists) {
      stats.brokenUrl++;
      console.log(`🔍 Broken URL: ${record._id}`);
      console.log(`   URL: ${record.imageUrl}`);
      console.log(`   Key: ${key}`);
      console.log(`   Status: ${record.status}`);

      // Try to find WebP version
      const webpKey = await findWebPVersion(key);
      
      if (webpKey) {
        const newUrl = getUrlFromKey(webpKey);
        recordsToFix.push({
          record,
          oldUrl: record.imageUrl,
          newUrl,
          reason: 'found WebP version'
        });
        console.log(`   ✅ Found WebP: ${webpKey}`);
      } else {
        console.log(`   ⚠️  WebP version not found`);
        
        if (record.status === 'failed') {
          recordsToClean.push({ record, reason: 'failed status with broken URL' });
        } else if (record.createdAt && new Date(record.createdAt) < sevenDaysAgo) {
          recordsToClean.push({ record, reason: 'stale record (>7 days) with broken URL' });
        }
      }
    }

    // Small delay to avoid overwhelming S3
    if (i % 10 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Fix broken URLs
  if (recordsToFix.length > 0) {
    console.log(`\n🔧 Fixing ${recordsToFix.length} broken URLs...\n`);
    
    for (const item of recordsToFix) {
      if (options.dryRun) {
        console.log(`[DRY RUN] Would update ${item.record._id}:`);
        console.log(`   Old: ${item.oldUrl}`);
        console.log(`   New: ${item.newUrl}`);
      } else {
        try {
          await mongoose.connection.db.collection(collectionName).updateOne(
            { _id: item.record._id },
            { $set: { imageUrl: item.newUrl } }
          );
          stats.fixed++;
          console.log(`✅ Fixed ${item.record._id}`);
        } catch (error) {
          console.error(`❌ Error fixing ${item.record._id}:`, error.message);
        }
      }
    }
  }

  // Clean up failed/stale records
  if (recordsToClean.length > 0 && (options.cleanFailed || options.cleanStale)) {
    console.log(`\n🧹 Cleaning up ${recordsToClean.length} records...\n`);
    
    for (const item of recordsToClean) {
      if (options.dryRun) {
        console.log(`[DRY RUN] Would delete ${item.record._id}:`);
        console.log(`   Reason: ${item.reason}`);
        console.log(`   Status: ${item.record.status}`);
        console.log(`   Created: ${item.record.createdAt}`);
      } else {
        try {
          await mongoose.connection.db.collection(collectionName).deleteOne({ _id: item.record._id });
          stats.cleaned++;
          console.log(`🗑️  Deleted ${item.record._id} (${item.reason})`);
        } catch (error) {
          console.error(`❌ Error deleting ${item.record._id}:`, error.message);
        }
      }
    }
  } else if (recordsToClean.length > 0) {
    console.log(`\n⚠️  Found ${recordsToClean.length} records that could be cleaned up:`);
    console.log(`   Use --clean-failed to remove failed records`);
    console.log(`   Use --clean-stale to remove stale records (>7 days)`);
    console.log(`   Use both flags to clean all`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Analyzing ImageGeneration records...\n');
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
    console.log('✅ Connected to MongoDB');
    console.log(`   Database: ${mongoose.connection.db.databaseName}`);
    console.log(`   Host: ${mongoose.connection.host}\n`);
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }

  try {
    // First, check if model is working
    const totalCount = await ImageGeneration.countDocuments({});
    console.log(`📊 Total ImageGeneration records in database: ${totalCount}\n`);
    
    if (totalCount === 0) {
      console.log('⚠️  No records found. Checking available collections...');
      console.log('   Model name:', ImageGeneration.modelName);
      console.log('   Collection name:', ImageGeneration.collection.name);
      
      // List all collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log(`\n   Available collections:`);
      collections.forEach(col => {
        console.log(`     - ${col.name}`);
      });
      
      // Try different possible collection names
      const possibleNames = [
        'imagegenerations',
        'imageGenerations',
        'ImageGenerations',
        'image_generations',
        'image-generations'
      ];
      
      console.log(`\n   Checking alternative collection names...`);
      for (const name of possibleNames) {
        try {
          const count = await mongoose.connection.db.collection(name).countDocuments({});
          if (count > 0) {
            console.log(`   ✅ Found ${count} records in collection: ${name}`);
            
            // Query directly from collection
            const directRecords = await mongoose.connection.db.collection(name).find({}).toArray();
            stats.total = directRecords.length;
            console.log(`\n📊 Found ${stats.total} records via direct collection access (${name})\n`);
            
            // Process direct records
            await processDirectRecords(directRecords, name);
            return;
          }
        } catch (error) {
          // Collection doesn't exist, continue
        }
      }
      
      console.log(`\n   ❌ No records found in any collection.`);
      console.log(`   The gallery might be using a different data source or database.`);
    }
    
    // Get all ImageGeneration records
    const allRecords = await ImageGeneration.find({}).lean();
    stats.total = allRecords.length;
    
    console.log(`📊 Found ${stats.total} ImageGeneration records via model\n`);
    console.log('Analyzing records...\n');

    const recordsToFix = [];
    const recordsToClean = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < allRecords.length; i++) {
      const record = allRecords[i];
      
      // Track status
      if (record.status === 'processing') stats.processing++;
      else if (record.status === 'failed') stats.failed++;
      else if (record.status === 'completed') stats.completed++;

      // Check for missing URL
      if (!record.imageUrl || record.imageUrl.trim() === '') {
        stats.missingUrl++;
        
        if (record.status === 'failed') {
          recordsToClean.push({ record, reason: 'failed status with no image' });
        } else if (record.status === 'processing') {
          // Leave processing records alone
          console.log(`⏳ Processing: ${record._id} (status: ${record.status})`);
        } else if (record.createdAt && new Date(record.createdAt) < sevenDaysAgo) {
          recordsToClean.push({ record, reason: 'stale record (>7 days) with no image' });
        } else {
          console.log(`⚠️  Missing URL: ${record._id} (status: ${record.status})`);
        }
        continue;
      }

      // Check if URL is valid
      const key = extractKeyFromUrl(record.imageUrl);
      if (!key) {
        stats.invalidUrl++;
        console.log(`❌ Invalid URL format: ${record._id} - ${record.imageUrl}`);
        continue;
      }

      // Check if file exists
      const exists = await fileExists(key);
      
      if (!exists) {
        stats.brokenUrl++;
        console.log(`🔍 Broken URL: ${record._id}`);
        console.log(`   URL: ${record.imageUrl}`);
        console.log(`   Key: ${key}`);
        console.log(`   Status: ${record.status}`);

        // Try to find WebP version
        const webpKey = await findWebPVersion(key);
        
        if (webpKey) {
          const newUrl = getUrlFromKey(webpKey);
          recordsToFix.push({
            record,
            oldUrl: record.imageUrl,
            newUrl,
            reason: 'found WebP version'
          });
          console.log(`   ✅ Found WebP: ${webpKey}`);
        } else {
          console.log(`   ⚠️  WebP version not found`);
          
          // Mark for cleanup if failed or stale
          if (record.status === 'failed') {
            recordsToClean.push({ record, reason: 'failed status with broken URL' });
          } else if (record.createdAt && new Date(record.createdAt) < sevenDaysAgo) {
            recordsToClean.push({ record, reason: 'stale record (>7 days) with broken URL' });
          }
        }
      }

      // Small delay to avoid overwhelming S3
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Fix broken URLs
    if (recordsToFix.length > 0) {
      console.log(`\n🔧 Fixing ${recordsToFix.length} broken URLs...\n`);
      
      for (const item of recordsToFix) {
        if (options.dryRun) {
          console.log(`[DRY RUN] Would update ${item.record._id}:`);
          console.log(`   Old: ${item.oldUrl}`);
          console.log(`   New: ${item.newUrl}`);
        } else {
          try {
            await ImageGeneration.updateOne(
              { _id: item.record._id },
              { $set: { imageUrl: item.newUrl } }
            );
            stats.fixed++;
            console.log(`✅ Fixed ${item.record._id}`);
          } catch (error) {
            console.error(`❌ Error fixing ${item.record._id}:`, error.message);
          }
        }
      }
    }

    // Clean up failed/stale records
    if (recordsToClean.length > 0 && (options.cleanFailed || options.cleanStale)) {
      console.log(`\n🧹 Cleaning up ${recordsToClean.length} records...\n`);
      
      for (const item of recordsToClean) {
        if (options.dryRun) {
          console.log(`[DRY RUN] Would delete ${item.record._id}:`);
          console.log(`   Reason: ${item.reason}`);
          console.log(`   Status: ${item.record.status}`);
          console.log(`   Created: ${item.record.createdAt}`);
        } else {
          try {
            await ImageGeneration.deleteOne({ _id: item.record._id });
            stats.cleaned++;
            console.log(`🗑️  Deleted ${item.record._id} (${item.reason})`);
          } catch (error) {
            console.error(`❌ Error deleting ${item.record._id}:`, error.message);
          }
        }
      }
    } else if (recordsToClean.length > 0) {
      console.log(`\n⚠️  Found ${recordsToClean.length} records that could be cleaned up:`);
      console.log(`   Use --clean-failed to remove failed records`);
      console.log(`   Use --clean-stale to remove stale records (>7 days)`);
      console.log(`   Use both flags to clean all`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total records:           ${stats.total}`);
    console.log(`Status breakdown:`);
    console.log(`  - Processing:          ${stats.processing}`);
    console.log(`  - Completed:           ${stats.completed}`);
    console.log(`  - Failed:              ${stats.failed}`);
    console.log(`Issues found:`);
    console.log(`  - Missing URL:         ${stats.missingUrl}`);
    console.log(`  - Invalid URL format:  ${stats.invalidUrl}`);
    console.log(`  - Broken URL:          ${stats.brokenUrl}`);
    console.log(`Actions taken:`);
    console.log(`  - URLs fixed:          ${stats.fixed}`);
    console.log(`  - Records cleaned:     ${stats.cleaned}`);
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

