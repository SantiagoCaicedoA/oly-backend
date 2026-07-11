/**
 * Generate a full training week via the deterministic block engine and store it in WeeklyTraining.
 * Used after onboarding (first week) and by Sunday cron (next week).
 */

const User = require('../models/User');
const WeeklyTraining = require('../models/WeeklyTraining');
const { generateCoachNotes } = require('./openaiService');
const { normalizeWorkoutTabData } = require('../utils/workoutTabSchema');
const { mapResponseToDays, getWeekStart, getNextWeekStart } = require('./trainingWeekService');
const { getOrCreateActiveBlock, currentWeekIndex } = require('./blockPlanner');
const { buildWeek, getMaxes: builderMaxes } = require('./weekBuilder');
const { adaptUserMaxes } = require('./adapter');

/**
 * Check if user has enough profile to generate (availability with training_days_per_week).
 */
function canGenerateWeek(profile) {
  if (!profile || typeof profile !== 'object') return false;
  const av = profile.availability;
  return av && typeof av.training_days_per_week === 'number' && av.training_days_per_week >= 1;
}

/**
 * Generate this week's training via the block engine (plan -> adapt -> build) and save to DB.
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

  // ---- Block engine: plan -> adapt -> build -> notes -> store ----
  // Reference date = the week being generated (this week for first-week, next week for cron),
  // so the block's current-week index aligns with the week we're materializing.
  const refDate = weekStart;

  // 1) Get/create the athlete's active plan (rolls to the next season when one finishes).
  const block = await getOrCreateActiveBlock(user, { seasonKey: options.seasonKey, now: refDate });

  // 2) Refresh maxes from recently logged results before building (best-effort).
  try { await adaptUserMaxes(user); } catch (e) { console.error('adapter failed:', e && e.message); }

  // 3) Materialize the current week deterministically from the plan slot + maxes.
  const weekIndex = currentWeekIndex(block, refDate);
  const built = buildWeek(block.season_key, weekIndex, builderMaxes(user.profile), {
    rest_days: (profile.availability && profile.availability.preferred_rest_days) || undefined,
  });

  const normalized = normalizeWorkoutTabData({ training_days: built.training_days });
  const days = mapResponseToDays(normalized, profile);
  // Block loads are already correct and tapered — no AI-mistake post-processing needed.

  // 4) Coach notes, fed the REAL plan slot so "where you are / what's coming" is accurate.
  const slot = (block.plan && block.plan[weekIndex - 1]) || {};
  const planContext = {
    season_name: block.season_name,
    week: weekIndex,
    weeks_total: block.weeks_total,
    weeks_to_end: block.weeks_total - weekIndex,
    phase: built.phase,
    is_special: built.is_special,
    ending: block.ending,
    focus: slot.note,
  };
  try {
    const notes = await generateCoachNotes(profile, days, planContext);
    if (notes) {
      Object.keys(notes).forEach((dayName) => {
        const d = days[dayName];
        if (!d || d.type !== 'training') return;
        if (notes[dayName].coach_note) d.coach_note = notes[dayName].coach_note;
        if (Array.isArray(notes[dayName].key_cues) && notes[dayName].key_cues.length) d.key_cues = notes[dayName].key_cues;
      });
    }
  } catch (e) {
    console.error('coach-note pass failed (keeping inline notes):', e && e.message);
  }

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
    block: block._id,
    block_week: weekIndex,
    season_key: block.season_key,
    phase: built.phase,
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
