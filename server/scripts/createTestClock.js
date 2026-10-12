require('dotenv').config({ path: '../config.env' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function createTestClock() {
  try {
    const testClock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
      name: 'Subscription Test Clock'
    });
    
    console.log('\nTest clock created successfully!');
    console.log('----------------------------------------');
    console.log('Test Clock ID:', testClock.id);
    console.log('----------------------------------------');
    console.log('\nPlease update your STRIPE_TEST_CLOCK_ID in config.env with this value.');
    
    return testClock;
  } catch (error) {
    console.error('Error creating test clock:', error);
  }
}

createTestClock(); 