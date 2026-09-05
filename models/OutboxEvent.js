const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * OutboxEvent — at-least-once handoff from the submit transaction to the
 * background worker (design doc §5).
 *
 * The request path stays minimal: persist the Lift, recompute the
 * submitter's own entries, enqueue ONE event naming the partitions that
 * changed. The worker drains pending events and renumbers those partitions'
 * materialized ranks — an idempotent sorted $set (never $inc), so replaying
 * any event any number of times produces the identical board. That property
 * is what makes at-least-once delivery safe, and the triple-replay check
 * asserts it.
 */
const OutboxEventSchema = new Schema(
  {
    type: { type: String, enum: ['renumber'], required: true },
    // Partitions to renumber: [{ scopeKey, sex, weightClass }]
    partitions: [
      {
        _id: false,
        scopeKey: { type: String, required: true },
        sex: { type: String, enum: ['M', 'F'], required: true },
        weightClass: { type: String, required: true },
      },
    ],
    lift: { type: Schema.Types.ObjectId, ref: 'Lift', default: null },
    // Lifecycle (review round 4): pending → processing → done|failed.
    // 'processing' is the ATOMIC CLAIM — without it, two workers both match
    // pending, both renumber the same partition mid-write, and produce a
    // torn board with no error anywhere. The in-process serial loop hides
    // that today; the claim makes it correct when the worker moves out of
    // process in phase 3 (and a reaper returns crashed claims to pending).
    status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    // Retry backoff: a failed event becomes pending again with availableAt
    // in the future, so retries land on LATER ticks — a 2s Mongo blip no
    // longer burns all 5 attempts back-to-back into a permanent failure.
    availableAt: { type: Date, default: Date.now },
    claimedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Drain order: oldest available pending first; reaper scans processing.
OutboxEventSchema.index({ status: 1, availableAt: 1, createdAt: 1 });

module.exports = mongoose.model('OutboxEvent', OutboxEventSchema);
