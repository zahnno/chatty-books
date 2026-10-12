require('dotenv').config({ path: '../config.env' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function advanceTestClock() {
  try {
    if (!process.env.STRIPE_TEST_CLOCK_ID) {
      throw new Error('STRIPE_TEST_CLOCK_ID is not set in config.env');
    }

    // First, get the current test clock time
    const testClock = await stripe.testHelpers.testClocks.retrieve(
      process.env.STRIPE_TEST_CLOCK_ID
    );
    
    // Calculate new time (current time + 30 days)
    const currentTime = testClock.frozen_time;
    const advanceBy = 30 * 24 * 60 * 60; // 30 days in seconds
    const newTimestamp = currentTime + advanceBy;

    console.log('\nCurrent test clock time:', new Date(currentTime * 1000).toISOString());
    console.log('Advancing to:', new Date(newTimestamp * 1000).toISOString());

    // Advance the clock
    await stripe.testHelpers.testClocks.advance(
      process.env.STRIPE_TEST_CLOCK_ID,
      { frozen_time: newTimestamp }
    );

    console.log('Successfully advanced test clock by 30 days');
  } catch (error) {
    console.error('Error advancing test clock:', error);
  }
}

advanceTestClock(); 