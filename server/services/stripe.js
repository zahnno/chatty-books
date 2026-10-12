const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const createPaymentIntent = async (amount, currency = 'usd') => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
    });
    return paymentIntent;
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

const createCustomer = async (email, paymentMethod) => {
  try {
    const customer = await stripe.customers.create({
      email,
      payment_method: paymentMethod,
      invoice_settings: { default_payment_method: paymentMethod },
    });
    return customer;
  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
  }
};

const createSubscription = async (customerId, priceId) => {
  if (!customerId || !priceId) {
    throw new Error('Customer ID and Price ID are required');
  }

  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: priceId,
        },
      ],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription'
      },
      proration_behavior: 'none',
      cancel_at_period_end: false,
      collection_method: 'charge_automatically'
    });
    return subscription;
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }
};

const updateSubscription = async (subscriptionId, priceId) => {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: priceId,
      }],
      proration_behavior: 'none',
      billing_cycle_anchor: 'now',
      payment_behavior: 'error_if_incomplete',
      expand: ['latest_invoice.payment_intent']
    });
    return updatedSubscription;
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }
};

const cancelSubscription = async (subscriptionId) => {
  try {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
};

// Stop renewal but keep access until the paid period ends (or undo that).
// Stripe then sends customer.subscription.deleted when the period is over.
const setCancelAtPeriodEnd = async (subscriptionId, cancelAtPeriodEnd) => {
  try {
    return await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancelAtPeriodEnd });
  } catch (error) {
    console.error('Error updating subscription cancel_at_period_end:', error);
    throw error;
  }
};

// End of the paid period. Newer Stripe API versions move it onto the items.
const periodEnd = (subscription) => {
  const seconds = subscription?.current_period_end ?? subscription?.items?.data?.[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
};

const retrieveCustomer = async (customerId) => {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer;
  } catch (error) {
    console.error('Error retrieving customer:', error);
    throw error;
  }
};

const listSubscriptions = async (customerId) => {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      expand: ['data.default_payment_method'],
    });
    return subscriptions;
  } catch (error) {
    console.error('Error listing subscriptions:', error);
    throw error;
  }
};

const retrievePaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    throw error;
  }
};

module.exports = {
  createPaymentIntent,
  createCustomer,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  setCancelAtPeriodEnd,
  periodEnd,
  retrieveCustomer,
  listSubscriptions,
  retrievePaymentIntent,
}; 