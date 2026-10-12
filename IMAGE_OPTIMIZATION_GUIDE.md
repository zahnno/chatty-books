# Image Optimization Guide

This guide outlines the image optimization strategies implemented and recommended for improving image loading performance.

## ✅ Implemented Optimizations

### 1. Client-Side Lazy Loading
- **LazyImage Component**: Created a reusable component that uses Intersection Observer API to load images only when they enter the viewport
- **Background Image Support**: Supports lazy loading for CSS background images
- **Placeholder Loading**: Shows a placeholder while images load
- **Smooth Transitions**: Fade-in effect when images load

**Components Updated:**
- `CommunityImagesSection.js` - Background images now lazy load
- `Gallery.js` - Gallery grid images lazy load
- `bookPage.js` - Book covers, character images, and gallery images lazy load
- `ImageViewer.js` - Main image viewer (immediate load for UX)

### 2. Intersection Observer Configuration
- **Root Margin**: 50px - Starts loading images 50px before they enter viewport
- **Threshold**: 0.01 - Triggers as soon as 1% of image is visible
- **Performance**: Uses native browser API for efficient viewport detection

## 🚀 Recommended Next Steps

### 1. Install Sharp for Server-Side Optimization

```bash
cd server
npm install sharp
```

### 2. Update Image Upload Routes

Update your image upload routes to use the new optimization service:

**Example for character image generation:**
```javascript
const { uploadOptimizedImage } = require('../services/imageOptimization');

// In your route handler:
const imageBuffer = Buffer.from(result.generatedImages[0].image.imageBytes, 'base64');
const filename = `character-${character._id}-${Date.now()}`;

const uploadResult = await uploadOptimizedImage(imageBuffer, filename, {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 85,
  format: 'webp',
  generateResponsive: true // Optional: generates thumb, medium, large sizes
});

character.image_url = uploadResult.mainUrl;
```

**Example for book cover upload:**
```javascript
const { uploadOptimizedImage } = require('../services/imageOptimization');

// In your upload handler:
const imageBuffer = imageFile.buffer;
const filename = `book-${book._id}-${Date.now()}`;

const uploadResult = await uploadOptimizedImage(imageBuffer, filename, {
  maxWidth: 1200,
  maxHeight: 1800,
  quality: 90,
  format: 'webp'
});

book.image_url = uploadResult.mainUrl;
```

### 3. Set Up AWS CloudFront CDN

**Why CloudFront?**
- Reduces latency by serving images from edge locations closer to users
- Reduces S3 bandwidth costs
- Provides better caching and compression

**Steps:**
1. Go to AWS CloudFront Console
2. Create a new distribution
3. Set origin to your S3 bucket (`talkingbooks`)
4. Configure caching behaviors:
   - Default TTL: 31536000 (1 year)
   - Forward headers: None (for better caching)
5. Update your image URLs to use CloudFront domain instead of direct S3 URLs

**Update S3 upload to return CloudFront URL:**
```javascript
const CLOUDFRONT_DOMAIN = 'https://d1234567890.cloudfront.net';

// After upload:
const cloudFrontUrl = uploadResult.Location.replace(
  'https://talkingbooks.s3.amazonaws.com',
  CLOUDFRONT_DOMAIN
);
```

### 4. Implement Responsive Images (Optional)

If you generate responsive sizes, update your LazyImage component to use `srcset`:

```javascript
// In LazyImage component, if responsiveUrls are available:
<img
  src={image.mainUrl}
  srcSet={`
    ${image.responsiveUrls['-thumb']} 400w,
    ${image.responsiveUrls['-medium']} 800w,
    ${image.responsiveUrls['-large']} 1920w
  `}
  sizes="(max-width: 400px) 400px, (max-width: 800px) 800px, 1920px"
  ...
/>
```

### 5. Add Image Dimensions

Prevent layout shift by specifying image dimensions:

```javascript
<LazyImage
  src={image.imageUrl}
  alt={image.alt}
  width={800}
  height={600}
  style={{ aspectRatio: '4/3' }}
/>
```

### 6. Browser Caching Headers

Ensure your S3 bucket or CloudFront has proper cache headers:
- `Cache-Control: max-age=31536000` (1 year)
- `Expires` header set appropriately

## 📊 Expected Performance Improvements

### Before Optimization:
- **Initial Load**: All images load immediately (~5-10MB)
- **Time to Interactive**: 5-10 seconds
- **Bandwidth**: High, especially on mobile

### After Optimization:
- **Initial Load**: Only visible images load (~500KB-1MB)
- **Time to Interactive**: 1-2 seconds
- **Bandwidth**: Reduced by 60-80%
- **Image Size**: Reduced by 70-90% (WebP vs PNG)

## 🔧 Configuration Options

### LazyImage Component Options:
- `skipLazy`: Set to `true` for above-the-fold images that should load immediately
- `placeholder`: Custom placeholder image/data URL
- `backgroundImage`: Use for CSS background images
- `onLoad`: Callback when image loads

### Image Optimization Options:
- `maxWidth/maxHeight`: Maximum dimensions (maintains aspect ratio)
- `quality`: 1-100 (85 is recommended balance)
- `format`: 'webp' (best compression), 'jpeg', or 'png'
- `generateResponsive`: Generate multiple sizes for responsive loading

## 📝 Migration Checklist

- [x] Create LazyImage component
- [x] Update Gallery component
- [x] Update CommunityImagesSection component
- [x] Update bookPage component
- [x] Update ImageViewer component
- [ ] Install sharp package (`npm install sharp` in server directory)
- [ ] Update image upload routes to use optimization
- [ ] Set up CloudFront CDN
- [ ] Update image URLs to use CloudFront domain
- [ ] Test image loading performance
- [ ] Monitor bandwidth usage reduction

## 🐛 Troubleshooting

**Images not lazy loading:**
- Check browser console for Intersection Observer errors
- Verify images are not using `skipLazy={true}`
- Ensure images are not already in viewport on initial render

**Optimized images look blurry:**
- Increase quality setting (try 90-95)
- Check if original images are high resolution
- Consider using responsive sizes for different viewports

**CloudFront not working:**
- Verify distribution is deployed and active
- Check origin path matches S3 bucket name
- Ensure CloudFront has permissions to access S3 bucket

## 📚 Additional Resources

- [Web.dev Image Optimization](https://web.dev/fast/#optimize-your-images)
- [Sharp Documentation](https://sharp.pixelplumbing.com/)
- [AWS CloudFront Best Practices](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/best-practices.html)
- [Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
