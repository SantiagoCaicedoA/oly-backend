/**
 * Tier-cap linter — the intensity-ceiling guardrail (safety, by athlete tier).
 *
 * The pre-flight COMPUTES the tier and tells the AI the ceiling; this ENFORCES it on the
 * output. Ceilings (bible §14A / directives): Developing ≤80%, Provincial ≤92%, National+ ≤95%
 * — expressed as % of the MOVEMENT'S OWN max, so a snatch pull at 105% of the snatch
 * (≈84% of the pull's own max) is NOT a violation, but a beginner snatch single at 88% is.
 *
 * This is the FINAL authority on intensity: it runs after the light-squat repair and clamps
 * anything above the athlete's ceiling back down (e.g. the "drive the squat to 90%" repair must
 * not push a Developing athlete's squat past 80%). Deterministic; repairs by clamping down.
 */

const { tierCeiling } = require('./openaiService');            // 80 / 92 / 95
const { isSquat, isClassicMain, isMainVariation } = require('./volumeIntensityLinter');
const { findExercise } = require('./plausibilityLinter');

const dayLists = (days) =>
  (Array.isArray(days) ? days : Object.values(days || {}))
    .map((d) => (Array.isArray(d) ? d : d && Array.isArray(d.exercises) ? d.exercises : null))
    .filter(Boolean);

// Movements where intensity-relative-to-own-max is a near-maximal / neural concern.
// (Pulls, presses and accessories are not "maxed" the same way and are excluded.)
const isCapped = (name) => isClassicMain(name) || isMainVariation(name) || isSquat(name);

/**
 * @param weeks [{week,phase,days}] — days = arrays of exercises ({name, sets:[{percent}]})
 * @param opts  { tier, repair? }
 * @returns { flags, repaired }
 */
function checkTierCap(weeks, opts = {}) {
  const tier = opts.tier || 'Provincial';
  const ceiling = tierCeiling(tier); // % of the movement's own max
  const repair = opts.repair === true;
  const flags = [];

  for (const w of weeks || []) {
    for (const dl of dayLists(w.days)) {
      for (const ex of dl) {
        if (!ex || !Array.isArray(ex.sets) || !isCapped(ex.name)) continue;
        const rec = findExercise(ex.name);
        const ratio = rec && rec.est_max_ratio != null ? rec.est_max_ratio : 1;
        const maxPctOfParent = ceiling * ratio; // a % of the PARENT lift that equals `ceiling`% of the movement's own max
        for (const s of ex.sets) {
          if (typeof s.percent !== 'number') continue;
          if (s.percent > maxPctOfParent + 0.5) {
            flags.push({
              type: 'over_tier_ceiling', week: w.week, exercise: ex.name, tier, ceiling,
              pct_of_own_max: Math.round(s.percent / ratio), repaired: repair,
              note: `Week ${w.week}: ${ex.name} at ~${Math.round(s.percent / ratio)}% of its own max exceeds the ${ceiling}% ceiling for a ${tier} athlete`
                + (repair ? ' → capped.' : '.'),
            });
            if (repair) s.percent = Math.round(maxPctOfParent);
          }
        }
      }
    }
  }
  return { flags, repaired: repair };
}

module.exports = { checkTierCap, isCapped };
