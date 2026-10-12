const express = require("express");
const morgan = require('morgan');
const path = require('path');
require("dotenv").config({ path: "./config.env" });

const app = express();

const cors = require("cors");

const port = process.env.PORT || 5001;

// Image and media URLs in JSON responses point at the CDN rather than S3.
app.set('json replacer', require('./services/cdn').jsonReplacer);

app.use(cors());
app.use(require('./services/requestContext').middleware);

// Parse regular requests as JSON
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(morgan('tiny'));

// Initialize Passport and restore authentication state from session
// app.use(passport.initialize());
// app.use(passport.session());

// API Routes
app.use(require('./routes/thumbs'));
app.use('/auth', require('./routes/auth'));
app.use(require("./routes/query"));
app.use(require("./routes/voice"));
app.use(require("./routes/moderation"));
app.use(require("./routes/share"));
app.use('/api/billing', require("./routes/billing"));
app.use('/api/webhooks', require("./routes/webhooks"));
app.use('/api/solana', require("./routes/solana"));
app.use('/api/publishing', require("./routes/publishing"));
app.use('/api/admin/payments', require("./routes/adminPayments"));

// Serve generated audiobook files (WAV/MP3 output from piper TTS)
app.use('/output', express.static(path.join(__dirname, 'output')));

// Serve static files from the React app if in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Catch-all route - Handle any requests that don't match the ones above
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Get MongoDB driver connection
const dbo = require("./db/conn");
const ServiceRate = require('./models/serviceRateModel');
const rateCache = require('./services/rateCache');

app.listen(port, () => {
  // Perform a database connection when server starts
  dbo.connectToMongoose();
  console.log(`Server is running on port: ${port}`);
});

const mongoose = require('mongoose');
const cron = require('node-cron');
const { renewExpiredFreeSubscriptions } = require('./services/subscriptionService');
const { rollOverSolanaPasses } = require('./services/solana/pass');
const { reconcilePendingPayments } = require('./services/solana/payments');

mongoose.connection.once('open', async () => {
  await ServiceRate.seedDefaults();
  await rateCache.init();
  console.log('Rate cache initialized');
  cron.schedule('0 2 * * *', renewExpiredFreeSubscriptions); // 2 AM daily
  // Seeker crypto passes: settle payments the app didn't report back, and
  // start the next prepaid period / drop lapsed passes to free.
  cron.schedule('*/2 * * * *', reconcilePendingPayments);
  cron.schedule('10 * * * *', rollOverSolanaPasses); // hourly
});