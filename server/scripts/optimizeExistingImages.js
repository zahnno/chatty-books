/**
 * Script to optimize existing images in S3 bucket
 * 
 * This script:
 * 1. Lists all images in S3 bucket
 * 2. Downloads each image
 * 3. Optimizes it using Sharp
 * 4. Uploads optimized version (replaces original or creates backup)
 * 5. Optionally updates database records with new URLs
 * 
 * Usage:
 *   node server/scripts/optimizeExistingImages.js [options]
 * 
 * Options:
 *   --dry-run          Show what would be done without making changes
 *   --backup           Keep original files with .backup extension
 *   --update-db        Update database records with new URLs
 *   --batch-size=N     Process N images at a time (default: 10)
 *   --max-images=N     Limit to N images (useful for testing)
 *   --skip-existing    Skip images that are already WebP
 *   --pattern=PATTERN  Only process files matching pattern (e.g., "character-*")
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
const { optimizeImage } = require('../services/imageOptimization');
const Book = require('../models/bookModel');
const Character = require('../models/characterModel');
const Page = require('../models/pageModel');
const ImageGeneration = require('../models/imageGenerationModel');
const User = require('../models/userModel');
const AWS = require('aws-sdk');

// Initialize S3 with explicit credentials check
function initializeS3() {
  const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_ACCESS_SECRET || process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    console.error('❌ AWS credentials not found!');
    console.error('   Please set one of the following:');
    console.error('   - S3_ACCESS_KEY and S3_ACCESS_SECRET');
    console.error('   - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  AWS.config.update({
    accessKeyId,
    secretAccessKey,
    region
  });

  const s3 = new AWS.S3();
  
  // Test credentials by attempting to list bucket
  console.log('🔐 AWS credentials found');
  console.log(`   Access Key ID: ${accessKeyId.substring(0, 8)}...`);
  console.log(`   Region: ${region}`);
  console.log(`   Bucket: talkingbooks\n`);

  return s3;
}

const s3 = initializeS3();

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  backup: args.includes('--backup'),
  updateDb: args.includes('--update-db'),
  skipExisting: args.includes('--skip-existing'),
  batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '10'),
  maxImages: parseInt(args.find(arg => arg.startsWith('--max-images='))?.split('=')[1] || null),
  pattern: args.find(arg => arg.startsWith('--pattern='))?.split('=')[1] || null
};

// Statistics
const stats = {
  total: 0,
  processed: 0,
  optimized: 0,
  skipped: 0,
  errors: 0,
  sizeReduction: 0,
  dbUpdated: 0
};

/**
 * Get optimization settings based on file key pattern
 */
function getOptimizationSettings(key) {
  if (key.includes('character-')) {
    return { maxWidth: 1920, maxHeight: 1920, quality: 90, format: 'webp' };
  } else if (key.includes('book-') || key.includes('cover')) {
    return { maxWidth: 1200, maxHeight: 1800, quality: 90, format: 'webp' };
  } else if (key.includes('scene-') || key.includes('page-')) {
    return { maxWidth: 1920, maxHeight: 1080, quality: 85, format: 'webp' };
  } else if (key.includes('profile-')) {
    return { maxWidth: 800, maxHeight: 800, quality: 85, format: 'webp' };
  }
  // Default settings
  return { maxWidth: 1920, maxHeight: 1080, quality: 85, format: 'webp' };
}

/**
 * Check if file is already optimized (WebP format)
 */
function isAlreadyOptimized(key) {
  return key.toLowerCase().endsWith('.webp');
}

/**
 * Extract S3 key from URL
 */
function extractKeyFromUrl(url) {
  if (!url) return null;
  try {
    // Handle both S3 URLs and CloudFront URLs
    const urlObj = new URL(url);
    // Remove leading slash from pathname
    return urlObj.pathname.substring(1);
  } catch (e) {
    // If it's already a key, return as is
    return url;
  }
}

/**
 * Process a single image
 */
async function processImage(key, originalSize) {
  try {
    // Skip if already optimized and skip-existing flag is set
    if (options.skipExisting && isAlreadyOptimized(key)) {
      stats.skipped++;
      console.log(`⏭️  Skipping already optimized: ${key}`);
      return { success: true, skipped: true };
    }

    // Download image from S3
    const getObjectParams = {
      Bucket: 'talkingbooks',
      Key: key
    };

    const s3Object = await s3.getObject(getObjectParams).promise();
    const imageBuffer = s3Object.Body;

    // Get optimization settings based on file type
    const settings = getOptimizationSettings(key);
    
    // Optimize image
    const optimizedBuffer = await optimizeImage(imageBuffer, settings);
    const newSize = optimizedBuffer.length;
    const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);

    // Skip if optimization didn't reduce size significantly (less than 5%)
    if (newSize >= originalSize * 0.95) {
      stats.skipped++;
      console.log(`⏭️  Skipping (no significant reduction): ${key} (${reduction}% reduction)`);
      return { success: true, skipped: true };
    }

    if (options.dryRun) {
      console.log(`🔍 [DRY RUN] Would optimize: ${key}`);
      console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB`);
      console.log(`   Optimized: ${(newSize / 1024).toFixed(2)} KB`);
      console.log(`   Reduction: ${reduction}%`);
      stats.optimized++;
      stats.sizeReduction += (originalSize - newSize);
      return { success: true, dryRun: true, originalSize, newSize };
    }

    // Determine new key (replace extension with .webp)
    const keyWithoutExt = key.replace(/\.[^/.]+$/, '');
    const newKey = `${keyWithoutExt}.webp`;

    // Backup original if requested
    if (options.backup && key !== newKey) {
      const backupKey = `${key}.backup`;
      await s3.copyObject({
        Bucket: 'talkingbooks',
        CopySource: `talkingbooks/${key}`,
        Key: backupKey
      }).promise();
      console.log(`💾 Backed up: ${backupKey}`);
    }

    // Upload optimized image
    const uploadParams = {
      Bucket: 'talkingbooks',
      Key: newKey,
      Body: optimizedBuffer,
      ContentType: 'image/webp',
      CacheControl: 'max-age=31536000'
    };

    await s3.upload(uploadParams).promise();

    // Delete original if we created a new file
    if (key !== newKey) {
      await s3.deleteObject({
        Bucket: 'talkingbooks',
        Key: key
      }).promise();
    }

    stats.optimized++;
    stats.sizeReduction += (originalSize - newSize);
    
    console.log(`✅ Optimized: ${key} → ${newKey}`);
    console.log(`   ${(originalSize / 1024).toFixed(2)} KB → ${(newSize / 1024).toFixed(2)} KB (${reduction}% reduction)`);

    return { 
      success: true, 
      originalKey: key, 
      newKey, 
      originalSize, 
      newSize,
      originalUrl: `https://talkingbooks.s3.amazonaws.com/${key}`,
      newUrl: `https://talkingbooks.s3.amazonaws.com/${newKey}`
    };

  } catch (error) {
    stats.errors++;
    console.error(`❌ Error processing ${key}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Retry a database operation with exponential backoff
 */
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      // Check if it's a connection error
      if (error.message.includes('connection') || 
          error.message.includes('timeout') || 
          error.message.includes('ECONNRESET') ||
          error.message.includes('closed')) {
        const waitTime = delay * Math.pow(2, attempt - 1);
        console.log(`      ⚠️  Connection error (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Try to reconnect if connection is closed
        if (mongoose.connection.readyState !== 1) {
          console.log(`      🔄 Reconnecting to MongoDB...`);
          try {
            const mongoUri = process.env.ATLAS_URI || process.env.MONGODB_URI || process.env.MONGO_URI;
            await mongoose.connect(mongoUri);
            console.log(`      ✅ Reconnected`);
          } catch (reconnectError) {
            console.log(`      ❌ Reconnection failed: ${reconnectError.message}`);
          }
        }
      } else {
        throw error; // Not a connection error, don't retry
      }
    }
  }
}

/**
 * Update database records with new URLs
 */
async function updateDatabaseRecords(results) {
  if (!options.updateDb) return;

  console.log('\n📝 Updating database records...');
  
  // Filter to only successful optimizations
  const validResults = results.filter(r => r.success && !r.skipped && !r.dryRun && r.originalKey !== r.newKey);
  console.log(`   Found ${validResults.length} optimized images to update in database\n`);

  if (validResults.length === 0) {
    console.log('   ⚠️  No database updates needed (all images skipped or already optimized)');
    return;
  }

  // Process in smaller batches to avoid overwhelming MongoDB
  const batchSize = 5;
  for (let batchStart = 0; batchStart < validResults.length; batchStart += batchSize) {
    const batch = validResults.slice(batchStart, batchStart + batchSize);
    console.log(`\n   Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(validResults.length / batchSize)} (${batch.length} images)...`);

    for (let i = 0; i < batch.length; i++) {
      const result = batch[i];
      const oldUrl = result.originalUrl;
      const newUrl = result.newUrl;
      const originalKey = result.originalKey;

      // Try multiple URL formats that might be in the database
      const oldUrlVariations = [
        oldUrl, // https://talkingbooks.s3.amazonaws.com/key
        oldUrl.replace('s3.amazonaws.com', 's3.us-east-1.amazonaws.com'), // Regional URL
        `https://talkingbooks.s3.us-east-1.amazonaws.com/${originalKey}`, // Direct regional
        `https://s3.amazonaws.com/talkingbooks/${originalKey}`, // Alternative format
        `https://s3.us-east-1.amazonaws.com/talkingbooks/${originalKey}`, // Regional alternative
        originalKey, // Just the key itself
      ];

      console.log(`\n   [${i + 1}/${batch.length}] Processing: ${originalKey}`);
      console.log(`      Old URL: ${oldUrl}`);
      console.log(`      New URL: ${newUrl}`);

      try {
        let totalUpdated = 0;

      // Update Books - try all URL variations
      for (const oldUrlVar of oldUrlVariations) {
        try {
          const booksUpdated = await retryOperation(async () => {
            return await Book.updateMany(
              { image_url: oldUrlVar },
              { $set: { image_url: newUrl } }
            );
          });
          if (booksUpdated.modifiedCount > 0) {
            totalUpdated += booksUpdated.modifiedCount;
            console.log(`      ✓ Updated ${booksUpdated.modifiedCount} book(s) using URL: ${oldUrlVar.substring(0, 60)}...`);
          }
        } catch (error) {
          // Skip this URL variation if it fails
        }
      }
      // Also try regex match on key
      try {
        const escapedKey = originalKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const booksRegex = await retryOperation(async () => {
          return await Book.updateMany(
            { image_url: { $regex: escapedKey } },
            { $set: { image_url: newUrl } }
          );
        });
        if (booksRegex.modifiedCount > 0) {
          totalUpdated += booksRegex.modifiedCount;
          console.log(`      ✓ Updated ${booksRegex.modifiedCount} book(s) using regex match`);
        }
      } catch (error) {
        // Skip regex match if it fails
      }

      // Update Characters - try all URL variations
      for (const oldUrlVar of oldUrlVariations) {
        try {
          const charactersUpdated = await retryOperation(async () => {
            return await Character.updateMany(
              { image_url: oldUrlVar },
              { $set: { image_url: newUrl } }
            );
          });
          if (charactersUpdated.modifiedCount > 0) {
            totalUpdated += charactersUpdated.modifiedCount;
            console.log(`      ✓ Updated ${charactersUpdated.modifiedCount} character(s) using URL: ${oldUrlVar.substring(0, 60)}...`);
          }
        } catch (error) {
          // Skip this URL variation if it fails
        }
      }
      try {
        const escapedKey = originalKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const charactersRegex = await retryOperation(async () => {
          return await Character.updateMany(
            { image_url: { $regex: escapedKey } },
            { $set: { image_url: newUrl } }
          );
        });
        if (charactersRegex.modifiedCount > 0) {
          totalUpdated += charactersRegex.modifiedCount;
          console.log(`      ✓ Updated ${charactersRegex.modifiedCount} character(s) using regex match`);
        }
      } catch (error) {
        // Skip regex match if it fails
      }

      // Update Pages - try all URL variations
      for (const oldUrlVar of oldUrlVariations) {
        try {
          const pagesUpdated = await retryOperation(async () => {
            return await Page.updateMany(
              { image_url: oldUrlVar },
              { $set: { image_url: newUrl } }
            );
          });
          if (pagesUpdated.modifiedCount > 0) {
            totalUpdated += pagesUpdated.modifiedCount;
            console.log(`      ✓ Updated ${pagesUpdated.modifiedCount} page(s) using URL: ${oldUrlVar.substring(0, 60)}...`);
          }
        } catch (error) {
          // Skip this URL variation if it fails
        }
      }
      try {
        const escapedKey = originalKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pagesRegex = await retryOperation(async () => {
          return await Page.updateMany(
            { image_url: { $regex: escapedKey } },
            { $set: { image_url: newUrl } }
          );
        });
        if (pagesRegex.modifiedCount > 0) {
          totalUpdated += pagesRegex.modifiedCount;
          console.log(`      ✓ Updated ${pagesRegex.modifiedCount} page(s) using regex match`);
        }
      } catch (error) {
        // Skip regex match if it fails
      }

      // Update ImageGeneration - try all URL variations
      for (const oldUrlVar of oldUrlVariations) {
        try {
          const imagesUpdated = await retryOperation(async () => {
            return await ImageGeneration.updateMany(
              { imageUrl: oldUrlVar },
              { $set: { imageUrl: newUrl } }
            );
          });
          if (imagesUpdated.modifiedCount > 0) {
            totalUpdated += imagesUpdated.modifiedCount;
            console.log(`      ✓ Updated ${imagesUpdated.modifiedCount} image generation(s) using URL: ${oldUrlVar.substring(0, 60)}...`);
          }
        } catch (error) {
          // Skip this URL variation if it fails
        }
      }
      try {
        const escapedKey = originalKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const imagesRegex = await retryOperation(async () => {
          return await ImageGeneration.updateMany(
            { imageUrl: { $regex: escapedKey } },
            { $set: { imageUrl: newUrl } }
          );
        });
        if (imagesRegex.modifiedCount > 0) {
          totalUpdated += imagesRegex.modifiedCount;
          console.log(`      ✓ Updated ${imagesRegex.modifiedCount} image generation(s) using regex match`);
        }
      } catch (error) {
        // Skip regex match if it fails
      }

      // Update Users (profile images) - try all URL variations
      for (const oldUrlVar of oldUrlVariations) {
        try {
          const usersUpdated = await retryOperation(async () => {
            return await User.updateMany(
              { profileImage: oldUrlVar },
              { $set: { profileImage: newUrl } }
            );
          });
          if (usersUpdated.modifiedCount > 0) {
            totalUpdated += usersUpdated.modifiedCount;
            console.log(`      ✓ Updated ${usersUpdated.modifiedCount} user(s) using URL: ${oldUrlVar.substring(0, 60)}...`);
          }
        } catch (error) {
          // Skip this URL variation if it fails
        }
      }
      try {
        const escapedKey = originalKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const usersRegex = await retryOperation(async () => {
          return await User.updateMany(
            { profileImage: { $regex: escapedKey } },
            { $set: { profileImage: newUrl } }
          );
        });
        if (usersRegex.modifiedCount > 0) {
          totalUpdated += usersRegex.modifiedCount;
          console.log(`      ✓ Updated ${usersRegex.modifiedCount} user(s) using regex match`);
        }
      } catch (error) {
        // Skip regex match if it fails
      }

      if (totalUpdated > 0) {
        stats.dbUpdated += totalUpdated;
        console.log(`      ✅ Total: ${totalUpdated} record(s) updated`);
      } else {
        console.log(`      ⚠️  No matching records found in database`);
      }

      // Small delay between images to avoid overwhelming MongoDB
      if (i < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

    } catch (error) {
      console.error(`      ❌ Error updating database for ${oldUrl}:`, error.message);
      // Continue with next image even if this one fails
    }
    }

    // Delay between batches to give MongoDB time to recover
    if (batchStart + batchSize < validResults.length) {
      console.log(`   Waiting 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

/**
 * List all images in S3 bucket
 */
async function listAllImages() {
  const images = [];
  let continuationToken = null;

  do {
    const params = {
      Bucket: 'talkingbooks',
      MaxKeys: 1000
    };

    if (continuationToken) {
      params.ContinuationToken = continuationToken;
    }

    const response = await s3.listObjectsV2(params).promise();

    for (const object of response.Contents || []) {
      const key = object.Key;
      const size = object.Size;

      // Filter by pattern if provided
      if (options.pattern && !key.includes(options.pattern.replace('*', ''))) {
        continue;
      }

      // Only process image files
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
      const isImage = imageExtensions.some(ext => key.toLowerCase().endsWith(ext));
      
      if (isImage) {
        images.push({ key, size });
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return images;
}

/**
 * Process images in batches
 */
async function processBatch(batch) {
  const batchResults = await Promise.all(
    batch.map(({ key, size }) => processImage(key, size))
  );
  stats.processed += batch.length;
  return batchResults;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting image optimization script...\n');
  console.log('Options:', JSON.stringify(options, null, 2));
  console.log('');

  // Connect to MongoDB if updating database
  if (options.updateDb) {
    try {
      // Try multiple common MongoDB URI environment variable names
      const mongoUri = process.env.ATLAS_URI || 
                       process.env.MONGODB_URI || 
                       process.env.MONGO_URI;
      
      if (!mongoUri) {
        console.error('❌ MongoDB URI not found!');
        console.error('   Please set one of the following in config.env:');
        console.error('   - ATLAS_URI');
        console.error('   - MONGODB_URI');
        console.error('   - MONGO_URI');
        process.exit(1);
      }
      
      await mongoose.connect(mongoUri, {
        dbName: 'talkingbooks' // Explicitly set database name like the app does
      });
      console.log('✅ Connected to MongoDB\n');
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      if (options.updateDb) {
        console.error('   Cannot update database without connection. Exiting.');
        process.exit(1);
      }
    }
  }

  try {
    // Test S3 access first
    console.log('🔍 Testing S3 access...');
    try {
      await s3.headBucket({ Bucket: 'talkingbooks' }).promise();
      console.log('✅ S3 bucket access confirmed\n');
    } catch (error) {
      if (error.code === 'AccessDenied' || error.statusCode === 403) {
        console.error('\n❌ ACCESS DENIED: Insufficient S3 permissions');
        console.error('\nRequired IAM permissions:');
        console.error('  - s3:ListBucket (on bucket: talkingbooks)');
        console.error('  - s3:GetObject (on bucket: talkingbooks)');
        console.error('  - s3:PutObject (on bucket: talkingbooks)');
        console.error('  - s3:DeleteObject (on bucket: talkingbooks)');
        console.error('  - s3:CopyObject (on bucket: talkingbooks)');
        console.error('\nExample IAM policy:');
        console.error(`
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:CopyObject"
      ],
      "Resource": [
        "arn:aws:s3:::talkingbooks",
        "arn:aws:s3:::talkingbooks/*"
      ]
    }
  ]
}
        `);
        process.exit(1);
      } else {
        throw error;
      }
    }

    // List all images
    console.log('📋 Listing images in S3 bucket...');
    let images = await listAllImages();
    stats.total = images.length;
    console.log(`   Found ${images.length} images\n`);

    // Limit images if max-images is set
    if (options.maxImages && images.length > options.maxImages) {
      images = images.slice(0, options.maxImages);
      console.log(`   Limiting to ${options.maxImages} images for testing\n`);
    }

    if (images.length === 0) {
      console.log('✅ No images to process');
      return;
    }

    // Process in batches
    const results = [];
    for (let i = 0; i < images.length; i += options.batchSize) {
      const batch = images.slice(i, i + options.batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(images.length / options.batchSize)} (${batch.length} images)...`);
      
      const batchResults = await processBatch(batch);
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming S3
      if (i + options.batchSize < images.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Update database if requested
    if (options.updateDb && !options.dryRun) {
      await updateDatabaseRecords(results);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total images found:     ${stats.total}`);
    console.log(`Images processed:       ${stats.processed}`);
    console.log(`Images optimized:       ${stats.optimized}`);
    console.log(`Images skipped:         ${stats.skipped}`);
    console.log(`Errors:                 ${stats.errors}`);
    console.log(`Size reduction:         ${(stats.sizeReduction / 1024 / 1024).toFixed(2)} MB`);
    if (options.updateDb) {
      console.log(`Database records updated: ${stats.dbUpdated}`);
    }
    console.log('='.repeat(60));

    if (options.dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('   Run without --dry-run to apply optimizations.');
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

module.exports = { main, processImage, listAllImages };
