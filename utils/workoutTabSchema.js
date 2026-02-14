/**
 * Response schema for Workout Tab / app screens (AI-generated data).
 * training_days = full week (length = athlete's training_days_per_week). todays_training = first day for "today" view.
 */

/**
 * @typedef {Object} TrainingDayItem
 * @property {string} exercise_name
 * @property {string} time - e.g. "15 min"
 * @property {number} no_of_set
 */

/**
 * @typedef {Object} TrainingDay
 * @property {number} day - 1-based day number
 * @property {string} day_label - e.g. "Day 1", "Monday"
 * @property {TrainingDayItem[]} exercises
 */

/**
 * @typedef {Object} SuggestedExercise
 * @property {string} lift_name
 * @property {string} description
 * @property {string} label - e.g. "EXERCISE FIT", "GREAT FIT"
 */

/**
 * @typedef {Object} WorkoutTabData
 * @property {string} coach_note
 * @property {string[]} key_cues
 * @property {TrainingDay[]} training_days - Full week; length = athlete's training_days_per_week
 * @property {TrainingDayItem[]} todays_training - First day's exercises (for "today" view)
 * @property {number} [sleep_quality] - 1-10
 * @property {number} [stress_level] - 1-10
 * @property {number} [mental_readiness] - 1-10
 * @property {string} coach_prescription
 * @property {string[]} key_cues_of_specific_lift
 * @property {number} [weight_lifted]
 * @property {number} [reps]
 * @property {SuggestedExercise[]} suggested_exercises
 */

const DEFAULT_WORKOUT_TAB_DATA = {
  coach_note: '',
  key_cues: [],
  training_days: [],
  todays_training: [],
  sleep_quality: null,
  stress_level: null,
  mental_readiness: null,
  coach_prescription: '',
  key_cues_of_specific_lift: [],
  weight_lifted: null,
  reps: null,
  suggested_exercises: [],
};

/**
 * Ensure response has the workout-tab shape (fill missing keys with defaults).
 * @param {object} data - Parsed AI response
 * @returns {WorkoutTabData}
 */
function normalizeExercise(t) {
  return {
    exercise_name: typeof t.exercise_name === 'string' ? t.exercise_name : '',
    time: typeof t.time === 'string' ? t.time : '',
    no_of_set: typeof t.no_of_set === 'number' ? t.no_of_set : 0,
  };
}

function normalizeTrainingDays(trainingDays) {
  if (!Array.isArray(trainingDays)) return [];
  return trainingDays.map((d) => ({
    day: typeof d.day === 'number' ? d.day : 0,
    day_label: typeof d.day_label === 'string' ? d.day_label : '',
    exercises: Array.isArray(d.exercises) ? d.exercises.map(normalizeExercise) : [],
  }));
}

function normalizeWorkoutTabData(data) {
  if (!data || typeof data !== 'object') return { ...DEFAULT_WORKOUT_TAB_DATA };
  const training_days = normalizeTrainingDays(data.training_days);
  const todaysFromDays = training_days.length > 0 ? training_days[0].exercises : [];
  const todays_training = Array.isArray(data.todays_training)
    ? data.todays_training.map(normalizeExercise)
    : todaysFromDays;
  return {
    coach_note: typeof data.coach_note === 'string' ? data.coach_note : '',
    key_cues: Array.isArray(data.key_cues) ? data.key_cues.filter((c) => typeof c === 'string') : [],
    training_days,
    todays_training: todays_training.length > 0 ? todays_training : todaysFromDays,
    sleep_quality: typeof data.sleep_quality === 'number' ? data.sleep_quality : null,
    stress_level: typeof data.stress_level === 'number' ? data.stress_level : null,
    mental_readiness: typeof data.mental_readiness === 'number' ? data.mental_readiness : null,
    coach_prescription: typeof data.coach_prescription === 'string' ? data.coach_prescription : '',
    key_cues_of_specific_lift: Array.isArray(data.key_cues_of_specific_lift)
      ? data.key_cues_of_specific_lift.filter((c) => typeof c === 'string')
      : [],
    weight_lifted: typeof data.weight_lifted === 'number' ? data.weight_lifted : null,
    reps: typeof data.reps === 'number' ? data.reps : null,
    suggested_exercises: Array.isArray(data.suggested_exercises)
      ? data.suggested_exercises.map((e) => ({
          lift_name: typeof e.lift_name === 'string' ? e.lift_name : '',
          description: typeof e.description === 'string' ? e.description : '',
          label: typeof e.label === 'string' ? e.label : '',
        }))
      : [],
  };
}

module.exports = {
  DEFAULT_WORKOUT_TAB_DATA,
  normalizeWorkoutTabData,
};
