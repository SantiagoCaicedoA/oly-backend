const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * AuditLog — append-only record of board-affecting actions (design doc §8).
 * Submissions, review decisions and anonymizations all leave a row; the
 * "source of truth" claim rests on being able to answer "who did what,
 * when" for every board mutation. Moderator actions are themselves logged.
 */
const AuditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['lift.submit', 'lift.flag', 'review.approve', 'review.remove', 'account.anonymize'],
      required: true,
    },
    subject: { type: Schema.Types.ObjectId, default: null }, // lift/user acted on
    meta: { type: Object, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ subject: 1, createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
