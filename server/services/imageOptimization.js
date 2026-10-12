const sharp = require('sharp');
const { s3 } = require('./cloud-services');

/**
 * Image optimization service for compressing and resizing images before upload to S3
 * 
 * Usage:
 * const optimizedBuffer = await optimizeImage(imageBuffer, {
 *   maxWidth: 1920,
 *   maxHeight: 1080,
 *   quality: 85,
 *   format: 'webp' // or 'jpeg', 'png'
 * });
 */

/**
 * Optimize an image buffer
 * @param {Buffer} imageBuffer - The image buffer to optimize
 * @param {Object} options - Optimization options
 * @param {number} options.maxWidth - Maximum width (default: 1920)
 * @param {number} options.maxHeight - Maximum height (default: 1080)
 * @param {number} options.quality - JPEG/WebP quality 1-100 (default: 85)
 * @param {string} options.format - Output format: 'webp', 'jpeg', 'png' (default: 'webp')
 * @param {boolean} options.progressive - Use progressive encoding for JPEG (default: true)
 * @returns {Promise<Buffer>} Optimized image buffer
 */
async function optimizeImage(imageBuffer, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 85,
    format = 'webp',
    progressive = true
  } = options;

  try {
    let pipeline = sharp(imageBuffer)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });

    // Apply format-specific optimizations
    switch (format.toLowerCase()) {
      case 'webp':
        pipeline = pipeline.webp({ quality, effort: 6 });
        break;
      case 'jpeg':
      case 'jpg':
        pipeline = pipeline.jpeg({ 
          quality, 
          progressive,
          mozjpeg: true // Better compression
        });
        break;
      case 'png':
        pipeline = pipeline.png({ 
          quality,
          compressionLevel: 9,
          adaptiveFiltering: true
        });
        break;
      default:
        // Keep original format but still resize
        break;
    }

    return await pipeline.toBuffer();
  } catch (error) {
    console.error('Error optimizing image:', error);
    throw error;
  }
}

/**
 * Generate multiple sizes of an image for responsive loading
 * @param {Buffer} imageBuffer - The original image buffer
 * @param {Array<Object>} sizes - Array of size configurations [{width, height, suffix}]
 * @returns {Promise<Array<{buffer: Buffer, suffix: string, width: number, height: number}>>}
 */
async function generateResponsiveSizes(imageBuffer, sizes = [
  { width: 400, height: 400, suffix: '-thumb' },
  { width: 800, height: 800, suffix: '-medium' },
  { width: 1920, height: 1920, suffix: '-large' }
]) {
  const results = await Promise.all(
    sizes.map(async ({ width, height, suffix }) => {
      const buffer = await optimizeImage(imageBuffer, {
        maxWidth: width,
        maxHeight: height,
        format: 'webp'
      });
      
      return { buffer, suffix, width, height };
    })
  );

  return results;
}

/**
 * Upload optimized image to S3 with optional responsive sizes
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {string} baseKey - Base S3 key (filename without extension)
 * @param {Object} options - Upload and optimization options
 * @returns {Promise<Object>} Upload results with URLs
 */
async function uploadOptimizedImage(imageBuffer, baseKey, options = {}) {
  const {
    generateResponsive = false,
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 85,
    format = 'webp'
  } = options;

  const extension = format === 'webp' ? 'webp' : format === 'jpeg' || format === 'jpg' ? 'jpg' : 'png';
  
  try {
    // Optimize main image
    const optimizedBuffer = await optimizeImage(imageBuffer, {
      maxWidth,
      maxHeight,
      quality,
      format
    });

    const mainKey = `${baseKey}.${extension}`;
    
    // Upload main image
    const uploadParams = {
      Bucket: 'talkingbooks',
      Key: mainKey,
      Body: optimizedBuffer,
      ContentType: `image/${extension}`,
      CacheControl: 'max-age=31536000', // 1 year cache
    };

    const uploadResult = await s3.upload(uploadParams).promise();

    const result = {
      mainUrl: uploadResult.Location,
      mainKey,
      responsiveUrls: {}
    };

    // Generate and upload responsive sizes if requested
    if (generateResponsive) {
      const responsiveSizes = await generateResponsiveSizes(imageBuffer);
      
      const responsiveUploads = await Promise.all(
        responsiveSizes.map(async ({ buffer, suffix }) => {
          const responsiveKey = `${baseKey}${suffix}.webp`;
          const params = {
            Bucket: 'talkingbooks',
            Key: responsiveKey,
            Body: buffer,
            ContentType: 'image/webp',
            CacheControl: 'max-age=31536000',
          };
          
          const upload = await s3.upload(params).promise();
          return { suffix, url: upload.Location, key: responsiveKey };
        })
      );

      responsiveUploads.forEach(({ suffix, url }) => {
        result.responsiveUrls[suffix] = url;
      });
    }

    return result;
  } catch (error) {
    console.error('Error uploading optimized image:', error);
    throw error;
  }
}

module.exports = {
  optimizeImage,
  generateResponsiveSizes,
  uploadOptimizedImage
};
