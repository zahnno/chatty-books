// Per-request context available anywhere in the request's async chain, for code
// that doesn't receive `req` (e.g. the Meta Conversions API sender).
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

const middleware = (req, res, next) => {
  storage.run(
    {
      // Set by the iOS/Android apps (packages/shared configureApi headers).
      appClient: req.get('X-Chatty-Client') || null,
      userAgent: req.get('User-Agent') || '',
    },
    next
  );
};

const current = () => storage.getStore() || {};

// True for requests from the native apps. Browsers always send a "Mozilla/"
// user agent; the apps' HTTP stacks (CFNetwork, okhttp) don't.
const isAppRequest = () => {
  const ctx = current();
  return !!ctx.appClient || (!!ctx.userAgent && !ctx.userAgent.startsWith('Mozilla/'));
};

module.exports = { middleware, current, isAppRequest };
