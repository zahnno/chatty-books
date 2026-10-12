const mongoose = require('mongoose');

// Idempotency ledger for in-app purchase billing. One row per thing that must
// happen at most once, even though stores redeliver notifications and clients
// re-validate the same purchase:
//
//   provider 'stripe' | 'apple' | 'play' | 'solana'
//   eventId  event:<id>                        Stripe webhook event
//            notification:<notificationUUID>   App Store Server Notification
//            notification:<messageId>          Play RTDN (Pub/Sub message)
//            grant:<transactionId>             Apple paid period → token grant
//            grant:<orderId>                   Play paid period → token grant
//            tx:<signature>                    Solana payment tx (pays one pass)
//            renewal:<userId>:<periodStart>    Solana prepaid period → token grant
//            sgt:<mint>                        Seeker Genesis Token bonus
//
// Each paid period has its own store transaction/order id (renewals and plan
// changes mint a new one), so keying token grants on it grants every period
// exactly once no matter which path — validate endpoint or webhook — gets
// there first. No TTL: grant rows must outlive the period they cover.
const processedBillingEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['stripe', 'apple', 'play', 'solana'],
      required: true
    },
    eventId: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

processedBillingEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model('ProcessedBillingEvent', processedBillingEventSchema);
