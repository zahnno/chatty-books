// Reporting, blocking and moderator review for community and AI content.
const express = require('express');
const router = express.Router();
const ContentReport = require('../models/contentReportModel');
const { authenticate, authenticateAdmin } = require('../controllers/auth');
const moderation = require('../services/moderationService');

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof moderation.ModerationError) return res.status(err.status).json({ message: err.message });
    console.error('Moderation route error:', err);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

// Body: { targetType: 'image' | 'comment' | 'message', targetId, reason, details? }
router.post('/reports', authenticate, handle(async (req, res) => {
  const result = await moderation.reportContent(req.user, req.body || {});
  res.status(201).json({ ok: true, ...result });
}));

router.get('/users/blocked', authenticate, handle(async (req, res) => {
  res.json({ users: await moderation.listBlockedUsers(req.user) });
}));

router.post('/users/:userId/block', authenticate, handle(async (req, res) => {
  await moderation.blockUser(req.user, req.params.userId);
  res.json({ ok: true, blocked: true });
}));

router.delete('/users/:userId/block', authenticate, handle(async (req, res) => {
  await moderation.unblockUser(req.user, req.params.userId);
  res.json({ ok: true, blocked: false });
}));

// ─── Moderators ──────────────────────────────────────────────────────────────

router.get('/admin/reports', authenticateAdmin, handle(async (req, res) => {
  const status = ['open', 'removed', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const reports = await ContentReport.find({ status })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('reporterId', 'username email')
    .populate('targetUserId', 'username email')
    .lean();
  res.json({ reports });
}));

// Body: { action: 'remove' | 'dismiss' }
router.post('/admin/reports/:id/resolve', authenticateAdmin, handle(async (req, res) => {
  res.json({ report: await moderation.resolveReport(req.user, req.params.id, req.body?.action) });
}));

module.exports = router;
