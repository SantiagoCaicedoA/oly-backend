const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { TYPE_NAMES } = require('../utils/notificationTypes');

/**
 * Notification — both the in-app record and the delivery queue.
 *
 * One document rather than two on purpose. A separate queue would mean the
 * bell icon and the push could disagree about what happened, and the first
 * time an athlete sees a push for something the app does not show they stop
 * trusting both. The lifecycle fields below are the same atomic-claim shape
 * OutboxEvent uses, for the same reason: without a claim two workers both
 * match pending and the same person gets buzzed twice.
 */
const NotificationSchema = new Schema(
  {
    // Recipient.
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: TYPE_NAMES, required: true },
    // Who caused it. Null for anything the system did on its own.
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Rendered at CREATE time. Rendering at send time would mean the text
    // changing when somebody renames themselves, and a deleted post leaving
    // a blank line in the history.
    title: { type: String, required: true },
    body: { type: String, required: true },
    // Where tapping it should land. Kept loose because the app owns routing.
    data: { type: Schema.Types.Mixed, default: null },

    // Collapsing. Twenty likes on one lift is one row saying twenty, not
    // twenty rows. `count` is what the body renders from.
    groupKey: { type: String, default: null },
    count: { type: Number, default: 1 },

    readAt: { type: Date, default: null },

    // ---- delivery ----
    // 'suppressed' is a real outcome, not a failure: the athlete turned this
    // type off, or has no device. The row still exists so the bell shows it.
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed', 'suppressed'],
      default: 'pending',
    },
    // Not before this. Carries both the batching window and quiet hours, so
    // "hold this until 8am" and "hold this for ten minutes in case more likes
    // arrive" are the same mechanism.
    availableAt: { type: Date, default: Date.now },
    attempts: { type: Number, default: 0 },
    claimedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The worker's only query: what is due now.
NotificationSchema.index({ status: 1, availableAt: 1 });
// The bell: newest first, and the unread count.
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, readAt: 1 });
// The merge target. Partial, because a collapsed notification is the
// exception and most rows have no group at all. Scoped to rows still waiting
// to go out: once something has been delivered, a new like must start a new
// notification rather than silently editing one already on a lock screen.
NotificationSchema.index(
  { user: 1, groupKey: 1, status: 1 },
  { partialFilterExpression: { groupKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Notification', NotificationSchema);
