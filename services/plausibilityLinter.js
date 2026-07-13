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

// Tokenize a movement name for tolerant matching: drop punctuation/parens (keeping the
// words inside them, e.g. "above knee") and common filler, so the AI's natural phrasing
// ("Pause snatch") still resolves to the library's canonical name
// ("Pause / segment snatch (pause at knee)").
const STOP = new Set(['the', 'a', 'of', 'from', 'or', 'and', 'with', 'grip', 'at', 'to']);
function normTokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[()\/,+._\-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

/**
 * Match an AI/engine exercise name to a library record by token overlap (alias-aware).
 * Scores mainly by how much of the QUERY the candidate covers, with a slight preference
 * for the tightest candidate — so "Snatch" resolves to the comp lift, not a variation,
 * and "Pause snatch" resolves to the pause variation, not the plain snatch.
 */
function findExercise(name) {
  const q = normTokens(name);
  if (!q.length) return null;
  const qset = new Set(q);
  const lib = library();
  let best = null;
  let bestScore = 0;
  for (const e of lib) {
    const names = [e.name, ...(Array.isArray(e.aliases) ? e.aliases : [])];
    for (const nm of names) {
      const t = new Set(normTokens(nm));
      if (!t.size) continue;
      let shared = 0;
      for (const w of qset) if (t.has(w)) shared++;
      if (!shared) continue;
      const score = shared / qset.size + (shared / t.size) * 0.1; // query-coverage dominant
      if (score > bestScore) { bestScore = score; best = e; }
    }
  }
  // Require at least half the query's words to land, to avoid junk matches.
  return bestScore >= 0.5 ? best : null;
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
