// Reports and blocks for community content (gallery scenes, comments) and AI
// character replies. Reported items disappear for the reporter right away;
// moderators take them down for everyone from the admin endpoints.
const mongoose = require('mongoose');
const ContentReport = require('../models/contentReportModel');
const ImageGeneration = require('../models/imageGenerationModel');
const ImageComment = require('../models/imageCommentModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel');
const EmailService = require('./emailService');

const REASONS = ContentReport.schema.path('reason').enumValues;
const TARGET_TYPES = ContentReport.schema.path('targetType').enumValues;

class ModerationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// What a viewer shouldn't see: authors they blocked and items they reported.
// Anonymous viewers only lose moderator-hidden content.
async function viewerFilters(viewer) {
  if (!viewer) return { blockedUserIds: [], reportedImageIds: [], reportedCommentIds: [] };
  const reports = await ContentReport.find(
    { reporterId: viewer._id, targetType: { $in: ['image', 'comment'] } },
    'targetType targetId'
  ).lean();
  return {
    blockedUserIds: viewer.blockedUsers || [],
    reportedImageIds: reports.filter((r) => r.targetType === 'image').map((r) => r.targetId),
    reportedCommentIds: reports.filter((r) => r.targetType === 'comment').map((r) => r.targetId),
  };
}

// Mongo conditions for gallery images a viewer may see.
async function imageVisibilityQuery(viewer) {
  const f = await viewerFilters(viewer);
  const query = { hidden: { $ne: true } };
  if (f.blockedUserIds.length) query.userId = { $nin: f.blockedUserIds };
  if (f.reportedImageIds.length) query._id = { $nin: f.reportedImageIds };
  return query;
}

// Mongo conditions for comments a viewer may see.
async function commentVisibilityQuery(viewer) {
  const f = await viewerFilters(viewer);
  const query = { hidden: { $ne: true } };
  if (f.blockedUserIds.length) query.userId = { $nin: f.blockedUserIds };
  if (f.reportedCommentIds.length) query._id = { $nin: f.reportedCommentIds };
  return query;
}

// Loads the reported item, checking the reporter may see it, and returns its
// author and a text snapshot for moderators.
async function loadTarget(targetType, targetId, reporter) {
  if (targetType === 'image') {
    const image = await ImageGeneration.findById(targetId);
    if (!image) throw new ModerationError(404, 'Scene not found');
    return {
      targetUserId: image.userId,
      snapshot: [image.imageUrl, image.videoUrl, image.prompt].filter(Boolean).join('\n'),
    };
  }
  if (targetType === 'comment') {
    const comment = await ImageComment.findById(targetId);
    if (!comment) throw new ModerationError(404, 'Comment not found');
    return { targetUserId: comment.userId, snapshot: comment.content };
  }
  // An AI character reply from the reporter's own conversation.
  const message = await Message.findById(targetId);
  if (!message || String(message.userId) !== String(reporter._id)) {
    throw new ModerationError(404, 'Message not found');
  }
  return {
    targetUserId: null,
    snapshot: `Character ${message.characterId} in book ${message.bookId}\nReader: ${message.userMessage || ''}\nReply: ${message.modelResponse || ''}`,
  };
}

async function reportContent(reporter, { targetType, targetId, reason, details }) {
  if (!TARGET_TYPES.includes(targetType)) throw new ModerationError(400, 'Unknown content type');
  if (!REASONS.includes(reason)) throw new ModerationError(400, 'Choose a reason');
  if (!mongoose.isValidObjectId(targetId)) throw new ModerationError(400, 'Invalid content id');

  const { targetUserId, snapshot } = await loadTarget(targetType, targetId, reporter);
  if (targetUserId && String(targetUserId) === String(reporter._id)) {
    throw new ModerationError(400, "You can't report your own content");
  }

  let report;
  try {
    report = await ContentReport.create({
      reporterId: reporter._id,
      targetType,
      targetId,
      targetUserId,
      reason,
      details: details ? String(details).slice(0, 1000) : undefined,
      snapshot: snapshot?.slice(0, 4000),
    });
  } catch (err) {
    // Already reported by this reader: treat as success.
    if (err.code === 11000) return { alreadyReported: true };
    throw err;
  }

  EmailService.sendContentReportNotification(report, reporter).catch((err) =>
    console.error('Failed to send report notification:', err)
  );
  return { reportId: report._id };
}

async function blockUser(user, targetUserId) {
  if (!mongoose.isValidObjectId(targetUserId)) throw new ModerationError(400, 'Invalid user id');
  if (String(targetUserId) === String(user._id)) throw new ModerationError(400, "You can't block yourself");
  if (!(await User.exists({ _id: targetUserId }))) throw new ModerationError(404, 'User not found');
  await User.updateOne({ _id: user._id }, { $addToSet: { blockedUsers: targetUserId } });
}

async function unblockUser(user, targetUserId) {
  if (!mongoose.isValidObjectId(targetUserId)) throw new ModerationError(400, 'Invalid user id');
  await User.updateOne({ _id: user._id }, { $pull: { blockedUsers: targetUserId } });
}

async function listBlockedUsers(user) {
  const u = await User.findById(user._id).populate('blockedUsers', 'username email profileImage').lean();
  return (u?.blockedUsers || []).map((b) => ({
    _id: b._id,
    username: b.username || (b.email ? b.email.split('@')[0] : 'User'),
    profileImage: b.profileImage || null,
  }));
}

// Moderator decision. 'remove' hides the item for everyone (and closes every
// open report on it); 'dismiss' closes just this report.
async function resolveReport(admin, reportId, action) {
  if (!['remove', 'dismiss'].includes(action)) throw new ModerationError(400, 'Unknown action');
  const report = await ContentReport.findById(reportId);
  if (!report) throw new ModerationError(404, 'Report not found');

  const update = { resolvedAt: new Date(), resolvedBy: admin._id };
  if (action === 'dismiss') {
    Object.assign(report, update, { status: 'dismissed' });
    await report.save();
    return report;
  }

  if (report.targetType === 'image') await ImageGeneration.updateOne({ _id: report.targetId }, { hidden: true });
  if (report.targetType === 'comment') await ImageComment.updateOne({ _id: report.targetId }, { hidden: true });
  // AI replies live in one reader's private chat; there is nothing public to take
  // down, so 'remove' just records that the reply was a genuine problem.
  await ContentReport.updateMany(
    { targetType: report.targetType, targetId: report.targetId, status: 'open' },
    { ...update, status: 'removed' }
  );
  return ContentReport.findById(reportId);
}

module.exports = {
  REASONS,
  ModerationError,
  imageVisibilityQuery,
  commentVisibilityQuery,
  reportContent,
  blockUser,
  unblockUser,
  listBlockedUsers,
  resolveReport,
};
