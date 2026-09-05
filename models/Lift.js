const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Lift — the append-only submission log and the system's source of truth.
 *
 * Lifts are never deleted, only status-transitioned; the log doubles as the
 * audit trail behind "if it's not on Oly, it's not verified", and
 * scripts/rebuildBoards (phase 2) can regenerate every BoardEntry from it.
 *
 * Status model (design doc §5, trust-by-default):
 *   live      — ranked (the default on submit)
 *   held      — crossed an absolute plausibility cap; ranks only after review
 *   suspended — pulled from boards pending review (auto-suspend ships
 *               disabled; phase-2 flags only queue for review)
 *   removed   — reviewer rejected it; reason shown to the athlete
 *
 * pendingReview is ORTHOGONAL to status: a top-3 lift on a mature board is
 * live + pendingReview (ranks instantly, wears the badge, overtake
 * notifications gated until the badge clears).
 */
const LiftSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    liftType: { type: String, enum: ['snatch', 'cleanjerk'], required: true },
    weightKg: { type: Number, required: true, min: 20, max: 300 },
    bodyweightKg: { type: Number, required: true, min: 25, max: 250 },
    liftDate: { type: Date, required: true }, // when performed (validated: <= now, backdate-clamped)
    videoUrl: { type: String, required: true }, // S3 URL from the upload flow — no video, no rank
    status: {
      type: String,
      enum: ['live', 'held', 'suspended', 'removed'],
      default: 'live',
    },
    pendingReview: { type: Boolean, default: false },
    flagCount: { type: Number, default: 0 },
    review: {
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
      reason: String,
    },
    // Client-generated idempotency key — retries return the original lift.
    idemKey: { type: String, required: true },
  },
  { timestamps: true }
);

LiftSchema.index({ user: 1, status: 1, createdAt: -1 });
// Recompute reads {user, status:'live', liftDate range} — this keeps its
// cost independent of career length (review round 4: matters in year 3).
LiftSchema.index({ user: 1, status: 1, liftDate: 1 });
LiftSchema.index({ status: 1, pendingReview: 1, createdAt: 1 }); // review queue, oldest first
LiftSchema.index({ user: 1, idemKey: 1 }, { unique: true }); // duplicate-submit guard

module.exports = mongoose.model('Lift', LiftSchema);
