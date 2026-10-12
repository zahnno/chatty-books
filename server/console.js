// console.js
const mongoose = require('mongoose');
const repl = require('repl');
const path = require('path');
const fs = require('fs');

// Load your .env config if you use dotenv
require('dotenv').config({ path: path.join(__dirname, 'config.env') });

// Load models dynamically (assuming your models are in a directory)
const modelsPath = path.join(__dirname, 'models');
fs.readdirSync(modelsPath).forEach((file) => {
  require(path.join(modelsPath, file));
});

mongoose.connect(process.env.ATLAS_URI)
  .then(() => {
    console.log('Connected to MongoDB');

    const replServer = repl.start({ prompt: 'app > ' });

    // Attach models to the REPL context
    Object.keys(mongoose.models).forEach((modelName) => {
      replServer.context[modelName] = mongoose.models[modelName];
    });

    // Attach mongoose itself to the REPL context
    replServer.context.mongoose = mongoose;
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });