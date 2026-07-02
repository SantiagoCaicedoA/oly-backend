/**
 * Generate a full training week via AI and store it in WeeklyTraining.
 * Used after onboarding (first week) and by Sunday cron (next week).
 */

const User = require('../models/User');
const WeeklyTraining = require('../models/WeeklyTraining');
const { generateTrainingResponse, resolveTier, tierCeiling } = require('./openaiService');
const { normalizeWorkoutTabData } = require('../utils/workoutTabSchema');
const { mapResponseToDays, getWeekStart, getNextWeekStart } = require('./trainingWeekService');

/**
 * Check if user has enough profile to generate (availability with training_days_per_week).
 */
function canGenerateWeek(profile) {
  if (!profile || typeof profile !== 'object') return false;
  const av = profile.availability;
  return av && typeof av.training_days_per_week === 'number' && av.training_days_per_week >= 1;
}

/**
 * Generate this week's training via AI and save to DB.
 * @param {object} user - User document with profile (from DB)
 * @param {object} options - { weekStart?: Date, isFirstWeek?: boolean }
 * @returns {Promise<object>} Saved WeeklyTraining document
 */

/** Athlete maxes for deterministic weight computation. */
function getMaxes(profile) {
  const ss = (profile && profile.strength_stats) || {};
  const gv = (o) => (o && typeof o.value === 'number' && o.value > 0 ? o.value : null);
  return {
    snatch: gv(ss.classic && ss.classic.snatch),
    cj: gv(ss.classic && ss.classic.clean_jerk),
    clean: gv(ss.variation && ss.variation.clean),
    backSquat: gv(ss.squat && ss.squat.back_squat),
    frontSquat: gv(ss.squat && ss.squat.front_squat),
  };
}

/**
 * Deterministic weight fix: LLMs mislabel weights. For the competition lifts,
 * pulls and squats (where the base max is known) recompute weight = % x max,
 * rounded to 2.5 kg. Variations/jerk work are left to the model.
 */
function recomputeMainWeights(days, m) {
  const round = (w) => Math.round(w / 2.5) * 2.5;
  const baseFor = (name) => {
    const n = String(name || '').toLowerCase();
    if (n.includes('pull')) {
      if (n.includes('snatch')) return m.snatch;
      if (n.includes('clean')) return m.clean || m.cj;
      return null;
    }
    if (n.includes('squat') && !n.includes('overhead')) return n.includes('front') ? m.frontSquat : m.backSquat;
    if (n === 'snatch') return m.snatch;
    if (n.replace(/&/g, 'and').includes('clean and jerk')) return m.cj;
    if (n === 'clean') return m.clean || m.cj;
    return null;
  };
  Object.values(days || {}).forEach((day) => {
    if (!day || !Array.isArray(day.exercises)) return;
    day.exercises.forEach((ex) => {
      const base = baseFor(ex.exercise_name);
      if (!base) return;
      (ex.sets || []).forEach((s) => {
        if (typeof s.rpm_percent === 'number' && s.rpm_percent > 0) s.weight = round((s.rpm_percent / 100) * base);
      });
    });
  });
}

/** No more than one squat-pattern movement per training day. */
function dedupeSquats(days) {
  Object.values(days || {}).forEach((day) => {
    if (!day || !Array.isArray(day.exercises)) return;
    let seen = false;
    day.exercises = day.exercises.filter((ex) => {
      const isSquat = String(ex.exercise_name || '').toLowerCase().includes('squat');
      if (isSquat) { if (seen) return false; seen = true; }
      return true;
    });
  });
}

/**
 * Deterministic guardrail: no competition-lift set may exceed the athlete's
 * tier intensity ceiling (Developing 80%, Provincial 92%, National+ 95%).
 * Pulls, squats and presses are exempt. Weight is scaled to match.
 */
function clampClassicLiftIntensity(days, ceiling) {
  const isClassic = (name) => {
    const n = String(name || '').toLowerCase();
    if (n.includes('pull') || n.includes('squat') || n.includes('press')) return false;
    return /snatch|clean|jerk/.test(n);
  };
  Object.values(days || {}).forEach((day) => {
    if (!day || !Array.isArray(day.exercises)) return;
    day.exercises.forEach((ex) => {
      if (!isClassic(ex.exercise_name)) return;
      (ex.sets || []).forEach((set) => {
        const pct = set.rpm_percent;
        if (typeof pct === 'number' && pct > ceiling) {
          if (typeof set.weight === 'number' && set.weight > 0) {
            set.weight = Math.round((set.weight * ceiling) / pct);
          }
          set.rpm_percent = ceiling;
        }
      });
    });
  });
  return days;
}

async function generateAndSaveWeek(user, options = {}) {
  const profile = user.profile;
  if (!canGenerateWeek(profile)) {
    throw new Error('Profile missing availability.training_days_per_week. Complete onboarding first.');
  }

  const isFirstWeek = options.isFirstWeek === true;
  const weekStart = options.weekStart
    ? new Date(options.weekStart)
    : isFirstWeek
      ? getWeekStart(new Date())
      : getNextWeekStart(new Date());

  const result = await generateTrainingResponse({
    profile,
    request: "Generate the full training week for this athlete. Use their training days and preferred rest days from the profile. Return day_label as weekday names (e.g. Monday, Tuesday) for training days.",
    responseFormat: 'workout_tab',
  });

  let data = null;
  try {
    data = JSON.parse(result.content);
  } catch (e) {
    throw new Error('AI JSON parse failed: ' + (e && e.message) + ' | len=' + String(result.content || '').length + ' | head=' + String(result.content || '').slice(0, 160));
  }

  const normalized = normalizeWorkoutTabData(data);
  const days = mapResponseToDays(normalized, profile);
  clampClassicLiftIntensity(days, tierCeiling(resolveTier(profile)));
  recomputeMainWeights(days, getMaxes(profile));
  dedupeSquats(days);

  const av = profile.availability || {};
  const doc = await WeeklyTraining.create({
    user: user._id,
    week_start: weekStart,
    days,
    profile_snapshot: {
      training_days_per_week: av.training_days_per_week,
      preferred_rest_days: av.preferred_rest_days || [],
      session_duration: av.session_duration,
    },
    is_first_week: isFirstWeek,
  });

  return doc;
}

/**
 * Generate first week right after onboarding. Call from PUT /api/profile when availability is first set.
 * Uses current week's Sunday as week_start.
 */
async function generateFirstWeek(user) {
  return generateAndSaveWeek(user, { isFirstWeek: true, weekStart: getWeekStart(new Date()) });
}

/**
 * Generate next week (for Sunday cron). Call for each user with profile.
 */
async function generateNextWeekForUser(user) {
  return generateAndSaveWeek(user, { isFirstWeek: false, weekStart: getNextWeekStart(new Date()) });
}

module.exports = {
  generateAndSaveWeek,
  generateFirstWeek,
  generateNextWeekForUser,
  canGenerateWeek,
};
