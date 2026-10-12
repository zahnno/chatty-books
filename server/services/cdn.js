// Serve bucket files through the CDN instead of straight from S3. The database
// keeps S3 URLs; they're rewritten on the way out of every JSON response, so the
// CDN can be turned on or off (CDN_URL in config.env) without a migration.
const BUCKET = 'talkingbooks';
const S3_ORIGIN = /^https?:\/\/talkingbooks\.s3(?:\.us-east-1)?\.amazonaws\.com\//;

const CDN_URL = (process.env.CDN_URL || '').replace(/\/$/, '');
const CDN_HOST = CDN_URL ? new URL(CDN_URL).hostname : null;

function toCdnUrl(url) {
  if (!CDN_URL || typeof url !== 'string') return url;
  return url.replace(S3_ORIGIN, `${CDN_URL}/`);
}

// For app.set('json replacer'): S3 URL strings anywhere in a response go out as CDN URLs.
function jsonReplacer(key, value) {
  return typeof value === 'string' && value.startsWith('http') ? toCdnUrl(value) : value;
}

// True when a URL points at our bucket, through S3 or the CDN. Clients send CDN
// URLs back (e.g. when saving a profile), so code that maps URLs to S3 keys
// needs to accept both.
function isBucketHost(hostname) {
  return hostname.startsWith(`${BUCKET}.s3`) || (CDN_HOST !== null && hostname === CDN_HOST);
}

module.exports = { toCdnUrl, jsonReplacer, isBucketHost };
