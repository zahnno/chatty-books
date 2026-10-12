const mongoose = require('mongoose');

// On/off switch for each paid feature: a feature runs only while its record
// exists and isActive is true. What a use costs comes from CostEstimate (the
// provider's cost plus markup, see services/costEstimateService.js), not from
// here. These records used to carry a token price too, which is why they
// still live in the `tokencosts` collection.
const featureSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'BOOK_PURCHASE',
        'CHAT_WITH_CHARACTER',
        'VOICE_CHAT_WITH_CHARACTER',
        'SCENE_IMAGE_GENERATION',
        'TEXT_TO_SPEECH',
        'TEXT_GENERATION',
        'VIDEO_GENERATION'
      ]
    },
    // Legacy per-book records (book purchases). Switches are the null-book ones.
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Books',
      default: null
    },
    description: {
      type: String
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

featureSchema.index({ action: 1, bookId: 1 }, { unique: true });

featureSchema.statics.isEnabled = async function(action) {
  return !!(await this.exists({ action, isActive: true }));
};

module.exports = mongoose.model('Feature', featureSchema, 'tokencosts');
