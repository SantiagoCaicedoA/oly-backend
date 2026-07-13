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
      sparse: true, // allow null/empty without unique conflict
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
  if (!this.isModified('password')) {
    next();
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
