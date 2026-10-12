const Activity = require('../models/activityModel');

class ActivityService {
  static async logActivity(userId, action, options = {}) {
    try {
      const {
        resourceId,
        resourceModel,
        metadata,
        ipAddress,
        userAgent
      } = options;

      const activity = new Activity({
        userId,
        action,
        resourceId,
        resourceModel,
        metadata,
        ipAddress,
        userAgent
      });

      await activity.save();
      return activity;
    } catch (error) {
      console.error('Error logging activity:', error);
      // Don't throw error to prevent disrupting main flow
      return null;
    }
  }

  static async getUserActivities(userId, options = {}) {
    const {
      startDate,
      endDate,
      actions,
      limit = 50,
      page = 1
    } = options;

    const query = { userId };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (actions && actions.length > 0) {
      query.action = { $in: actions };
    }

    const skip = (page - 1) * limit;

    const activities = await Activity.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'username email')
      .populate('resourceId');

    const total = await Activity.countDocuments(query);

    return {
      activities,
      pagination: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + activities.length < total
      }
    };
  }

  static async getActivityStats(options = {}) {
    const {
      startDate,
      endDate,
      groupBy = 'day'
    } = options;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.timestamp = {};
      if (startDate) matchStage.timestamp.$gte = new Date(startDate);
      if (endDate) matchStage.timestamp.$lte = new Date(endDate);
    }

    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' }
        };
        break;
      case 'day':
        dateFormat = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
        break;
      case 'month':
        dateFormat = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' }
        };
        break;
      default:
        dateFormat = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
    }

    const stats = await Activity.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            date: dateFormat,
            action: '$action'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1, '_id.action': 1 } }
    ]);

    return stats;
  }

  static async getPopularResources(options = {}) {
    const {
      startDate,
      endDate,
      resourceModel,
      limit = 10
    } = options;

    const matchStage = { resourceModel };
    if (startDate || endDate) {
      matchStage.timestamp = {};
      if (startDate) matchStage.timestamp.$gte = new Date(startDate);
      if (endDate) matchStage.timestamp.$lte = new Date(endDate);
    }

    const popularResources = await Activity.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$resourceId',
          count: { $sum: 1 },
          lastAccessed: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    return popularResources;
  }
}

module.exports = ActivityService; 