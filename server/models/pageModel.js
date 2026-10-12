const mongoose = require('mongoose');

const PageSchema = new mongoose.Schema({
  pageText: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  pageNumber: {
    type: Number,
    required: false,
    unique: false
  },
  image_url: {
    type: String,
    required: false,
    trim: true,
    unique: false
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Books',
    required: true
  }
});

module.exports = mongoose.model.Pages || mongoose.model('Pages', PageSchema);