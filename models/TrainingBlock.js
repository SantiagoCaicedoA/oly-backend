/**
 * TrainingBlock — the stored forward PLAN for an athlete (the "what's coming").
 * Created once per 12-week block; holds a per-week map of phase / intensity target /
 * intention. The Week Builder materializes each week's concrete sessions from this
 * plan + the athlete's maxes + their recent logs. One athlete has one active block
 * at a time; blocks roll (Base -> Peak -> Base ...) as each completes.
 */
const mongoose = require('mongoose');

const planWeekSchema = new mongoose.Schema(
  {
    week: Number, // 1..weeks_total
    phase: String, // Base | Strength | Peak | Deload | Taper | Max-Out | Base Test
    acc: String, // accessory/secondary volume level
    top_intensity: Number, // planned top % of the main classic lift (null on special weeks)
    squat_pct: Number, // planned squat working % (null on special weeks)
    is_deload: Boolean,
    is_special: Boolean, // max-out / base-test week
    note: String, // the week's intention — drives the coach note's "where you are / why"
  },
  { _id: false }
);

const trainingBlockSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    tier: { type: String, enum: ['team', 'personalized'], default: 'team' },
    season_key: { type: String, enum: ['base', 'peak'] },
    season_name: String,
    start_date: Date, // the week-1 Sunday
    weeks_total: { type: Number, default: 12 },
    ending: String, // max_out | base_test
    meet_date: Date, // optional — drives personalized peaking (paid)
    plan: [planWeekSchema], // the forward map
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrainingBlock', trainingBlockSchema);
