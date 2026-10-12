const fs = require('fs');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const aws = require('aws-sdk');

// Initialize Google Cloud Text-to-Speech client
let ttsClient = null;

// Initialize Google Cloud Text-to-Speech
const initializeGoogleCloud = () => {
  try {
    if (process.env.NODE_ENV === 'production') {    
      // Use Render's secret file path
      const credentialsPath = '/etc/secrets/google-credentials.json';
      
      // Verify the credentials file exists
      if (!fs.existsSync(credentialsPath)) {
        throw new Error('Google Cloud credentials file not found at ' + credentialsPath);
      }
      
      // Set environment variable to point to the credentials file
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
    }
    
    // Initialize client
    ttsClient = new TextToSpeechClient();
    console.log('Successfully initialized Google Cloud Text-to-Speech client');
  } catch (error) {
    console.error('Failed to initialize Google Cloud Text-to-Speech client:', error);
  }
};

// Initialize AWS S3
const initializeAWS = () => {
  aws.config.update({
    secretAccessKey: process.env.S3_ACCESS_SECRET,
    accessKeyId: process.env.S3_ACCESS_KEY,
    region: "us-east-1",
  });

  return new aws.S3();
};

// Initialize services
initializeGoogleCloud();
const s3 = initializeAWS();

// Upload a video buffer directly to S3 as MP4
const uploadVideo = async (videoBuffer, key) => {
  const uploadParams = {
    Bucket: 'talkingbooks',
    Key: key,
    Body: videoBuffer,
    ContentType: 'video/mp4',
    CacheControl: 'max-age=31536000'
  };
  const result = await s3.upload(uploadParams).promise();
  return result.Location;
};

// Export initialized clients
module.exports = {
  ttsClient: () => ttsClient, // Export as a function to ensure we always get the current value
  s3,
  uploadVideo,
  initializeGoogleCloud,
  initializeAWS,
}; 