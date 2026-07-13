/**
 * Time-budget linter — enforces that a session actually FITS the athlete's session length
 * (bible §4G). The bible is emphatic that two full heavy classic lifts + squat + pulls +
 * accessories do not fit 90 minutes; the pre-flight locks a *minimum* session size, and this
 * guards the *maximum*. An unfittable session gets skipped or rushed — quality dies either way.
 *
 * Rough per-block time costs from §4G (heavy work, proper 2–4 min rest). Flag-only: trimming
 * is a coaching choice (shed accessories, then pulls) best handled by a bounce, not silently.
 */

const { isSquat, isClassicMain, isMainVariation } = require('./volumeIntensityLinter');

const dayLists = (days) =>
  (Array.isArray(days) ? days : Object.values(days || {}))
    .map((d) => (Array.isArray(d) ? d : d && Array.isArray(d.exercises) ? d.exercises : null))
    .filter(Boolean);

const WARMUP_MIN = 9;
const topPct = (ex) => Math.max(0, ...((ex && ex.sets) || []).map((s) => (typeof s.percent === 'number' ? s.percent : 0)));
// Intensity-aware: a HEAVY main lift (ramp + heavy work) costs far more than a LIGHT corrective
// variation done for a few sub-80% sets. Costing every classic-family movement as a full heavy
// lift falsely flags a normal "main lift + corrective" day as over budget.
function exerciseMinutes(ex) {
  const name = ex && ex.name;
  const top = topPct(ex);
  if (isClassicMain(name) || isMainVariation(name)) return top >= 80 ? 28 : 12; // heavy main lift vs light corrective
  if (isSquat(name)) return top >= 80 ? 18 : 15;
  if (/pull|deadlift/i.test(name)) return 12;
  if (/press|jerk/i.test(name)) return 12;
  return 8; // accessory / prehab (3 sets, short rest)
}

/**
 * @param weeks [{week,phase,days}] — days = arrays of exercises ({name})
 * @param opts  { sessionMinutes?: number (default 90), tolerance?: number (default 10) }
 */
function checkTimeBudget(weeks, opts = {}) {
  const budget = opts.sessionMinutes || 90;
  const tol = opts.tolerance != null ? opts.tolerance : 10;
  const flags = [];
  for (const w of weeks || []) {
    let dayNum = 0;
    for (const dl of dayLists(w.days)) {
      dayNum++;
      let est = WARMUP_MIN;
      for (const ex of dl) est += exerciseMinutes(ex);
      if (est > budget + tol) {
        flags.push({
          type: 'session_over_budget', week: w.week, day: dayNum, est_minutes: est, budget,
          note: `Week ${w.week} day ${dayNum}: ~${est} min of work won't fit the ${budget}-min session — shed accessories first, then pulls (§4G). Never buy time by cutting rest on the main lifts.`,
        });
      }
    }
  }
  return { flags };
}

module.exports = { checkTimeBudget, exerciseMinutes };
