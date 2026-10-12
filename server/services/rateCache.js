const cron = require('node-cron');
const ServiceRate = require('../models/serviceRateModel');

let cache = {};

async function refresh() {
  try {
    const rates = await ServiceRate.find({});
    const next = {};
    for (const r of rates) next[`${r.service}.${r.key}`] = r.rate;
    cache = next;
  } catch (err) {
    console.error('rateCache: refresh failed', err.message);
  }
}

function get(service, key) {
  return cache[`${service}.${key}`];
}

async function init() {
  await refresh();
  cron.schedule('*/10 * * * *', refresh);
}

module.exports = { init, get, refresh };
