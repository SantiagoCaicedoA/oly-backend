const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Block — `blocker` no longer wants any contact from `blocked`.
 *
 * A block is deliberately one-directional as a record but two-directional in
 * effect: neither party sees the other's posts, comments or profile activity,
 * and neither can follow or message the other. Storing it one way keeps the
 * "who did this" question answerable; enforcement reads both directions.
 *
 * Blocking does NOT touch the leaderboard. A rank is an athletic result that
 * other athletes earned against, so it stays visible to everyone. Blocking is
 * about contact, not about erasing someone from the sport.
 */
const BlockSchema = new Schema(
  {
    blocker: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blocked: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// One block per pair — makes POST /blocks idempotent at the DB level.
// Both directions of the two-way check ("is A blocked by B, or B by A") use
// this same index, so the $or is cheap. `blocker` alone is a strict prefix of
// it and would just cost writes.
BlockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
// The reverse lookup, "who has blocked me", has no prefix to ride on.
BlockSchema.index({ blocked: 1, blocker: 1 });

module.exports = mongoose.model('Block', BlockSchema);
