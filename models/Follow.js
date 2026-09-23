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
    // No single-field index here: both compound indexes below start with
    // these fields, so a standalone one only costs write throughput and RAM.
    follower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    following: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 'pending' only when the target account is private and has not approved
    // this request yet.
    //
    // Reads filter on { status: 'accepted' }, NOT { status: { $ne: 'pending' } }.
    // The negation looks safer because it also matches legacy rows with no
    // status field, but it fails OPEN: a typo'd or future status ('rejected',
    // 'blocked') would read as an accepted follow, on a privacy control. It is
    // also un-indexable, turning covered follower counts into document scans.
    // scripts/backfillFollowStatus.js sets the field on existing rows instead.
    //
    // Four call sites want a TRI-STATE rather than a filter — the follow
    // button needs to show 'requested', and filtering pending away renders it
    // as 'Follow', so tapping it does nothing forever.
    status: {
      type: String,
      enum: ['accepted', 'pending'],
      default: 'accepted',
      required: true,
    },
  },
  { timestamps: true }
);

// One edge per pair — makes POST /follow idempotent at the DB level.
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });
// Counts and lists always qualify by status now, and the approval inbox
// (`{ following: me, status: 'pending' }`) is the only screen accountPrivate
// actually requires. Without these both walk every edge to read the field.
FollowSchema.index({ following: 1, status: 1 });
FollowSchema.index({ follower: 1, status: 1 });

module.exports = mongoose.model('Follow', FollowSchema);
