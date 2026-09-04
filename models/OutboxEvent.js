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
    status: { type: String, enum: ['pending', 'done', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Drain order: oldest pending first.
OutboxEventSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('OutboxEvent', OutboxEventSchema);
