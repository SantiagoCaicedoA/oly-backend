/**
 * Response schema for Workout Tab / app screens (AI-generated data).
 * training_days = full week (length = athlete's training_days_per_week). todays_training = first day for "today" view.
 */

/**
 * @typedef {Object} SetDetail
 * @property {number} set_number
 * @property {number} [weight]
 * @property {number} [reps]
 * @property {number} [rpm_percent]
 * @property {string} [coach_prescription]
 * @property {string[]} [key_cues]
 */

/**
 * @typedef {Object} TrainingDayItem
 * @property {string} exercise_name
 * @property {string} time
 * @property {number} no_of_set
 * @property {string} [coach_note]
 * @property {SetDetail[]} sets - per-set weight, reps, rpm_percent
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
 * @typedef {Object} DailyCheckIn
 * @property {number} [sleep_quality] - 1-10
 * @property {number} [stress_level] - 1-10
 * @property {number} [mental_readiness] - 1-10
 */

/**
 * @typedef {Object} WorkoutTabData
 * @property {string} coach_note
 * @property {string[]} key_cues
 * @property {TrainingDay[]} training_days - Full week; length = athlete's training_days_per_week
 * @property {TrainingDayItem[]} todays_training - First day's exercises (for "today" view)
 * @property {DailyCheckIn} daily_check_in
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
  daily_check_in: {
    sleep_quality: null,
    stress_level: null,
    mental_readiness: null,
  },
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
const VALID_INTENTS = ['Technical Consistency', 'Speed & Power', 'Strength Under Load', 'Confidence & Exposure'];

function normalizeSet(s, index) {
  if (!s || typeof s !== 'object') return null;
  const setNum = typeof s.set_number === 'number' ? s.set_number : (index + 1);
  const weightRaw = typeof s.weight === 'number' ? s.weight : (typeof s.weight_lifted === 'number' ? s.weight_lifted : null);
  const weight = weightRaw != null && weightRaw > 0 ? weightRaw : null;
  return {
    set_number: setNum,
    weight,
    reps: typeof s.reps === 'number' ? s.reps : null,
    rpm_percent: typeof s.rpm_percent === 'number' ? s.rpm_percent : null,
    coach_prescription: typeof s.coach_prescription === 'string' ? s.coach_prescription : '',
    key_cues: Array.isArray(s.key_cues) ? s.key_cues.filter((c) => typeof c === 'string') : [],
    intent: VALID_INTENTS.includes(s.intent) ? s.intent : 'Technical Consistency',
    context: typeof s.context === 'string' ? s.context : '',
  };
}

function normalizeExercise(t) {
  const rawSets = Array.isArray(t.sets) ? t.sets : [];
  const sets = rawSets.map((s, i) => normalizeSet(s, i)).filter(Boolean);
  const noOfSet = typeof t.no_of_set === 'number' ? t.no_of_set : sets.length || 0;
  const hasName = typeof t.exercise_name === 'string' && String(t.exercise_name).trim() !== '';
  return {
    exercise_name: hasName ? String(t.exercise_name).trim() : '',
    time: typeof t.time === 'string' ? t.time : '',
    no_of_set: noOfSet,
    coach_note: typeof t.coach_note === 'string' ? t.coach_note : '',
    sets: sets.length ? sets : (noOfSet > 0 ? Array.from({ length: noOfSet }, (_, i) => normalizeSet({ set_number: i + 1 }, i)) : []),
    reps: typeof t.reps === 'number' ? t.reps : null,
    weight_lifted: typeof t.weight_lifted === 'number' && t.weight_lifted > 0 ? t.weight_lifted : null,
    rpm_percent: typeof t.rpm_percent === 'number' ? t.rpm_percent : null,
  };
}

function isExerciseObject(e) {
  return e && typeof e === 'object' && (typeof e.exercise_name === 'string' && e.exercise_name.trim() !== '' || Array.isArray(e.sets) && e.sets.length > 0);
}

function normalizeTrainingDays(trainingDays) {
  if (!Array.isArray(trainingDays)) return [];
  return trainingDays.map((d) => ({
    day: typeof d.day === 'number' ? d.day : 0,
    day_label: typeof d.day_label === 'string' ? d.day_label : '',
    exercises: Array.isArray(d.exercises) ? d.exercises.filter(isExerciseObject).map(normalizeExercise) : [],
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
    daily_check_in: {
      sleep_quality: typeof data.daily_check_in?.sleep_quality === 'number' ? data.daily_check_in.sleep_quality : 5,
      stress_level: typeof data.daily_check_in?.stress_level === 'number' ? data.daily_check_in.stress_level : 5,
      mental_readiness: typeof data.daily_check_in?.mental_readiness === 'number' ? data.daily_check_in.mental_readiness : 5,
    },
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
