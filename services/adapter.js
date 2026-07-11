/**
 * Adapter — the "aware of what's been done" layer. Reads logged results and keeps
 * the athlete's stored maxes honest (deterministic, straight from the bible):
 *   - UP:   a clean single above the stored max raises it (capped +4%).
 *   - DOWN: repeated misses at submaximal loads shave it (self-heal).
 *   - SQUAT: a made top rep-set (e.g. the Base-Test 3RM) sets the squat max via e1RM.
 * Also turns a daily check-in into a readiness scale for serve-time day adjustment.
 * Pure math is exported for testing; DB access is lazy so this file loads without mongoose.
 */
const r25 = (w) => Math.round(w / 2.5) * 2.5;
const e1rm = (weight, reps) => weight * (1 + reps / 30); // Epley (bible 9H)

const CAP_UP = 0.04;   // classic single may raise the max at most +4% per event
const HEAL = 0.03;     // down-heal shaves 3%
const MISS_COUNT = 3;  // this many submaximal misses triggers a heal
const MISS_PCT = 0.85; // only misses BELOW this fraction of the max count (missing near-max is normal)
const SQ_CAP_UP = 0.05;

/** Map an exercise name to the stored-max key it counts toward (or null). */
function liftKeyFor(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('pull')) return null; // pulls don't set the lift max
  if (n.startsWith('snatch') || n === 'snatch — build to max' || n.includes('snatch (test')) {
    if (n.includes('balance') || n.includes('hang') || n.includes('power') || n.includes('pull')) return null;
    return 'snatch';
  }
  if (n.startsWith('clean & jerk') || n.includes('c&j')) return 'cj';
  if (n === 'back squat' || n.startsWith('back squat')) return 'back_squat';
  if (n === 'front squat' || n.startsWith('front squat')) return 'front_squat';
  return null;
}

/**
 * Aggregate logged sets into per-lift signals.
 * @param sessions array of { days: { monday: { exercises:[{exercise_name, sets:[{weight,reps,isComplete,was_it_a_miss}]}] }, ... } }
 * @returns { snatch:{singlesMade:[w], misses:[w]}, cj:{...}, back_squat:{repSets:[{weight,reps,made}]}, front_squat:{...} }
 */
function extractLogged(sessions) {
  const out = {};
  const push = (lift, key, val) => { (out[lift] = out[lift] || { singlesMade: [], misses: [], repSets: [] })[key].push(val); };
  for (const s of sessions || []) {
    const days = (s && s.days) || {};
    for (const day of Object.values(days)) {
      if (!day || !Array.isArray(day.exercises)) continue;
      for (const exr of day.exercises) {
        const lift = liftKeyFor(exr.exercise_name);
        if (!lift) continue;
        for (const set of exr.sets || []) {
          if (!set || !set.isComplete) continue;
          const w = typeof set.weight === 'number' ? set.weight : null;
          if (w == null) continue;
          const made = !set.was_it_a_miss;
          if (set.was_it_a_miss) push(lift, 'misses', w);
          else if (set.reps === 1) push(lift, 'singlesMade', w);
          if (made && set.reps >= 2) push(lift, 'repSets', { weight: w, reps: set.reps, made: true });
        }
      }
    }
  }
  return out;
}

/** Pure: compute max changes from current maxes + aggregated logged signals. */
function computeMaxAdjustments(maxes, logged) {
  const out = {};
  for (const lift of ['snatch', 'cj']) {
    const cur = maxes[lift]; const L = logged[lift];
    if (!cur || !L) continue;
    const bestSingle = Math.max(0, ...(L.singlesMade || []));
    if (bestSingle > cur) {
      out[lift] = { from: cur, to: r25(Math.min(bestSingle, cur * (1 + CAP_UP))), reason: 'clean single above max' };
    } else {
      const subMisses = (L.misses || []).filter((w) => w < cur * MISS_PCT);
      if (subMisses.length >= MISS_COUNT) {
        out[lift] = { from: cur, to: r25(cur * (1 - HEAL)), reason: 'repeated misses at submaximal loads' };
      }
    }
  }
  for (const lift of ['back_squat', 'front_squat']) {
    const cur = maxes[lift]; const L = logged[lift];
    if (!cur || !L || !L.repSets || !L.repSets.length) continue;
    const best = Math.max(0, ...L.repSets.filter((s) => s.made).map((s) => e1rm(s.weight, s.reps)));
    if (best > cur) {
      out[lift] = { from: cur, to: r25(Math.min(best, cur * (1 + SQ_CAP_UP))), reason: 'e1RM from top rep set' };
    }
  }
  return out;
}

/** Pure: a daily check-in -> a readiness scale + intensity cap for that day. */
function readinessScale(checkIn) {
  if (!checkIn) return { scale: 1, cap: null, note: null };
  const { sleep_quality: sl, stress_level: st, mental_readiness: mr } = checkIn;
  const low = (sl != null && sl <= 3) || (mr != null && mr <= 3) || (st != null && st >= 8);
  if (low) return { scale: 0.9, cap: 80, note: 'under-recovered — kept controlled, not heavy' };
  return { scale: 1, cap: null, note: null };
}

/* ---------- DB glue (lazy require so pure math stays testable) ---------- */
const MAX_PATH = {
  snatch: ['classic', 'snatch'],
  cj: ['classic', 'clean_jerk'],
  back_squat: ['squat', 'back_squat'],
  front_squat: ['squat', 'front_squat'],
};
function applyToProfile(profile, adjustments) {
  const ss = profile.strength_stats || (profile.strength_stats = {});
  for (const [lift, adj] of Object.entries(adjustments)) {
    const [grp, key] = MAX_PATH[lift] || [];
    if (!grp) continue;
    ss[grp] = ss[grp] || {};
    ss[grp][key] = ss[grp][key] || {};
    ss[grp][key].value = adj.to;
  }
  return profile;
}

/** Read recent logged weeks, adjust the athlete's stored maxes, and save. */
async function adaptUserMaxes(user, options = {}) {
  const WeeklyTraining = require('../models/WeeklyTraining');
  const { getMaxes } = require('./weekBuilder');
  const weeks = options.weeks || 3;
  const sessions = await WeeklyTraining.find({ user: user._id }).sort({ week_start: -1 }).limit(weeks).lean();
  const logged = extractLogged(sessions);
  const adjustments = computeMaxAdjustments(getMaxes(user.profile), logged);
  if (Object.keys(adjustments).length) {
    applyToProfile(user.profile, adjustments);
    user.markModified('profile.strength_stats');
    await user.save();
  }
  return adjustments;
}

module.exports = { e1rm, liftKeyFor, extractLogged, computeMaxAdjustments, readinessScale, applyToProfile, adaptUserMaxes };
