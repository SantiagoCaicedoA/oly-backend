const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PostSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: '' },
    username: { type: String, default: '' },

    // Media (video required; image optional)
    image_url: { type: String, default: '' },
    video_url: { type: String, default: '' }, // required: upload (field "video") or video_url in body

    // Frontend: lift name (e.g. "Clean & Jerk")
    lift_name: { type: String, default: '' },
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

module.exports = mongoose.model('Post', PostSchema);
