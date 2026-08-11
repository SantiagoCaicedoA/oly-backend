const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Follow — one edge of the social graph: `follower` follows `following`.
 * Powers the friends feed (posts from people you follow) and follower/following
 * counts on profiles. One document per edge; the unique index makes follow
 * idempotent and prevents duplicates.
 */
const FollowSchema = new Schema(
  {
    follower: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    following: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

// One edge per pair — makes POST /follow idempotent at the DB level.
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });

module.exports = mongoose.model('Follow', FollowSchema);
