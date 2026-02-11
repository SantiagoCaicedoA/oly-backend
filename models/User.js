const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Profile data (onboarding) – embedded in User so one document has everything
const profileSchema = new Schema(
  {
    profile_image_url: String, // S3 URL for athlete profile photo
    profile_video_url: String, // S3 URL for athlete profile video
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
  },
  { _id: false }
);

// Signup: name, email, password. Profile (onboarding) stored in same document.
const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
