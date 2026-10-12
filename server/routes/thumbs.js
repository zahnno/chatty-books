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

router.get(/^\/thumb\/(\d+)\/(.+)$/, async (req, res) => {
  const width = Number(req.params[0]);
  const key = req.params[1];
  if (!WIDTHS.has(width) || !IMAGE_KEY.test(key)) {
    return res.status(400).json({ message: 'Unsupported thumbnail' });
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
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.send(thumb);
  } catch (err) {
    console.error('Thumbnail: resize failed', key, err);
    res.status(415).json({ message: 'Could not resize image' });
  }
});

module.exports = router;
