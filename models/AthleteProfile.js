const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AthleteProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // Screen 1: Basic Info
  display_name: String,
  country: String,
  age: Number,
  sex: { type: String, enum: ['Male', 'Female', 'Other'] },
  experience_years: Number,

  // Body Stats
  height_cm: Number,
  bodyweight_value: Number,
  bodyweight_unit: { type: String, enum: ['kg', 'lbs'], default: 'kg' },

  // Preferences
  preferred_unit: { type: String, enum: ['Metric', 'Imperial'], default: 'Metric' },

  // Screen 2 & 3: Current Strength
  strength_stats: {
    snatch: { value: Number, checked: Boolean },
    power_snatch: { value: Number, checked: Boolean },
    clean_jerk: { value: Number, checked: Boolean },
    clean: { value: Number, checked: Boolean },
    power_clean: { value: Number, checked: Boolean },
    jerk: { value: Number, checked: Boolean },
    back_squat: { value: Number, checked: Boolean },
    front_squat: { value: Number, checked: Boolean }
  },
  strength_accuracy: { type: String, enum: ['Tested', 'Estimated', 'Unsure'] },

  // Screen 4: Training Considerations
  considerations: {
    has_limitations: Boolean,
    affected_areas: [String], // Multi-select: ['Lower back', 'Knees', ...]
    impact_level: { type: String, enum: ['Mild', 'Moderate', 'High'] }, // Single value
    triggers: [String] // ['Overhead position', 'When fatigued', ...]
  },

  // Screen 5: Availability
  availability: {
    training_days_per_week: { type: Number, min: 2, max: 6 },
    session_duration: { type: Number, enum: [45, 60, 75, 90] },
    preferred_rest_days: [String] // ['Monday', 'Wednesday', ...]
  },

  // Screen 6: Equipment
  equipment: {
    optional: [String] // ['Lifting Blocks', 'Pull-up Bar', ...]
  },

  // Screen 7: Training Preference
  training_preference: {
    type: String,
    enum: ['High Intensity', 'Balanced', 'Higher Volume', 'Adaptive']
  },

  // Screen 8: Performance Gaps
  performance_gaps: [String] // ['Limited leg endurance', 'Slow pull from the floor', ...]

}, {
  timestamps: true
});

module.exports = mongoose.model('AthleteProfile', AthleteProfileSchema);
