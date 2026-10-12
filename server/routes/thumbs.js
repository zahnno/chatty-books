// Resized copies of bucket images for grids and cards. CloudFront sends
// /thumb/* here and caches the result, so each thumbnail is made once per edge
// cache rather than per view. Clients build these URLs with thumbUrl() in
// @talkingbook/shared.
const express = require('express');
const sharp = require('sharp');
const { s3 } = require('../services/cloud-services');

const router = express.Router();

const BUCKET = 'talkingbooks';
// Fixed widths so the cache stays small and nobody can ask for arbitrary sizes.
const WIDTHS = new Set([200, 400, 800]);
const IMAGE_KEY = /\.(jpe?g|png|webp|gif)$/i;
// Generated thumbnails are stored under this prefix in the same bucket.
const THUMB_PREFIX = 'thumbs';
const CACHE_FOREVER = 'public, max-age=31536000, immutable';

router.get(/^\/thumb\/(\d+)\/(.+)$/, async (req, res) => {
  const width = Number(req.params[0]);
  const key = req.params[1];
  if (!WIDTHS.has(width) || !IMAGE_KEY.test(key)) {
    return res.status(400).json({ message: 'Unsupported thumbnail' });
  }

  // Made once, then kept in S3: a CloudFront miss (a new edge, a new region)
  // copies the stored thumbnail instead of resizing again. Resizing many images
  // at once on the server's small CPU queued them for 10-30 seconds.
  const storedKey = `${THUMB_PREFIX}/${width}/${key}.webp`;
  try {
    const stored = await s3.getObject({ Bucket: BUCKET, Key: storedKey }).promise();
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': CACHE_FOREVER });
    return res.send(stored.Body);
  } catch (err) {
    if (err.code !== 'NoSuchKey' && err.code !== 'AccessDenied') console.error('Thumbnail: S3 cache read failed', storedKey, err.code);
  }

  let original;
  try {
    original = await s3.getObject({ Bucket: BUCKET, Key: key }).promise();
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.code === 'AccessDenied') {
      return res.status(404).json({ message: 'Image not found' });
    }
    console.error('Thumbnail: S3 read failed', key, err);
    return res.status(502).json({ message: 'Could not load image' });
  }

  try {
    const thumb = await sharp(original.Body, { limitInputPixels: 50_000_000 })
      .rotate() // honour EXIF orientation before it's stripped
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    // Keys are timestamped and never rewritten, so the thumbnail never changes.
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': CACHE_FOREVER });
    res.send(thumb);
    s3.putObject({ Bucket: BUCKET, Key: storedKey, Body: thumb, ContentType: 'image/webp', CacheControl: CACHE_FOREVER })
      .promise()
      .catch((err) => console.error('Thumbnail: S3 cache write failed', storedKey, err.code));
  } catch (err) {
    console.error('Thumbnail: resize failed', key, err);
    res.status(415).json({ message: 'Could not resize image' });
  }
});

module.exports = router;
