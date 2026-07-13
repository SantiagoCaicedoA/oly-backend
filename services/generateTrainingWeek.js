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
const { advanceRollingBlock } = require('./rollingProgram');

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const isPersonalized = (user) => user && user.subscription && user.subscription.tier === 'personalized';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Convert a rolling-pipeline week (ordered day-array of %-sets) into the workout-tab
 * `training_days` shape (weekday labels + weight/rpm_percent sets) the mapper expects. */
function rollingWeekToTrainingDays(week, profile) {
  const rest = ((profile && profile.availability && profile.availability.preferred_rest_days) || []).map((d) => String(d).toLowerCase());
  const trainingWeekdays = DAY_ORDER.filter((d) => !rest.includes(d));
  const days = (week && week.days) || [];
  return days.slice(0, trainingWeekdays.length).map((d, i) => ({
    day: i + 1,
    day_label: cap(trainingWeekdays[i]),
    focus: d.focus,
    exercises: (d.exercises || []).map((ex) => ({
      exercise_name: ex.name,
      no_of_set: (ex.sets || []).length,
      sets: (ex.sets || []).map((s, j) => ({
        set_number: j + 1,
        weight: typeof s.computed_kg === 'number' ? s.computed_kg : null,
        reps: typeof s.reps === 'number' ? s.reps : null,
        rpm_percent: typeof s.percent === 'number' ? s.percent : null,
        intent: typeof s.intent === 'string' ? s.intent : '',
      })),
    })),
  }));
}

/**
 * PAID path: build this week via the rolling AI pipeline (plan + feedback + guards),
 * map it to the WeeklyTraining schema, write coach notes, and store it.
 */
async function generateAndSaveRollingWeek(user, options = {}) {
  const isFirstWeek = options.isFirstWeek === true;
  const weekStart = options.weekStart || (isFirstWeek ? getWeekStart(new Date()) : getNextWeekStart(new Date()));

  const adv = await advanceRollingBlock(user, { checkIn: options.checkIn || null, now: weekStart });
  if (!adv.ok) throw new Error('Rolling generation failed pre-flight: ' + JSON.stringify(adv.preflight && adv.preflight.errors));

  const profile = user.profile;
  const training_days = rollingWeekToTrainingDays(adv.week, profile);
  const normalized = normalizeWorkoutTabData({ training_days });
  const days = mapResponseToDays(normalized, profile);

  // Coach notes with the real plan slot for "where you are / why".
  const slot = adv.slot || {};
  const planContext = {
    season_name: 'Personalized', week: adv.week_index, weeks_total: adv.weeks_total,
    weeks_to_end: (adv.weeks_total || 0) - adv.week_index, phase: adv.phase,
    is_special: slot.is_special, ending: adv.ending, focus: slot.note,
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
  } catch (e) { console.error('coach-note pass failed (rolling, keeping inline):', e && e.message); }

  const av = profile.availability || {};
  return WeeklyTraining.create({
    user: user._id, week_start: weekStart, days,
    profile_snapshot: { training_days_per_week: av.training_days_per_week, preferred_rest_days: av.preferred_rest_days || [], session_duration: av.session_duration },
    is_first_week: isFirstWeek, block: adv.block_id, block_week: adv.week_index, phase: adv.phase,
  });
}

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
  const opts = { isFirstWeek: true, weekStart: getWeekStart(new Date()) };
  // Personalized (paid) → rolling AI coach; on failure fall back to the deterministic engine so
  // the athlete always gets a week. Free → deterministic Oly Team engine.
  if (isPersonalized(user)) {
    try { return await generateAndSaveRollingWeek(user, opts); }
    catch (e) { console.error(`rolling first-week failed for ${user._id}, falling back to deterministic:`, e && e.message); }
  }
  return generateAndSaveWeek(user, opts);
}

/**
 * Generate next week (for Sunday cron). Call for each user with profile.
 */
async function generateNextWeekForUser(user) {
  const opts = { isFirstWeek: false, weekStart: getNextWeekStart(new Date()) };
  if (isPersonalized(user)) {
    try { return await generateAndSaveRollingWeek(user, opts); }
    catch (e) { console.error(`rolling week failed for ${user._id}, falling back to deterministic:`, e && e.message); }
  }
  return generateAndSaveWeek(user, opts);
}

module.exports = {
  generateAndSaveWeek,
  generateAndSaveRollingWeek,
  rollingWeekToTrainingDays,
  generateFirstWeek,
  generateNextWeekForUser,
  canGenerateWeek,
};
