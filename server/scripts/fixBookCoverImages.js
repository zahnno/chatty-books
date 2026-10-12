/**
 * Script to fix broken book cover image URLs in database
 * 
 * This script:
 * 1. Finds all Book records with missing or broken cover image URLs
 * 2. Checks if the files exist in S3
 * 3. If not found, tries to find the WebP version
 * 4. Updates database records with correct URLs
 * 5. Provides detailed reporting with book titles and authors
 * 
 * Usage:
 *   node server/scripts/fixBookCoverImages.js [options]
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

// Load Book model
const Book = require('../models/bookModel');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  fixAll: args.includes('--fix-all')
};

const stats = {
  total: 0,
  checked: 0,
  missingUrl: 0,
  invalidUrl: 0,
  broken: 0,
  fixed: 0,
  notFound: 0,
  externalUrl: 0,
  public: 0,
  private: 0,
  featured: 0
};

/**
 * Check if URL is an S3 URL
 */
function isS3Url(url) {
  if (!url) return false;
  return url.includes('talkingbooks.s3.amazonaws.com') || 
         url.includes('s3.amazonaws.com/talkingbooks') ||
         (!url.startsWith('http') && !url.includes('://'));
}

/**
 * Extract S3 key from URL
 */
function extractKeyFromUrl(url) {
  if (!url) return null;
  
  try {
    // Handle full S3 URLs
    if (url.startsWith('http')) {
      const urlObj = new URL(url);
      // Extract key from pathname (remove leading slash)
      let key = urlObj.pathname.substring(1);
      // Decode URL-encoded characters
      try {
        key = decodeURIComponent(key);
      } catch (e) {
        // If decoding fails, use original
      }
      return key;
    }
    // Already a key
    return url;
  } catch (e) {
    // If parsing fails, try to extract key manually
    const match = url.match(/talkingbooks[\/\.](.+)$/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch (e) {
        return match[1];
      }
    }
    return url;
  }
}

/**
 * Generate alternative key variations to try
 */
function generateKeyVariations(key) {
  const variations = [key]; // Original key
  
  // Try URL-decoded version if it contains % encoding
  if (key.includes('%')) {
    try {
      variations.push(decodeURIComponent(key));
    } catch (e) {
      // Ignore decode errors
    }
  }
  
  // Try URL-encoded version if it contains spaces
  if (key.includes(' ')) {
    variations.push(encodeURIComponent(key));
  }
  
  // Try with spaces replaced by %20
  if (key.includes(' ')) {
    variations.push(key.replace(/ /g, '%20'));
  }
  
  // Try with %20 replaced by spaces
  if (key.includes('%20')) {
    variations.push(key.replace(/%20/g, ' '));
  }
  
  // Remove duplicates
  return [...new Set(variations)];
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
 * Try to find file with alternative key variations
 */
async function findFileWithVariations(key) {
  const variations = generateKeyVariations(key);
  
  for (const variation of variations) {
    if (await fileExists(variation)) {
      return variation;
    }
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
 * Main execution
 */
async function main() {
  console.log('🔍 Starting book cover image fix script...\n');
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
    // Get all books
    const allBooks = await Book.find({}).lean();
    stats.total = allBooks.length;
    
    console.log(`📚 Found ${stats.total} books in database\n`);
    console.log('Analyzing book cover images...\n');

    const booksToFix = [];
    const booksWithIssues = [];

    for (let i = 0; i < allBooks.length; i++) {
      const book = allBooks[i];
      
      // Track book properties
      if (book.is_public) stats.public++;
      else stats.private++;
      if (book.is_featured) stats.featured++;

      // Check for missing URL
      if (!book.image_url || book.image_url.trim() === '') {
        stats.missingUrl++;
        booksWithIssues.push({
          book,
          issue: 'missing',
          title: book.title || 'Untitled',
          author: book.author || 'Unknown Author'
        });
        console.log(`⚠️  Missing cover: "${book.title || 'Untitled'}" by ${book.author || 'Unknown Author'}`);
        console.log(`   Book ID: ${book._id}`);
        continue;
      }

      // Skip external URLs (like Google Books API)
      if (!isS3Url(book.image_url)) {
        stats.externalUrl++;
        // Don't log these as errors - they're external URLs that we can't fix
        continue;
      }

      // Check if URL is valid and extract S3 key
      const key = extractKeyFromUrl(book.image_url);
      if (!key) {
        stats.invalidUrl++;
        booksWithIssues.push({
          book,
          issue: 'invalid',
          title: book.title || 'Untitled',
          author: book.author || 'Unknown Author'
        });
        console.log(`❌ Invalid URL format: "${book.title || 'Untitled'}" by ${book.author || 'Unknown Author'}`);
        console.log(`   Book ID: ${book._id}`);
        console.log(`   URL: ${book.image_url}`);
        continue;
      }

      stats.checked++;

      // Check if original file exists
      const originalExists = await fileExists(key);
      
      if (originalExists) {
        // File exists, no need to update
        continue;
      }

      // Original file doesn't exist, try variations
      stats.broken++;
      console.log(`🔍 Broken cover: "${book.title || 'Untitled'}" by ${book.author || 'Unknown Author'}`);
      console.log(`   Book ID: ${book._id}`);
      console.log(`   URL: ${book.image_url}`);
      console.log(`   Key: ${key}`);

      // Try to find file with key variations (different encoding, etc.)
      let foundKey = await findFileWithVariations(key);
      
      // If not found, try WebP versions
      if (!foundKey) {
        const variations = generateKeyVariations(key);
        for (const variation of variations) {
          const keyWithoutExt = variation.replace(/\.[^/.]+$/, '');
          const webpKey = `${keyWithoutExt}.webp`;
          
          if (await fileExists(webpKey)) {
            foundKey = webpKey;
            break;
          }
        }
      }
      
      if (foundKey) {
        // Found an alternative (variation or WebP)
        const newUrl = getUrlFromKey(foundKey);
        booksToFix.push({
          book,
          oldUrl: book.image_url,
          oldKey: key,
          newUrl,
          newKey: foundKey,
          title: book.title || 'Untitled',
          author: book.author || 'Unknown Author'
        });
        console.log(`   ✅ Found alternative: ${foundKey}`);
      } else {
        // Not found in S3
        stats.notFound++;
        booksWithIssues.push({
          book,
          issue: 'not_found',
          title: book.title || 'Untitled',
          author: book.author || 'Unknown Author'
        });
        console.log(`   ⚠️  File not found in S3 (tried variations and WebP)`);
      }

      // Small delay to avoid overwhelming S3
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Fix broken URLs
    if (booksToFix.length > 0) {
      console.log(`\n🔧 Fixing ${booksToFix.length} broken book cover URLs...\n`);
      
      for (const item of booksToFix) {
        if (options.dryRun) {
          console.log(`[DRY RUN] Would update "${item.title}" by ${item.author}:`);
          console.log(`   Book ID: ${item.book._id}`);
          console.log(`   Old: ${item.oldUrl}`);
          console.log(`   New: ${item.newUrl}`);
        } else {
          try {
            await Book.updateOne(
              { _id: item.book._id },
              { $set: { image_url: item.newUrl } }
            );
            stats.fixed++;
            console.log(`✅ Fixed "${item.title}" by ${item.author}`);
            console.log(`   Book ID: ${item.book._id}`);
          } catch (error) {
            console.error(`❌ Error fixing "${item.title}":`, error.message);
          }
        }
      }
    } else {
      console.log(`\n✅ No broken URLs found that can be fixed`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total books:            ${stats.total}`);
    console.log(`Book breakdown:`);
    console.log(`  - Public:             ${stats.public}`);
    console.log(`  - Private:            ${stats.private}`);
    console.log(`  - Featured:           ${stats.featured}`);
    console.log(`Cover image status:`);
    console.log(`  - External URLs (skipped): ${stats.externalUrl}`);
    console.log(`  - S3 URLs checked:        ${stats.checked}`);
    console.log(`  - Missing URL:             ${stats.missingUrl}`);
    console.log(`  - Invalid URL format:      ${stats.invalidUrl}`);
    console.log(`  - Broken URL:              ${stats.broken}`);
    console.log(`Actions taken:`);
    console.log(`  - URLs fixed:              ${stats.fixed}`);
    console.log(`  - Not found in S3:         ${stats.notFound}`);
    console.log('='.repeat(60));

    if (booksWithIssues.length > 0 && stats.fixed === 0) {
      console.log(`\n⚠️  Found ${booksWithIssues.length} books with cover image issues:`);
      console.log(`   - ${stats.missingUrl} missing cover images`);
      console.log(`   - ${stats.invalidUrl} invalid URL formats`);
      console.log(`   - ${stats.notFound} broken URLs with no WebP alternative`);
    }

    if (options.dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('   Run without --dry-run to apply fixes.');
    } else if (stats.fixed > 0) {
      console.log(`\n✅ Successfully fixed ${stats.fixed} broken book cover URLs!`);
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

