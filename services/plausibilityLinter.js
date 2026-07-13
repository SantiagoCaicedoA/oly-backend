/**
 * Plausibility linter — the physical-sanity guardrail. For every prescribed set it
 * estimates the max for THAT specific movement (est_max_ratio × the parent lift's max)
 * and flags any load that's too heavy for the rep count. Catches the class of error
 * the AI's rule-based self-check can't see: physically impossible prescriptions
 * (a push press above its own est max, 90% hang doubles, a 90% pause triple).
 * Pure + deterministic; can repair (clamp) or bounce flags back to the generator.
 */
const fs = require('fs');
const path = require('path');

let LIB = null;
function library() {
  if (!LIB) LIB = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/exercise-library.json'), 'utf8'));
  return LIB;
}

const r25 = (w) => Math.round(w / 2.5) * 2.5;

// Highest plausible % of a movement's 1RM for a given rep count.
function repCeiling(reps) {
  if (reps <= 1) return 0.97;
  if (reps === 2) return 0.93;
  if (reps === 3) return 0.90;
  if (reps <= 5) return 0.86;
  return 0.80;
}

// Match an engine/AI exercise name to a library record (fuzzy: normalized prefix/keywords).
function findExercise(name) {
  const n = String(name || '').toLowerCase().replace(/[()]/g, '').trim();
  const lib = library();
  let best = null;
  for (const e of lib) {
    const ln = e.name.toLowerCase().replace(/[()]/g, '').trim();
    if (ln === n) return e;
    if (ln.startsWith(n) || n.startsWith(ln.split(' ').slice(0, 2).join(' '))) {
      if (!best || ln.length < best.name.length) best = e;
    }
  }
  return best;
}

/**
 * Lint a flat list of exercises (each { exercise_name, sets:[{weight, reps}] }).
 * @returns { flags: [...], repaired: bool }  (mutates set.weight if repair=true)
 */
function lintExercises(exercises, maxes, opts = {}) {
  const repair = opts.repair !== false;
  const flags = [];
  for (const ex of exercises || []) {
    const rec = findExercise(ex.exercise_name);
    if (!rec || rec.est_max_ratio == null) continue; // RPE/bodyweight/unknown — skip
    const parent = rec.load && rec.load.parent;
    const parentMax = parent && maxes[parent];
    if (!parentMax) continue;
    const varMax = rec.est_max_ratio * parentMax;
    for (const s of ex.sets || []) {
      if (typeof s.weight !== 'number' || s.weight <= 0) continue;
      const reps = typeof s.reps === 'number' ? s.reps : 1;
      const ceiling = repCeiling(reps);
      const pct = s.weight / varMax;
      if (pct > ceiling + 0.01) {
        const safe = r25(ceiling * varMax);
        flags.push({
          exercise: ex.exercise_name,
          reps,
          weight: s.weight,
          est_variation_max: Math.round(varMax),
          pct_of_variation_max: Math.round(pct * 100),
          rep_ceiling_pct: Math.round(ceiling * 100),
          suggested_weight: safe,
        });
        if (repair) { s.weight = safe; if (typeof s.rpm_percent === 'number') s.rpm_percent = Math.round(ceiling * 100); }
      }
    }
  }
  return { flags, repaired: repair };
}

/** Lint the app's `days` structure (monday..sunday). */
function lintDays(days, maxes, opts = {}) {
  const all = [];
  for (const day of Object.values(days || {})) {
    if (day && Array.isArray(day.exercises)) all.push(...day.exercises);
  }
  return lintExercises(all, maxes, opts);
}

module.exports = { lintExercises, lintDays, findExercise, repCeiling };
