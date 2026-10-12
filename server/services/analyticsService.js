const Activity = require('../models/activityModel');
const User = require('../models/userModel');
const Book = require('../models/bookModel');
const Character = require('../models/characterModel');

class AnalyticsService {
  static async getAnalytics(timeRange) {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    const [
      overview,
      dailyActiveUsers,
      featureUsage,
      userEngagement,
      retention,
      popularBooks,
      characterStats,
      featureTrends
    ] = await Promise.all([
      this.getOverviewMetrics(startDate, endDate),
      this.getDailyActiveUsers(startDate, endDate),
      this.getFeatureUsageDistribution(startDate, endDate),
      this.getUserEngagementPatterns(startDate, endDate),
      this.getUserRetention(startDate, endDate),
      this.getPopularBooks(startDate, endDate),
      this.getCharacterStats(startDate, endDate),
      this.getFeatureTrends(startDate, endDate)
    ]);

    return {
      overview,
      dailyActiveUsers,
      featureUsage,
      userEngagement,
      retention,
      popularBooks,
      characterStats,
      featureTrends
    };
  }

  static async getOverviewMetrics(startDate, endDate) {
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - (endDate - startDate) / (1000 * 60 * 60 * 24));

    // Get current period metrics
    const currentPeriodUsers = await Activity.distinct('userId', {
      timestamp: { $gte: startDate, $lte: endDate }
    });

    const previousPeriodUsers = await Activity.distinct('userId', {
      timestamp: { $gte: previousStartDate, $lte: startDate }
    });

    // Calculate session durations
    const sessions = await this.calculateSessionDurations(startDate, endDate);
    const previousSessions = await this.calculateSessionDurations(previousStartDate, startDate);

    const avgSessionDuration = sessions.length > 0 
      ? sessions.reduce((acc, session) => acc + session.duration, 0) / sessions.length / 60000 // Convert to minutes
      : 0;

    const previousAvgSessionDuration = previousSessions.length > 0
      ? previousSessions.reduce((acc, session) => acc + session.duration, 0) / previousSessions.length / 60000
      : 0;

    // Get total interactions
    const currentInteractions = await Activity.countDocuments({
      timestamp: { $gte: startDate, $lte: endDate }
    });

    const previousInteractions = await Activity.countDocuments({
      timestamp: { $gte: previousStartDate, $lte: startDate }
    });

    // Calculate engagement rate (interactions per user)
    const currentEngagementRate = currentPeriodUsers.length > 0
      ? (currentInteractions / currentPeriodUsers.length) * 100
      : 0;

    const previousEngagementRate = previousPeriodUsers.length > 0
      ? (previousInteractions / previousPeriodUsers.length) * 100
      : 0;

    // Percent change vs the previous period, or null when there is nothing to compare with
    const growth = (current, previous) => (previous > 0
      ? Math.round(((current - previous) / previous) * 1000) / 10
      : null);

    return {
      activeUsers: currentPeriodUsers.length,
      userGrowth: growth(currentPeriodUsers.length, previousPeriodUsers.length),
      avgSessionDuration: Math.round(avgSessionDuration * 10) / 10,
      sessionGrowth: growth(avgSessionDuration, previousAvgSessionDuration),
      totalInteractions: currentInteractions,
      interactionGrowth: growth(currentInteractions, previousInteractions),
      engagementRate: Math.round(currentEngagementRate * 10) / 10,
      engagementGrowth: growth(currentEngagementRate, previousEngagementRate)
    };
  }

  static async calculateSessionDurations(startDate, endDate) {
    const activities = await Activity.find({
      timestamp: { $gte: startDate, $lte: endDate }
    }).sort({ timestamp: 1 });

    const sessions = [];
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

    for (const userId of new Set(activities.map(a => a.userId.toString()))) {
      const userActivities = activities.filter(a => a.userId.toString() === userId);
      let sessionStart = null;
      let lastActivity = null;

      for (const activity of userActivities) {
        if (!sessionStart) {
          sessionStart = activity.timestamp;
        } else if (activity.timestamp - lastActivity.timestamp > SESSION_TIMEOUT) {
          sessions.push({
            userId,
            start: sessionStart,
            end: lastActivity.timestamp,
            duration: lastActivity.timestamp - sessionStart
          });
          sessionStart = activity.timestamp;
        }
        lastActivity = activity;
      }

      if (sessionStart && lastActivity) {
        sessions.push({
          userId,
          start: sessionStart,
          end: lastActivity.timestamp,
          duration: lastActivity.timestamp - sessionStart
        });
      }
    }

    return sessions;
  }

  static async getDailyActiveUsers(startDate, endDate) {
    const dailyUsers = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
          },
          users: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          date: "$_id",
          users: { $size: "$users" }
        }
      },
      { $sort: { date: 1 } }
    ]);

    return dailyUsers;
  }

  static async getFeatureUsageDistribution(startDate, endDate) {
    const distribution = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$action",
          value: { $sum: 1 }
        }
      },
      {
        $project: {
          name: "$_id",
          value: 1,
          _id: 0
        }
      }
    ]);

    return distribution;
  }

  static async getUserEngagementPatterns(startDate, endDate) {
    const hourlyPatterns = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            hour: { $hour: "$timestamp" }
          },
          activeUsers: { $addToSet: "$userId" },
          interactions: { $sum: 1 }
        }
      },
      {
        $project: {
          hour: "$_id.hour",
          activeUsers: { $size: "$activeUsers" },
          interactions: 1,
          _id: 0
        }
      }
    ]);

    // Every hour of the day (UTC), in order, so the chart has a stable axis
    const byHour = new Map(hourlyPatterns.map(row => [row.hour, row]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      timeSlot: `${String(hour).padStart(2, '0')}:00`,
      activeUsers: byHour.get(hour)?.activeUsers || 0,
      interactions: byHour.get(hour)?.interactions || 0
    }));
  }

  static async getUserRetention(startDate, endDate) {
    const weekCount = Math.ceil((endDate - startDate) / (7 * 24 * 60 * 60 * 1000));
    const retentionMatrix = [];

    for (let i = 0; i < weekCount; i++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekUsers = await Activity.distinct('userId', {
        timestamp: { $gte: weekStart, $lt: weekEnd }
      });

      const weekRetention = [];
      for (let j = 0; j <= i; j++) {
        const retentionWeekStart = new Date(weekStart);
        retentionWeekStart.setDate(retentionWeekStart.getDate() + (j * 7));
        const retentionWeekEnd = new Date(retentionWeekStart);
        retentionWeekEnd.setDate(retentionWeekEnd.getDate() + 7);

        const retainedUsers = await Activity.distinct('userId', {
          userId: { $in: weekUsers },
          timestamp: { $gte: retentionWeekStart, $lt: retentionWeekEnd }
        });

        const retentionRate = weekUsers.length > 0
          ? (retainedUsers.length / weekUsers.length) * 100
          : 0;

        weekRetention.push(Math.round(retentionRate));
      }

      retentionMatrix.push(weekRetention);
    }

    return retentionMatrix;
  }

  static async getPopularBooks(startDate, endDate) {
    const bookInteractions = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          resourceModel: 'Book'
        }
      },
      {
        $group: {
          _id: "$resourceId",
          interactions: { $sum: 1 }
        }
      },
      {
        $sort: { interactions: -1 }
      },
      {
        $limit: 10
      }
    ]);

    const maxInteractions = bookInteractions.length > 0 ? bookInteractions[0].interactions : 0;

    const popularBooks = await Promise.all(
      bookInteractions.map(async (interaction) => {
        const book = await Book.findById(interaction._id).select('title image_url').lean();
        if (!book) return null;
        return {
          id: book._id,
          title: book.title,
          coverUrl: book.image_url,
          interactions: interaction.interactions
        };
      })
    );

    return {
      popularBooks: popularBooks.filter(Boolean),
      maxBookInteractions: maxInteractions
    };
  }

  static async getCharacterStats(startDate, endDate) {
    const characterInteractions = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          action: 'CHAT_WITH_CHARACTER'
        }
      },
      {
        $group: {
          _id: "$resourceId",
          totalChats: { $sum: 1 }
        }
      },
      {
        $sort: { totalChats: -1 }
      },
      {
        $limit: 10
      }
    ]);

    const characterStats = await Promise.all(
      characterInteractions.map(async (interaction) => {
        const character = await Character.findById(interaction._id).select('firstName lastName image_url').lean();
        if (!character) return null;
        return {
          id: character._id,
          name: [character.firstName, character.lastName].filter(Boolean).join(' '),
          imageUrl: character.image_url,
          totalChats: interaction.totalChats
        };
      })
    );

    return characterStats.filter(Boolean);
  }

  static async getFeatureTrends(startDate, endDate) {
    const trends = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            action: "$action"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          actions: {
            $push: {
              action: "$_id.action",
              count: "$count"
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return trends.map(day => ({
      date: day._id,
      chats: day.actions.find(a => a.action === 'CHAT_WITH_CHARACTER')?.count || 0,
      imageGen: day.actions.find(a => a.action === 'GENERATE_IMAGE')?.count || 0,
      audioGen: day.actions.find(a => a.action === 'GENERATE_AUDIO')?.count || 0
    }));
  }

  static async exportAnalytics(timeRange) {
    const analytics = await this.getAnalytics(timeRange);
    const cell = (value) => {
      const text = value == null ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = [['Section', 'Metric', 'Value', 'Change vs previous period (%)']];
    const { overview } = analytics;

    rows.push(['Overview', 'Active users', overview.activeUsers, overview.userGrowth]);
    rows.push(['Overview', 'Avg session (min)', overview.avgSessionDuration, overview.sessionGrowth]);
    rows.push(['Overview', 'Interactions', overview.totalInteractions, overview.interactionGrowth]);
    rows.push(['Overview', 'Interactions per 100 users', overview.engagementRate, overview.engagementGrowth]);
    analytics.dailyActiveUsers.forEach(d => rows.push(['Daily active users', d.date, d.users, '']));
    analytics.featureUsage.forEach(f => rows.push(['Feature usage', f.name, f.value, '']));
    analytics.featureTrends.forEach(d => {
      rows.push(['Feature trends', `${d.date} chats`, d.chats, '']);
      rows.push(['Feature trends', `${d.date} images`, d.imageGen, '']);
      rows.push(['Feature trends', `${d.date} audio`, d.audioGen, '']);
    });
    analytics.popularBooks.popularBooks.forEach(b => rows.push(['Popular books', b.title, b.interactions, '']));
    analytics.characterStats.forEach(c => rows.push(['Top characters', c.name, c.totalChats, '']));

    return rows.map(row => row.map(cell).join(',')).join('\n');
  }
}

module.exports = AnalyticsService; 