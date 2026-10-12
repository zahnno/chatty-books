const { getimg } = require('getimg-client');

if (!process.env.GETIMG_API_KEY) {
    throw new Error('GETIMG_API_KEY is required but not set in environment variables');
}

// Configure getimg client with API key
getimg.config({ 
    key: process.env.GETIMG_API_KEY 
});

module.exports = getimg; 