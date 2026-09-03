const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Season — a ~3-month competitive window for the leaderboard.
 *
 * Lifecycle (design doc §4.3): `active` while running; at endsAt the season
 * enters `grace` (7 days — in-season-dated lifts still accepted, standings
 * can still move); at snapshotAt the final standings freeze into
 * SeasonResult and the season is `closed` — immutable, unreachable by
 * backdating (the liftDate clamp in the phase-2 submission flow enforces
 * liftDate >= the latest closed season's snapshotAt).
 */
const SeasonSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // "S1", "S2", ...
    label: { type: String, required: true }, // "Season 1"
    startsAt: { type: Date, required: true }, // UTC
    endsAt: { type: Date, required: true }, // UTC
    snapshotAt: { type: Date, required: true }, // endsAt + 7d grace
    status: {
      type: String,
      enum: ['active', 'grace', 'closed'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Season', SeasonSchema);
