const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Report — abuse reporting for people and content.
 *
 * Distinct from Flag, which disputes whether a LIFT is accurate (fake weight,
 * wrong bodyweight). This is about conduct: harassment, hate, spam, sexual
 * content, impersonation. The two have different reviewers and different
 * outcomes, so they stay separate models rather than one overloaded enum.
 *
 * Apple requires a working report path for any app carrying user-generated
 * content, so this ships with the MVP rather than after it.
 */
const ReportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: {
      type: String,
      enum: ['user', 'post', 'comment'],
      required: true,
    },
    // Not a ref: the id points at whichever collection targetType names.
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: {
      type: String,
      enum: ['harassment', 'hate', 'spam', 'sexual', 'impersonation', 'violence', 'other'],
      required: true,
    },
    note: { type: String, maxlength: 1000 },
    status: {
      type: String,
      enum: ['open', 'actioned', 'dismissed'],
      default: 'open',
    },
    // Set when a human closes it, so review work is auditable.
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One OPEN report per reporter per target. Unconditional uniqueness looked
// tidier but silenced the reporter permanently: report someone for spam, have
// it dismissed, get harassed by them a week later, and the second report is
// rejected as a duplicate forever. Partial on status means the POST stays
// idempotent while a report is open and works again once it is closed.
ReportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);
// Review queue: oldest open first.
ReportSchema.index({ status: 1, createdAt: 1 });
// A moderator's second question is always "what else has been reported about
// this account", which the single-field targetId index cannot answer well.
ReportSchema.index({ targetType: 1, targetId: 1, status: 1 });

module.exports = mongoose.model('Report', ReportSchema);
