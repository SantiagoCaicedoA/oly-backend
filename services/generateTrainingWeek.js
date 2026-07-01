/**
 * Generate a full training week via AI and store it in WeeklyTraining.
 * Used after onboarding (first week) and by Sunday cron (next week).
 */

const User = require('../models/User');
const WeeklyTraining = require('../models/WeeklyTraining');
const { generateTrainingResponse } = require('./openaiService');
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
