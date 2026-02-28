const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const setDetailSchema = new Schema(
  {
    set_number: { type: Number, required: true },
    weight: Number,
    reps: Number,
    rpm_percent: Number,
    coach_prescription: String,
    key_cues: [String],
    bar_speed: String,
    position_quality: String,
    was_it_a_miss: { type: Boolean, default: false },
    where_did_it_fail: String,
    missed_where: String,
    any_pain_or_discomfort: { type: Boolean, default: false },
    pain_level: String,
    pain_where: [String],
    // AI-generated intent and context for each set
    intent: {
      type: String,
      enum: ['Technical Consistency', 'Speed & Power', 'Strength Under Load', 'Confidence & Exposure'],
    },
    context: String, // e.g., "Set 4 of 5" or specific instructions for top sets
  },
  { _id: false }
);

const exerciseItemSchema = new Schema(
  {
    exercise_name: String,
    time: String,
    no_of_set: Number,
    sets: [setDetailSchema],
    coach_note: String,
  },
  { _id: false }
);

const dailyCheckInSchema = new Schema(
  {
    sleep_quality: { type: Number, default: 5 },
    stress_level: { type: Number, default: 5 },
    mental_readiness: { type: Number, default: 5 },
    motivation: { type: String, default: 'Neutral' },
    muscle_soreness: { type: Number, default: 0 },
    sore_areas: [String],
    intensity: { type: Number, default: 0 },
  },
  { _id: false }
);

const trainingDayContentSchema = new Schema(
  {
    type: { type: String, enum: ['training', 'rest'], required: true },
    coach_note: String,
    key_cues: [String],
    daily_check_in: {
      type: dailyCheckInSchema,
      default: () => ({ sleep_quality: null, stress_level: null, mental_readiness: null })
    },
    exercises: [exerciseItemSchema],
    coach_prescription: String,
    key_cues_of_specific_lift: [String],
    // Legacy day-level values (optional; prefer per-exercise reps/weight)
    weight_lifted: Number,
    reps: Number,
  },
  { _id: false }
);

const dayMapSchema = new Schema(
  {
    monday: { type: trainingDayContentSchema, default: () => ({ type: 'rest' }) },
    tuesday: { type: trainingDayContentSchema, default: () => ({ type: 'rest' }) },
    wednesday: { type: trainingDayContentSchema, default: () => ({ type: 'rest' }) },
    thursday: { type: trainingDayContentSchema, default: () => ({ type: 'rest' }) },
    friday: { type: trainingDayContentSchema, default: () => ({ type: 'rest' }) },
    saturday: { type: trainingDayContentSchema, default: () => ({ type: 'rest' }) },
    sunday: { type: trainingDayContentSchema, default: () => ({ type: 'rest' }) },
  },
  { _id: false }
);

const weeklyTrainingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    week_start: { type: Date, required: true, index: true },
    days: { type: dayMapSchema, default: () => ({}) },
    profile_snapshot: {
      training_days_per_week: Number,
      preferred_rest_days: [String],
      session_duration: Number,
    },
    is_first_week: { type: Boolean, default: false },
  },
  { timestamps: true }
);

weeklyTrainingSchema.index({ user: 1, week_start: -1 });

module.exports = mongoose.model('WeeklyTraining', weeklyTrainingSchema);
module.exports.DAY_NAMES = DAY_NAMES;
