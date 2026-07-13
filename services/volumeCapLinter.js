/**
 * Volume-cap linter — the "too MUCH" guardrail (overtraining / junk-volume side).
 *
 * The plausibility linter catches loads too heavy; the volume/intensity linter catches
 * loads too light + thin accessories. This one catches the third failure mode the AI's
 * self-check can't reliably see: too much volume at intensity, and too many heavy days.
 *
 * Enforces, from the Training Bible:
 *   - §3B  Classic lifts live in singles/doubles; triples only ≤75% (technique).
 *   - §9B  Prilepin reps-per-set: >2 reps at ≥90% is a violation for any movement.
 *   - §3J/§14B  Weekly heavy (≥88%) classic-lift exposures are capped by tier.
 *
 * Deterministic. Can REPAIR the rep-scheme violations (trim reps down = less volume, always
 * safe) and FLAGS the weekly heavy-exposure overload (structural — needs a session moved).
 */

const { normPhase, isClassicMain, isMainVariation } = require('./volumeIntensityLinter');

// Weekly cap on heavy (≥88%) classic-lift exposure DAYS, by athlete tier.
const HEAVY_EXPOSURE_CAP = { Developing: 2, Provincial: 3, 'National+': 5 };

// days may be: array of exercise-lists, array of {exercises:[...]}, or a {Mon:[...]} dict.
const dayLists = (days) =>
  (Array.isArray(days) ? days : Object.values(days || {}))
    .map((d) => (Array.isArray(d) ? d : d && Array.isArray(d.exercises) ? d.exercises : null))
    .filter(Boolean);

const isClassicLift = (name) => isClassicMain(name) || isMainVariation(name);

/** Highest legal reps for a set, given the movement and intensity. null = no cap (hypertrophy zone). */
function repCap(name, pct) {
  if (isClassicLift(name) && pct > 75) return 2; // §3B singles/doubles above 75%
  if (pct >= 90) return 2;                        // §9B Prilepin 90%+ zone
  if (pct >= 85) return 4;                        // upper 80s — squats/pulls cap at 4
  return null;                                     // ≤85% non-classic: hypertrophy reps allowed
}

/**
 * @param weeks  [{ week, phase, days }]  (days = arrays of exercises, each { name, sets:[{percent,reps}] })
 * @param opts   { tier?: 'Developing'|'Provincial'|'National+', repair?: bool }
 * @returns { flags, repaired }
 */
function checkOverload(weeks, opts = {}) {
  const tier = opts.tier || 'Provincial';
  const repair = opts.repair === true;
  const heavyCap = HEAVY_EXPOSURE_CAP[tier] != null ? HEAVY_EXPOSURE_CAP[tier] : 3;
  const flags = [];

  for (const w of weeks || []) {
    const ph = normPhase(w.phase);
    let heavyDays = 0;

    for (const dl of dayLists(w.days)) {
      let dayHasHeavyClassic = false;
      for (const ex of dl) {
        if (!ex || !Array.isArray(ex.sets)) continue;
        for (const s of ex.sets) {
          const p = typeof s.percent === 'number' ? s.percent : null;
          if (p == null) continue;
          if (isClassicLift(ex.name) && p >= 88) dayHasHeavyClassic = true;
          const cap = repCap(ex.name, p);
          if (cap != null && typeof s.reps === 'number' && s.reps > cap) {
            flags.push({
              type: 'reps_too_high', week: w.week, exercise: ex.name, percent: p, reps: s.reps, cap, repaired: repair,
              note: `Week ${w.week}: ${ex.name} — ${s.reps} reps @ ${p}% exceeds the ${cap}-rep cap for that intensity`
                + (repair ? ` → trimmed to ${cap}.` : '.'),
            });
            if (repair) s.reps = cap;
          }
        }
      }
      if (dayHasHeavyClassic) heavyDays++;
    }

    if (ph !== 'deload' && ph !== 'taper' && heavyDays > heavyCap) {
      flags.push({
        type: 'heavy_exposure_overload', week: w.week, heavy_days: heavyDays, cap: heavyCap, tier,
        note: `Week ${w.week}: ${heavyDays} heavy (≥88%) classic-lift days — the cap for a ${tier} athlete is ${heavyCap}/week. Overtraining risk.`,
      });
    }
  }
  return { flags, repaired: repair };
}

module.exports = { checkOverload, repCap, HEAVY_EXPOSURE_CAP };
