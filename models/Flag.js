const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Flag — a viewer's report on a lift (design doc §4.1/§5).
 *
 * Phase-2 behavior: flags QUEUE FOR REVIEW ONLY — the lift stays on the
 * boards. Auto-suspend exists in config but ships disabled: at a small user
 * base a few-flags threshold is a griefing vector (three training partners
 * could remove a rival's #1). One flag per user per lift, never on your own
 * lift, rate-limited.
 */
const FlagSchema = new Schema(
  {
    lift: { type: Schema.Types.ObjectId, ref: 'Lift', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      enum: ['fake_weight', 'wrong_bodyweight', 'wrong_lift', 'not_athlete', 'other'],
      required: true,
    },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

FlagSchema.index({ lift: 1, user: 1 }, { unique: true }); // one flag per user per lift

module.exports = mongoose.model('Flag', FlagSchema);
