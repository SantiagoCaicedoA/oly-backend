const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Schema = mongoose.Schema;

// Profile data (onboarding) – embedded in User so one document has everything
const profileSchema = new Schema(
  {
    profile_image_url: String, // S3 URL for athlete profile photo
    profile_video_url: String, // S3 URL for latest profile video (kept for backward compat)
    profile_video_urls: [String], // All profile video URLs (multiple uploads)
    display_name: String,
    country: String,
    // Leaderboard identity (design doc §4.4, added phase 2): IOC country
    // code, club, and birth YEAR (IWF age categories use birth year, not
    // birthdate). Board entries denormalize these — identity only.
    countryCode: String, // IOC 3-letter, e.g. "COL"
    club: String,
    birth_year: Number,
    age: Number,
    sex: { type: String, enum: ['Male', 'Female', 'Other'] },
    experience_years: Number,
    height_cm: Number,
    bodyweight_value: Number,
    bodyweight_unit: { type: String, enum: ['kg', 'lbs'], default: 'kg' },
    preferred_unit: { type: String, enum: ['Metric', 'Imperial'], default: 'Metric' },
    strength_stats: {
      classic: {
        snatch: { value: Number, checked: Boolean },
        clean_jerk: { value: Number, checked: Boolean },
      },
      variation: {
        power_snatch: { value: Number, checked: Boolean },
        clean: { value: Number, checked: Boolean },
        power_clean: { value: Number, checked: Boolean },
      },
      squat: {
        back_squat: { value: Number, checked: Boolean },
        front_squat: { value: Number, checked: Boolean },
        overhead_squat: { value: Number, checked: Boolean },
      },
      press: {
        strict_press: { value: Number, checked: Boolean },
        push_press: { value: Number, checked: Boolean },
        power_jerk: { value: Number, checked: Boolean },
        jerk: { value: Number, checked: Boolean },
      },
    },
    strength_accuracy: { type: String, enum: ['Tested', 'Estimated', 'Unsure'] },
    considerations: {
      has_limitations: Boolean,
      affected_areas: [String],
      status: { type: String, enum: ['Acute', 'Managed', 'Healed'] },
      impact_level: { type: String, enum: ['Mild', 'Moderate', 'High'] },
      triggers: [String],
    },
    availability: {
      training_days_per_week: { type: Number, min: 1, max: 6 },
      session_duration: { type: Number, enum: [45, 60, 75, 90] },
      preferred_rest_days: [String],
    },
    equipment: { optional: [String] },
    training_preference: {
      type: String,
      enum: ['High Intensity', 'Balanced', 'Higher Volume', 'Adaptive'],
    },
    performance_gaps: [String],
    // Baseline recovery capacity — individualizes volume (Screen 4)
    recovery_profile: { type: String, enum: ['fast', 'average', 'slow'] },

    // Where the athlete is starting from (Screen 6)
    training_phase: {
      type: String,
      enum: [
        'starting_fresh',
        'in_training_block',
        'post_competition',
        'deload_recovery',
        'coming_back',
      ],
    },

    // Recent training load over the last ~4 weeks (Screen 4) – anchors week-1 volume
    recent_training_volume: {
      type: String,
      enum: ['returning', 'light', 'steady', 'heavy'],
    },

    // Upcoming competition the athlete is preparing for (Screen 6)
    competition: {
      preparing: { type: Boolean, default: false },
      name: String,
      date: String, // ISO 'YYYY-MM-DD' as sent by onboarding
      weight_class: String,
      target_total: Number,
    },
  },
  { _id: false }
);

// Signup: name, email, password, username. Profile (onboarding) stored in same document.
const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true, // case-insensitive handles (Instagram-style): stored lowercased
      unique: true,
      // Sparse skips MISSING fields only — an explicit null IS indexed and
      // will collide. Clear a handle by unsetting it, never by writing null.
      sparse: true,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
    },
    profile: {
      type: profileSchema,
      default: undefined,
    },
    // Review-queue access (phase 2). Manual flag — one reviewer today; a
    // roles system is deliberately premature.
    isAdmin: { type: Boolean, default: false },
    // Privacy settings. Every default is the permissive one: a new athlete is
    // discoverable and rankable, because being seen IS the product. These
    // control CONTACT and PROFILE DETAIL, never the leaderboard row itself —
    // a rank is a result other athletes competed against, so it has no opt-out.
    privacy: {
      // Private account: new followers need approval and posts are visible
      // only to accepted followers. Does not hide the leaderboard row.
      accountPrivate: { type: Boolean, default: false },
      // Enforced when messaging ships; stored now so the settings screen is
      // not blocked on it. 'people-i-follow' is spelled out because plain
      // 'following' reads both ways and the two meanings enforce opposite
      // rules, which is a data migration to discover later.
      allowMessagesFrom: {
        type: String,
        enum: ['everyone', 'people-i-follow', 'nobody'],
        default: 'everyone',
      },
      // Both of these are phrased as HIDE, not SHOW, and that is deliberate.
      // Every user created before this shipped has no `privacy` object at all,
      // so the field reads as undefined. With `showClub`, the natural
      // defensive spelling `user.privacy?.showClub` evaluated to false and
      // hid the club for every existing athlete. Worded as `hideClub`, absent
      // means permissive, which is what we want for all four fields.
      //
      // Hides the exact bodyweight on the profile, the athlete card and the
      // leaderboard row. The weight CLASS still shows, because that is what
      // the ranking is built on.
      //
      // KNOWN LIMIT, and the UI copy must not overclaim: Sinclair is a
      // closed-form function of total, bodyweight and sex, so a published
      // Sinclair score plus a published total inverts back to bodyweight
      // within about 0.3kg. Suppressing Sinclair instead would remove the
      // athlete from the Sinclair board, and there is no opt-out from the
      // board. So this setting means "not displayed", not "unknowable".
      // Say that in the settings screen rather than implying secrecy.
      hideBodyweight: { type: Boolean, default: false },
      // Hides club on the profile and on the athlete's leaderboard row.
      hideClub: { type: Boolean, default: false },
    },
    // Notification preferences. Phrased as mute*, and every default is false,
    // for the reason the privacy block learned the hard way: every existing
    // user has no subdocument at all, so an absent field must mean the
    // permissive thing. With `allowSocial: true` a defensive read would have
    // switched notifications OFF for every athlete who never opened settings.
    notifications: {
      // Categories, not nine switches. Nobody wants to reason about whether
      // a follow request is social.
      muteSocial: { type: Boolean, default: false }, // likes, comments, follows
      muteLifts: { type: Boolean, default: false }, // verified / not verified
      muteRank: { type: Boolean, default: false }, // moved up, passed, proximity
      // Quiet hours are ON unless turned off, so absent means protected.
      quietHoursOff: { type: Boolean, default: false },
    },

    // Set when the account is deleted. The document survives because
    // Lift and BoardEntry reference it, so this is what marks the account
    // dead: auth, refresh and signin all refuse it, and buildIdentity
    // derives BoardEntry.anonymized from it.
    anonymizedAt: { type: Date, default: null },
    // Product tier — 'personalized' unlocks the rolling AI coach; 'free' runs the deterministic Oly Team plan.
    subscription: {
      tier: { type: String, enum: ['free', 'personalized'], default: 'free' },
      status: { type: String, enum: ['active', 'canceled', 'trialing'], default: 'active' },
    },
  },
  { timestamps: true }
);

// Encrypt password using bcrypt
userSchema.pre('save', async function (next) {
  // IMPORTANT: must return here — without it, execution falls through and
  // re-hashes the already-hashed password on every save (breaking login).
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Sign JWT and return
userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};

// Sign Refresh Token and return
userSchema.methods.getSignedRefreshToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
  });
};

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
