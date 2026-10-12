const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN',
      'REGISTER',
      'VIEW_BOOK',
      'PURCHASE_BOOK',
      'CHAT_WITH_CHARACTER',
      'GENERATE_IMAGE',
      'GENERATE_AUDIO',
      'UPDATE_PROFILE',
      'BOOK_UPLOAD',
      'CHARACTER_GENERATION'
    ]
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'resourceModel'
  },
  resourceModel: {
    type: String,
    enum: ['Book', 'Character', 'User', null]
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient querying
activitySchema.index({ userId: 1, timestamp: -1 });
activitySchema.index({ action: 1, timestamp: -1 });

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity; 