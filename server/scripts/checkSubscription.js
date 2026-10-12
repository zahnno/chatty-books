require('dotenv').config({ path: '../config.env' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkSubscription() {
  try {
    // Get all subscriptions
    const subscriptions = await stripe.subscriptions.list({
      limit: 5,
      status: 'active'
    });

    console.log('\nActive Subscriptions:');
    console.log('----------------------------------------');
    
    for (const subscription of subscriptions.data) {
      console.log(`\nSubscription ID: ${subscription.id}`);
      console.log(`Status: ${subscription.status}`);
      console.log(`Current period end: ${new Date(subscription.current_period_end * 1000).toISOString()}`);
      console.log(`Test Clock: ${subscription.test_clock || 'Not using test clock'}`);
      
      if (!subscription.test_clock && process.env.STRIPE_TEST_CLOCK_ID) {
        console.log('\nThis subscription is not associated with your test clock!');
        console.log('You will need to create a new subscription with the test clock to test renewals.');
      }
    }
    
    if (subscriptions.data.length === 0) {
      console.log('No active subscriptions found.');
    }
    
    console.log('\n----------------------------------------');
  } catch (error) {
    console.error('Error checking subscriptions:', error);
  }
}

checkSubscription(); 