const mongoose = require('mongoose');
const Subscription = require('../models/subscriptionModel');
require('dotenv').config();

const seedFreePlan = async () => {
  try {
    // Check if free plan already exists
    let freePlan = await Subscription.findOne({ tier: 'free' });
    
    if (!freePlan) {
      freePlan = await Subscription.create({
        name: 'Free Plan',
        description: 'Basic access to TalkingBook features',
        price: 0,
        duration: 30, // 30 days
        tokensPerMonth: 100, // Adjust this value as needed
        displayFeatures: [
          'Basic book access',
          'Limited tokens per month',
          'Standard character generation'
        ],
        isActive: true,
        tier: 'free'
      });
      
      console.log('Created free subscription plan:', freePlan);
    } else {
      console.log('Free subscription plan already exists');
    }
    
    return freePlan;
  } catch (error) {
    console.error('Error seeding free subscription plan:', error);
    throw error;
  }
};

// Run the seeding if this script is run directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => seedFreePlan())
    .then(() => {
      console.log('Seeding completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
} 