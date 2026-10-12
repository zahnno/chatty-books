// Permanent account deletion (App Store 5.1.1(v), Google Play account deletion
// policy). Removes the user and everything personal tied to them. Kept, with no
// personal data: token transactions and cost records (accounting, keyed only by
// the old user id) and processed billing events (store replay protection).
const User = require('../models/userModel');
const Message = require('../models/messageModel');
const Activity = require('../models/activityModel');
const ImageGeneration = require('../models/imageGenerationModel');
const ImageLike = require('../models/imageLikeModel');
const ImageComment = require('../models/imageCommentModel');
const UserPersonality = require('../models/userPersonalityModel');
const ContentReport = require('../models/contentReportModel');
const { cancelSubscription } = require('./stripe');
const { s3 } = require('./cloud-services');
const { isBucketHost } = require('./cdn');

const BUCKET = 'talkingbooks';

// S3 key for a URL in our bucket, or null for anything else (Google avatars etc).
function bucketKey(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!isBucketHost(u.hostname)) return null;
    return decodeURIComponent(u.pathname.replace(/^\//, '')) || null;
  } catch {
    return null;
  }
}

async function deleteS3Objects(urls) {
  const keys = [...new Set(urls.map(bucketKey).filter(Boolean))];
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    try {
      await s3
        .deleteObjects({ Bucket: BUCKET, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } })
        .promise();
    } catch (err) {
      // Best effort: the records are gone either way, so an orphaned file is
      // unreachable from the app. Log so it can be cleaned up by hand.
      console.error('Account deletion: failed to delete S3 objects', chunk, err);
    }
  }
}

/**
 * Deletes the account and its data.
 * @returns {{ storeProvider: 'apple' | 'play' | null }} a store-billed plan the
 *   user still has to cancel in the App Store / Play Store (we can't cancel
 *   those server-side).
 */
async function deleteAccount(userId) {
  const user = await User.findById(userId);
  if (!user) return { storeProvider: null };

  const sub = user.subscription || {};
  if (sub.provider === 'stripe' && sub.stripeSubscriptionId && sub.status !== 'cancelled') {
    // Must succeed: deleting the account while Stripe keeps charging is worse
    // than asking the user to retry. An invalid-request error means the
    // subscription is already cancelled or gone, so there's nothing to stop.
    try {
      await cancelSubscription(sub.stripeSubscriptionId);
    } catch (err) {
      if (err?.type !== 'StripeInvalidRequestError') throw err;
    }
  }
  const storeProvider = ['apple', 'play'].includes(sub.provider) && sub.status === 'active' ? sub.provider : null;

  // The user's gallery scenes, plus everyone's likes and comments on them.
  const images = await ImageGeneration.find({ userId }, '_id imageUrl videoUrl').lean();
  const imageIds = images.map((i) => i._id);

  await Promise.all([
    Message.deleteMany({ userId }),
    Activity.deleteMany({ userId }),
    UserPersonality.deleteMany({ userId }),
    ImageLike.deleteMany({ $or: [{ userId }, { imageGenerationId: { $in: imageIds } }] }),
    ImageComment.deleteMany({ $or: [{ userId }, { imageGenerationId: { $in: imageIds } }] }),
    ContentReport.deleteMany({ reporterId: userId }),
    ImageGeneration.deleteMany({ userId }),
    // Drop the user from other readers' block lists.
    User.updateMany({ blockedUsers: userId }, { $pull: { blockedUsers: userId } }),
  ]);

  await deleteS3Objects([user.profileImage, ...images.flatMap((i) => [i.imageUrl, i.videoUrl])]);
  await User.deleteOne({ _id: userId });

  return { storeProvider };
}

module.exports = { deleteAccount };
