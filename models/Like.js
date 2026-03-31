const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Like Schema - Tracks user likes on posts and comments
 * Compound index ensures one like per user per post/comment
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
    },
    comment: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

// Compound index: one like per user per post (for post likes where comment is null)
likeSchema.index({ post: 1, user: 1, comment: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);
