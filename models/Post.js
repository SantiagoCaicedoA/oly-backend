const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PostSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: '' },
    username: { type: String, default: '' },

    // Media (video required; image optional; thumbnail optional – for feed so app doesn't load all videos)
    image_url: { type: String, default: '' },
    video_url: { type: String, default: '' }, // required: upload (field "video") or video_url in body
    thumbnail_url: { type: String, default: '' }, // optional: upload (field "thumbnail") or thumbnail_url in body – shown in feed

    // Frontend: lift name (e.g. "Clean & Jerk")
    // Display text ONLY. Never matched on. Two spellings of one lift is how
    // "best clean and jerk" ended up finding half of them.
    lift_name: { type: String, default: '' },
    // The canonical id from utils/liftCatalog. Everything that queries by
    // lift keys off this. Null means the name could not be resolved, which
    // is deliberate: a gap is visible, a wrong guess is not.
    lift_id: { type: String, default: null },
    // When the athlete actually stood on the scale, not when they posted.
    // Without it there is no way to tell a fresh weigh-in from a year-old
    // one, and it is the field the top-10 verification will hang off.
    bodyweight_recorded_at: { type: Date, default: null },
    // Opinion (user's notes/comment)
    opinion: { type: String, default: '' },
    // Frontend session_detail object (stored as-is)
    session_detail: { type: Schema.Types.Mixed, default: null },
    // Mapped from session_detail for querying / backward compat
    load_lifted: { type: Number, default: null },
    load_unit: { type: String, enum: ['kg', 'lbs'], default: 'kg' },
    context: { type: String, default: '' },
    context_value: { type: String, default: '' },
    intent: { type: String, default: '' },
    effort: { type: String, default: '' },

    // Visibility: PRIVATE = "Just me", SHARED_WITH_FRIENDS = "Public"
    // Denormalised from the author's User.privacy.accountPrivate.
    //
    // The feed cannot look this up per author: feed=all is the default and
    // the app's home screen, so that would be one User read per post per
    // page. Absent means public, which is why the filter is `$ne: true` and
    // why no backfill is needed for posts written before privacy existed.
    // Kept in sync by the privacy settings write.
    authorPrivate: { type: Boolean, default: false },
    visibility: {
      type: [String],
      enum: ['PRIVATE', 'SHARED_WITH_FRIENDS'],
      default: ['PRIVATE'],
    },

    // DRAFT = "Save draft", PUBLISHED = "Post"
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED'],
      default: 'DRAFT',
    },
  },
  { timestamps: true }
);

// Feed queries: filter by visibility/status (+ user for feed=friends/mine), sort by newest.
// Without these every feed request is a full collection scan that slows as posts grow.
PostSchema.index({ visibility: 1, status: 1, createdAt: -1 });
// feed=all adds authorPrivate to that same predicate.
PostSchema.index({ authorPrivate: 1, visibility: 1, status: 1, createdAt: -1 });
// Badge rules ask "this athlete's posts of this lift, newest first".
PostSchema.index({ user: 1, lift_id: 1, createdAt: -1 });
// Cross-athlete lift lookups. Partial, because until the backfill runs (and
// permanently for names the catalogue cannot resolve) most rows are null, and
// an index whose commonest value is null is mostly dead weight.
PostSchema.index({ lift_id: 1 }, { partialFilterExpression: { lift_id: { $type: 'string' } } });
PostSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Post', PostSchema);
