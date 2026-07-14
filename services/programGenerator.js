/**
 * Program generator — the guarded AI pipeline (paid-tier full-program generation).
 *
 * Flow:  assemble prompt (spec + bible + library, cached)
 *          -> Claude (Sonnet "brain") produces the whole program as %s
 *          -> compute kilos from the athlete's maxes
 *          -> deterministic linters REPAIR what the AI drifts on
 *               (plausibility clamps too-heavy loads; volume/intensity lifts light squats)
 *          -> if serious flags remain, ONE bounce back to the AI to regenerate
 *          -> return the validated program + a report of what was fixed.
 *
 * The AI makes the coaching decisions; the linters guarantee the numbers.
 * processProgram() is pure/deterministic and unit-tested without any live LLM call.
 */

const fs = require('fs');
const path = require('path');
const { complete } = require('./llmClient');
const { getFullDocumentText } = require('./documentService');
const { lintExercises, findExercise } = require('./plausibilityLinter');
const { checkProgram } = require('./volumeIntensityLinter');
const { checkOverload } = require('./volumeCapLinter');
const { checkTierCap } = require('./tierCapLinter');
const { checkProgression } = require('./progressionLinter');
const { checkTimeBudget } = require('./timeBudgetLinter');
const { formatProfileForPrompt, resolveTier } = require('./openaiService');
const { checkInputs, buildDirectives } = require('./preflight');

let LIB = null;
function library() {
  if (!LIB) LIB = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/exercise-library.json'), 'utf8'));
  return LIB;
}
const r25 = (w) => Math.round(w / 2.5) * 2.5;

/** Pull the athlete's maxes keyed by the library's parent-lift names. */
function getMaxes(profile) {
  const gv = (o) => (o && typeof o.value === 'number' && o.value > 0 ? o.value : null);
  const ss = (profile && profile.strength_stats) || {};
  const classic = ss.classic || {}, squat = ss.squat || {}, variation = ss.variation || {};
  const cj = gv(classic.clean_jerk);
  return {
    snatch: gv(classic.snatch),
    clean_jerk: cj,
    clean: gv(variation.clean) || cj,
    jerk: gv(variation.jerk) || cj,
    back_squat: gv(squat.back_squat),
    front_squat: gv(squat.front_squat),
  };
}

/** parent-lift max for an exercise (via the library), or null. */
function parentMaxFor(name, maxes) {
  const rec = findExercise(name);
  const parent = rec && rec.load && rec.load.parent;
  return parent && typeof maxes[parent] === 'number' ? maxes[parent] : null;
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------
async function buildSystemPrompt() {
  const spec = await getFullDocumentText('data/generation-spec.md');
  const bible = await getFullDocumentText('data/training-bible.md');
  const lib = JSON.stringify(library());
  return `${spec}\n\n# ==== THE OLY TRAINING BIBLE (rules referenced by the spec) ====\n${bible}\n\n# ==== EXERCISE LIBRARY (the ONLY movements allowed; JSON) ====\n${lib}`;
}

const OUTPUT_SHAPE = `{
  "reasoning": "brief: the limiter + its direction, the phase arc, and how variety/accessories rotate",
  "weeks": [
    { "week": 1, "phase": "Base",
      "days": [
        { "focus": "e.g. Snatch — key day (heavy)",
          "exercises": [
            { "name": "exact library name", "rest": "e.g. 3-5 min",
              "sets": [ { "percent": 75, "reps": 2, "intent": "quality" } ] }
          ] } ] } ],
  "self_check": { "satisfied": true, "unmet": [], "ambiguities": [] }
}`;

function buildUserPrompt(profile, maxes, opts = {}) {
  const weeks = opts.weeks || 12;
  return `# THIS ATHLETE\n${formatProfileForPrompt(profile)}\n\n` +
    `# MAXES (kg) — every percentage you write is a % of the athlete's max for that exercise's PARENT lift\n${JSON.stringify(maxes)}\n\n` +
    `# TASK\nProduce a complete ${weeks}-week program by following the Generation Spec EXACTLY. Work the decision procedure (diagnose the limiter + its direction, set the phases/timeline, build every week, program the peak, self-check against every hard rule).\n\n` +
    `Output ONLY this JSON shape — no prose, no kilograms (the engine computes kilos from your percentages):\n${OUTPUT_SHAPE}\n\n` +
    `REP SCHEME (strict): the classic lifts AND their close variations (pause, hang, block, no-feet, power, drop, balance) stay in SINGLES or DOUBLES whenever the load is above 75% — triples only at ≤75%, for technique. Squats/pulls follow the phase's rep ranges.\n` +
    `Every set's "percent" is a % of the athlete's max for that exercise's parent lift. Use only exercises that exist in the library. Output ONLY the JSON object.`;
}

// ---------------------------------------------------------------------------
// Deterministic processing: compute loads, lint, repair  (no LLM)
// ---------------------------------------------------------------------------
function eachExercise(program, fn) {
  for (const w of (program && program.weeks) || [])
    for (const d of (w && w.days) || [])
      for (const ex of (d && d.exercises) || []) fn(ex, d, w);
}

/** Fill computed_kg on every set from its percent × parent max. */
function computeLoads(program, maxes) {
  eachExercise(program, (ex) => {
    const pmax = parentMaxFor(ex.name, maxes);
    for (const s of ex.sets || []) {
      if (typeof s.percent === 'number' && pmax) s.computed_kg = r25((s.percent / 100) * pmax);
    }
  });
}

/** Map an intensity % to an RPE target (bible §9D), for beginner "load by feel" mode. */
function pctToRPE(p) {
  if (p >= 88) return 9;
  if (p >= 82) return 8;
  if (p >= 76) return 7;
  if (p >= 68) return 6;
  return 5;
}
/** Developing athletes train to an RPE target, not a % of an unreliable max (bible §8B). */
function applyLoadMode(program, tier) {
  if (tier !== 'Developing') return { mode: 'percent' };
  eachExercise(program, (ex) => {
    for (const s of ex.sets || []) if (typeof s.percent === 'number') s.rpe_target = pctToRPE(s.percent);
  });
  program.load_mode = 'rpe';
  return { mode: 'rpe' };
}

/**
 * Run the full guard chain and repair in place, in dependency order:
 *   too light → tier ceiling → (recompute kilos) → too heavy → too much volume,
 * then flag-only structural checks (variety, time budget, deload, progression).
 * All guards operate on the SAME exercise/set objects, so repairs propagate.
 */
function lintAndRepair(program, maxes, opts = {}) {
  const tier = opts.tier || 'Provincial';
  const sessionMinutes = opts.sessionMinutes || 90;
  // One adapted view (days = arrays of the REAL exercise objects) shared by every guard.
  const viWeeks = (program.weeks || []).map((w) => ({ week: w.week, phase: w.phase, days: (w.days || []).map((d) => d.exercises || []) }));

  // 1) too LIGHT — lift a too-light strength squat up to the band.
  const viRepair = checkProgram(viWeeks, { repair: true });
  // 2) tier CEILING — clamp intensity to the athlete's tier cap (after the squat-up, so a beginner's squat can't be driven past 80%).
  const tcRepair = checkTierCap(viWeeks, { tier, repair: true });
  computeLoads(program, maxes); // % moved in steps 1–2 → refresh kilos

  // 3) too HEAVY — clamp any physically impossible load, reflect back to % + kg.
  const flat = [];
  eachExercise(program, (ex) => { for (const s of ex.sets || []) s.weight = s.computed_kg; flat.push({ exercise_name: ex.name, sets: ex.sets }); });
  const plRepair = lintExercises(flat, maxes, { repair: true });
  eachExercise(program, (ex) => {
    const pmax = parentMaxFor(ex.name, maxes);
    for (const s of ex.sets || []) {
      if (typeof s.weight === 'number') { s.computed_kg = s.weight; if (pmax) s.percent = Math.round((s.weight / pmax) * 100); delete s.weight; }
    }
  });

  // 4) too MUCH volume — trim reps over the Prilepin/rep-scheme cap; flag weekly heavy-exposure overload.
  const ovRepair = checkOverload(viWeeks, { tier, repair: true });

  // 5) flag-only structural checks (need the AI to re-plan, not a numeric repair).
  const viFinal = checkProgram(viWeeks, { repair: false });
  const tb = checkTimeBudget(viWeeks, { sessionMinutes });
  const prog = checkProgression(viWeeks);

  return {
    squat_repairs: viRepair.flags.filter((f) => f.repaired),
    tier_caps: tcRepair.flags,
    heavy_loads_repaired: plRepair.flags,
    volume_trims: ovRepair.flags.filter((f) => f.type === 'reps_too_high'),
    heavy_exposure: ovRepair.flags.filter((f) => f.type === 'heavy_exposure_overload'),
    variety_intensity: viFinal.flags,
    time_budget: tb.flags,
    progression: prog.flags,
  };
}

/**
 * Pain safety backstop — if a movement had pain flagged in recent logs, cap its load hard
 * (≤75% of the parent) regardless of what the AI wrote. The prompt already asks the AI to
 * substitute intelligently; this guarantees the load is at least backed off. Safety > everything.
 */
function painDeload(program, maxes, painFlags) {
  if (!Array.isArray(painFlags) || !painFlags.length) return [];
  // Severity-graded cap: Mild eases the load, Moderate more, Severe backs it right off (substitute).
  const capFor = {};
  for (const p of painFlags) {
    const key = String(p.exercise || '').toLowerCase();
    const cap = p.level === 'Sharp' ? 60 : p.level === 'Moderate' ? 70 : 80; // app's Pain Level values
    capFor[key] = Math.min(capFor[key] != null ? capFor[key] : 100, cap);
  }
  const flags = [];
  let touched = false;
  eachExercise(program, (ex) => {
    const cap = capFor[String(ex.name || '').toLowerCase()];
    if (cap == null) return;
    let hit = false;
    for (const s of ex.sets || []) { if (typeof s.percent === 'number' && s.percent > cap) { s.percent = cap; hit = true; } }
    if (hit) { touched = true; flags.push({ type: 'pain_deload', exercise: ex.name, cap, note: `${ex.name} capped to ${cap}% — pain flagged here; substitute if it persists.` }); }
  });
  if (touched) computeLoads(program, maxes);
  return flags;
}

/** Pure end-to-end processing of a raw AI program: compute + full guard chain + pain backstop + load mode. */
function processProgram(program, maxes, opts = {}) {
  computeLoads(program, maxes);
  const fixes = lintAndRepair(program, maxes, opts);
  const painFixes = painDeload(program, maxes, opts.painFlags);
  const loadMode = applyLoadMode(program, opts.tier);
  const report = {
    load_mode: loadMode.mode,
    repaired: {
      heavy_loads: fixes.heavy_loads_repaired.length,
      squats_lifted: fixes.squat_repairs.length,
      tier_capped: fixes.tier_caps.length,
      reps_trimmed: fixes.volume_trims.length,
      pain_deloaded: painFixes.length,
    },
    // Everything that couldn't be auto-repaired and should bounce back to the AI, plus pain notes.
    warnings: [
      ...fixes.variety_intensity,
      ...fixes.heavy_exposure,
      ...fixes.time_budget,
      ...fixes.progression,
      ...painFixes,
    ],
    detail: fixes,
  };
  return { program, report };
}

// ---------------------------------------------------------------------------
// Orchestration: generate -> process -> (bounce once) -> return
// ---------------------------------------------------------------------------
// Flags that couldn't be auto-repaired and are worth one AI regeneration.
const SERIOUS = new Set([
  'under_accessorized', 'squat_too_light', 'classic_too_light',   // volume/intensity
  'heavy_exposure_overload',                                      // overtraining
  'session_over_budget',                                          // won't fit the clock
  'no_deload', 'deload_gap_too_long', 'no_progression', 'declining_block', // block structure
]);

async function generateProgram(profile, opts = {}) {
  const maxes = getMaxes(profile);

  // ---- PRE-FLIGHT: guard the input before spending an AI call on bad data ----
  const preflight = checkInputs(profile, maxes);
  if (!preflight.ok) {
    return { ok: false, preflight, program: null, report: null };
  }

  // Deterministic decisions the guards need, computed once.
  const ppOpts = {
    tier: resolveTier(profile),
    sessionMinutes: (profile.availability && profile.availability.session_duration) || 90,
  };

  const system = await buildSystemPrompt();
  // Lock the computable decisions (tier cap, limiter+direction, session size, meet) into the prompt.
  const directives = buildDirectives(profile, maxes);
  const user = `${buildUserPrompt(profile, maxes, opts)}${directives ? `\n\n${directives}` : ''}`;

  const res1 = await complete({ task: 'brain', system, user, json: true, maxTokens: 16000, temperature: 0.4, cacheSystem: true });
  let program;
  try { program = JSON.parse(res1.content); } catch (e) { throw new Error('Generator returned invalid JSON: ' + (e && e.message)); }

  const first = processProgram(program, maxes, ppOpts);
  const serious = first.report.warnings.filter((f) => SERIOUS.has(f.type));

  // One guarded retry if the guards still see serious (non-auto-repairable) issues.
  if (serious.length && !opts.noBounce) {
    const fixMsg = 'Your previous program had these issues the guardrails flagged. Regenerate the COMPLETE program fixing them while keeping everything else sound:\n- ' +
      serious.map((f) => f.note).join('\n- ');
    try {
      const res2 = await complete({ task: 'brain', system, user: `${user}\n\n# REVISION REQUIRED\n${fixMsg}`, json: true, maxTokens: 16000, temperature: 0.4, cacheSystem: true });
      const program2 = JSON.parse(res2.content);
      const second = processProgram(program2, maxes, ppOpts);
      return { ok: true, preflight, tier: ppOpts.tier, program: second.program, report: second.report, reasoning: program2.reasoning, self_check: program2.self_check, bounced: true, usage: [res1.usage, res2.usage] };
    } catch (e) { /* fall through to the first (already repaired) program */ }
  }

  return { ok: true, preflight, tier: ppOpts.tier, program: first.program, report: first.report, reasoning: program.reasoning, self_check: program.self_check, bounced: false, usage: [res1.usage] };
}

module.exports = { generateProgram, processProgram, computeLoads, lintAndRepair, getMaxes, buildSystemPrompt, buildUserPrompt, parentMaxFor };
