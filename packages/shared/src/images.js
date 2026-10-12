// Image URLs from the API point at our CloudFront CDN (see server/services/cdn.js).
// The CDN also serves resized webp copies at /thumb/<width>/<key>, made on first
// request by server/routes/thumbs.js.
const CDN_HOST = 'd1mc8zohq46wdx.cloudfront.net';
// Must match WIDTHS in server/routes/thumbs.js.
const THUMB_WIDTHS = [200, 400, 800];

/**
 * A smaller copy of a bucket image, for grids, cards and avatars. Pass the width
 * the image is drawn at in CSS / layout pixels; it's doubled for high-density
 * screens and rounded up to a size the CDN makes. Anything that isn't on our
 * CDN (Google avatars, Google Books covers, S3 while the CDN is off) is returned
 * unchanged.
 */
export function thumbUrl(url, displayWidth) {
  if (!url || typeof url !== 'string') return url;
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (u.hostname !== CDN_HOST || u.pathname.startsWith('/thumb/')) return url;
  const wanted = displayWidth * 2;
  const width = THUMB_WIDTHS.find((w) => w >= wanted) || THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
  return `${u.origin}/thumb/${width}${u.pathname}`;
}
