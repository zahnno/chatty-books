// A tiny in-memory cache for public, non-personalised API responses (the guest
// homepage lists). A short TTL keeps admin changes visible within a minute
// while sparing the database on every page view.
const store = new Map();

module.exports = {
  get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  },
  set(key, value, ttlMs = 60 * 1000) {
    store.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  },
};
