/**
 * Builds day-wise week structure from AI workout-tab response + profile (rest days).
 * Used to store and serve weekly training (monday: data, tuesday: data, wednesday: rest, etc.).
 */

const { DAY_NAMES } = require('../models/WeeklyTraining');

const WEEKDAY_NORMALIZE = {
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
  sunday: 'sunday',
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday',
  'day 1': 'monday',
  'day 2': 'tuesday',
  'day 3': 'wednesday',
  'day 4': 'thursday',
  'day 5': 'friday',
  'day 6': 'saturday',
  'day 7': 'sunday',
};

function normalizeDayLabel(label) {
  if (!label || typeof label !== 'string') return null;
  const key = label.toLowerCase().trim();
  return WEEKDAY_NORMALIZE[key] || WEEKDAY_NORMALIZE[key.replace(/\s+/g, ' ')] || null;
}

function isRestDay(dayName, preferredRestDays) {
  if (!Array.isArray(preferredRestDays)) return false;
  const lower = dayName.toLowerCase();
  return preferredRestDays.some((d) => String(d).toLowerCase() === lower);
}

/**
 * Map AI workout-tab response + profile to days object (monday..sunday).
 * Each day is either { type: 'rest' } or { type: 'training', exercises, coach_note, key_cues, ... }.
 * @param {object} workoutData - Normalized workout tab data (training_days, coach_note, key_cues, etc.)
 * @param {object} profile - User profile (availability.preferred_rest_days)
 * @returns {object} days = { monday: {...}, tuesday: {...}, ... }
 */
function mapResponseToDays(workoutData, profile) {
  const preferredRestDays = profile?.availability?.preferred_rest_days || [];
  const trainingDays = Array.isArray(workoutData.training_days) ? workoutData.training_days : [];
  const coachNote = workoutData.coach_note || '';
  const keyCues = Array.isArray(workoutData.key_cues) ? workoutData.key_cues : [];
  const coachPrescription = workoutData.coach_prescription || '';
  const keyCuesLift = Array.isArray(workoutData.key_cues_of_specific_lift) ? workoutData.key_cues_of_specific_lift : [];
  const weightLifted = workoutData.weight_lifted;
  const reps = workoutData.reps;

  function mapSet(s, index) {
    if (!s || typeof s !== 'object') return { set_number: index + 1, weight: null, reps: null, rpm_percent: null };
    const w = typeof s.weight === 'number' ? s.weight : (typeof s.weight_lifted === 'number' ? s.weight_lifted : null);
    return {
      set_number: typeof s.set_number === 'number' ? s.set_number : (index + 1),
      weight: w != null && w > 0 ? w : null,
      reps: typeof s.reps === 'number' ? s.reps : null,
      rpm_percent: typeof s.rpm_percent === 'number' ? s.rpm_percent : null,
      coach_prescription: typeof s.coach_prescription === 'string' ? s.coach_prescription : '',
      key_cues: Array.isArray(s.key_cues) ? s.key_cues.filter(c => typeof c === 'string') : [],
    };
  }

  function isExercise(e) {
    return e && typeof e === 'object' && ((typeof e.exercise_name === 'string' && e.exercise_name.trim() !== '') || (Array.isArray(e.sets) && e.sets.length > 0));
  }

  const dayToTraining = {};
  for (const td of trainingDays) {
    const dayName = normalizeDayLabel(td.day_label);
    if (dayName) dayToTraining[dayName] = td;
  }

  const days = {};
  for (const dayName of DAY_NAMES) {
    if (isRestDay(dayName, preferredRestDays)) {
      days[dayName] = { type: 'rest' };
      continue;
    }
    const td = dayToTraining[dayName];
    if (!td || !Array.isArray(td.exercises) || td.exercises.length === 0) {
      days[dayName] = { type: 'rest' };
      continue;
    }
    const validExercises = td.exercises.filter(isExercise);
    days[dayName] = {
      type: 'training',
      coach_note: coachNote,
      key_cues: keyCues,
      daily_check_in: {
        sleep_quality: workoutData.daily_check_in?.sleep_quality ?? 5,
        stress_level: workoutData.daily_check_in?.stress_level ?? 5,
        mental_readiness: workoutData.daily_check_in?.mental_readiness ?? 5,
      }, exercises: validExercises.map((e) => {
        const rawSets = Array.isArray(e.sets) ? e.sets : [];
        const sets = rawSets.map((s, i) => mapSet(s, i));
        return {
          exercise_name: e.exercise_name || '',
          time: e.time || '',
          no_of_set: typeof e.no_of_set === 'number' ? e.no_of_set : sets.length,
          coach_note: e.coach_note || '',
          sets,
          reps: typeof e.reps === 'number' ? e.reps : null,
          weight_lifted: typeof e.weight_lifted === 'number' && e.weight_lifted > 0 ? e.weight_lifted : null,
          rpm_percent: typeof e.rpm_percent === 'number' ? e.rpm_percent : null,
        };
      }),
      coach_prescription: coachPrescription,
      key_cues_of_specific_lift: keyCuesLift,
      weight_lifted: weightLifted,
      reps,
    };
  }
  return days;
}

/**
 * Get Sunday 00:00:00 of the week containing the given date (locale-safe).
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const sunday = new Date(d);
  sunday.setDate(diff);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

/**
 * Get next Sunday 00:00:00 (for cron "next week").
 */
function getNextWeekStart(date) {
  const thisSunday = getWeekStart(date);
  const next = new Date(thisSunday);
  next.setDate(next.getDate() + 7);
  return next;
}

module.exports = {
  mapResponseToDays,
  getWeekStart,
  getNextWeekStart,
  isRestDay,
  normalizeDayLabel,
};
