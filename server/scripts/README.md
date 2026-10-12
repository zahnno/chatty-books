# Image Optimization Scripts

## optimizeExistingImages.js

Optimizes existing images in your S3 bucket by compressing and converting them to WebP format.

### Usage

```bash
# Dry run (see what would happen without making changes)
npm run optimize-images:dry-run

# Test with first 5 images
npm run optimize-images:test

# Optimize all images (with backup)
node scripts/optimizeExistingImages.js --backup --update-db

# Optimize all images (replace originals)
node scripts/optimizeExistingImages.js --update-db

# Optimize specific pattern
node scripts/optimizeExistingImages.js --pattern="character-*" --update-db

# Process in smaller batches (useful for large buckets)
node scripts/optimizeExistingImages.js --batch-size=5 --update-db
```

### Options

- `--dry-run` - Show what would be done without making changes
- `--backup` - Keep original files with `.backup` extension
- `--update-db` - Update database records (Books, Characters, Pages, ImageGeneration, Users) with new URLs
- `--batch-size=N` - Process N images at a time (default: 10)
- `--max-images=N` - Limit to N images (useful for testing)
- `--skip-existing` - Skip images that are already WebP format
- `--pattern=PATTERN` - Only process files matching pattern (e.g., "character-*")

### Examples

**Safe first run (dry run with backup):**
```bash
node scripts/optimizeExistingImages.js --dry-run --backup --max-images=10
```

**Optimize character images only:**
```bash
node scripts/optimizeExistingImages.js --pattern="character-" --backup --update-db
```

**Full optimization with database updates:**
```bash
node scripts/optimizeExistingImages.js --backup --update-db --batch-size=5
```

### What It Does

1. Lists all images in the S3 bucket (`talkingbooks`)
2. Downloads each image
3. Optimizes it based on file type:
   - Character images: 1920x1920, quality 90
   - Book covers: 1200x1800, quality 90
   - Scene/page images: 1920x1080, quality 85
   - Profile images: 800x800, quality 85
4. Converts to WebP format
5. Uploads optimized version
6. Deletes original (unless `--backup` is used)
7. Optionally updates database records with new URLs

### Safety Features

- Dry run mode to preview changes
- Backup option to keep originals
- Batch processing to avoid overwhelming S3
- Skips images that are already optimized
- Skips images where optimization doesn't reduce size significantly (<5%)
- Error handling for individual images (continues processing on errors)

### Expected Results

- **File size reduction**: 70-90% smaller files
- **Format**: All images converted to WebP
- **Quality**: Maintained based on image type
- **Database**: URLs updated automatically (if `--update-db` is used)

### Notes

- The script processes images in batches to avoid rate limiting
- Original files are deleted unless `--backup` is used
- Database updates only happen if `--update-db` flag is provided
- The script can be interrupted and resumed (though it will reprocess images)
- Make sure you have Sharp installed: `npm install sharp`

### Troubleshooting

**Error: AccessDenied (403)**
This means your AWS IAM user doesn't have the necessary S3 permissions. See [S3_PERMISSIONS.md](./S3_PERMISSIONS.md) for detailed instructions on setting up the required permissions.

**Error: Cannot find module 'sharp'**
```bash
cd server
npm install sharp
```

**Error: MongoDB connection failed**
- Make sure MongoDB is running
- Check your `.env` file has `MONGODB_URI` or `MONGO_URI` set
- Or run without `--update-db` flag to skip database updates

**Error: AWS credentials not found**
Make sure your `.env` file has:
```env
S3_ACCESS_KEY=your_access_key_id
S3_ACCESS_SECRET=your_secret_access_key
AWS_REGION=us-east-1
```

**Script is slow**
- Reduce batch size: `--batch-size=5`
- Process specific patterns: `--pattern="character-*"`
- Limit images for testing: `--max-images=10`