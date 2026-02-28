const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Like Schema - Tracks user likes on posts
 * Compound index ensures one like per user per post
 */
const likeSchema = new Schema(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

// Compound index: one like per user per post
likeSchema.index({ post: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);
