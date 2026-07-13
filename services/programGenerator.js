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
const { formatProfileForPrompt } = require('./openaiService');
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

/**
 * Run both guardrails and repair in place. Returns a report of what changed
 * and any residual warnings the AI should ideally fix.
 */
function lintAndRepair(program, maxes) {
  // Adapt weeks to the volume/intensity linter's shape (days = arrays of exercises).
  const viWeeks = (program.weeks || []).map((w) => ({ phase: w.phase, days: (w.days || []).map((d) => d.exercises || []) }));

  // Pass A — volume/intensity REPAIR: lift a too-light strength squat up to the band.
  const viRepair = checkProgram(viWeeks, { repair: true });
  computeLoads(program, maxes); // squat % may have moved → refresh kilos

  // Pass B — plausibility REPAIR: clamp any physically impossible (too-heavy) load.
  const flat = [];
  eachExercise(program, (ex) => {
    for (const s of ex.sets || []) s.weight = s.computed_kg; // linter reads .weight
    flat.push({ exercise_name: ex.name, sets: ex.sets });
  });
  const plRepair = lintExercises(flat, maxes, { repair: true });
  // Reflect any clamp back into percent + computed_kg, then drop the temp .weight.
  eachExercise(program, (ex) => {
    const pmax = parentMaxFor(ex.name, maxes);
    for (const s of ex.sets || []) {
      if (typeof s.weight === 'number') {
        s.computed_kg = s.weight;
        if (pmax) s.percent = Math.round((s.weight / pmax) * 100);
        delete s.weight;
      }
    }
  });

  // Final flag-only pass to surface anything left (thin accessories, stale variety, still-light classics).
  const viFinal = checkProgram(viWeeks, { repair: false });
  return {
    squat_repairs: viRepair.flags.filter((f) => f.repaired),
    heavy_loads_repaired: plRepair.flags,
    residual_warnings: viFinal.flags,
  };
}

/** Pure end-to-end processing of a raw AI program: compute + lint + repair. */
function processProgram(program, maxes) {
  computeLoads(program, maxes);
  const fixes = lintAndRepair(program, maxes);
  const report = {
    heavy_loads_repaired: fixes.heavy_loads_repaired.length,
    squat_repairs: fixes.squat_repairs.length,
    residual_warnings: fixes.residual_warnings,
    detail: fixes,
  };
  return { program, report };
}

// ---------------------------------------------------------------------------
// Orchestration: generate -> process -> (bounce once) -> return
// ---------------------------------------------------------------------------
const SERIOUS = new Set(['under_accessorized', 'squat_too_light', 'classic_too_light']);

async function generateProgram(profile, opts = {}) {
  const maxes = getMaxes(profile);

  // ---- PRE-FLIGHT: guard the input before spending an AI call on bad data ----
  const preflight = checkInputs(profile, maxes);
  if (!preflight.ok) {
    return { ok: false, preflight, program: null, report: null };
  }

  const system = await buildSystemPrompt();
  // Lock the computable decisions (tier cap, limiter+direction, session size, meet) into the prompt.
  const directives = buildDirectives(profile, maxes);
  const user = `${buildUserPrompt(profile, maxes, opts)}${directives ? `\n\n${directives}` : ''}`;

  const res1 = await complete({ task: 'brain', system, user, json: true, maxTokens: 16000, temperature: 0.4, cacheSystem: true });
  let program;
  try { program = JSON.parse(res1.content); } catch (e) { throw new Error('Generator returned invalid JSON: ' + (e && e.message)); }

  const first = processProgram(program, maxes);
  const serious = first.report.residual_warnings.filter((f) => SERIOUS.has(f.type));

  // One guarded retry if the linter still sees serious (non-auto-repairable) issues.
  if (serious.length && !opts.noBounce) {
    const fixMsg = 'Your previous program had these issues the guardrails flagged. Regenerate the COMPLETE program fixing them while keeping everything else sound:\n- ' +
      serious.map((f) => f.note).join('\n- ');
    try {
      const res2 = await complete({ task: 'brain', system, user: `${user}\n\n# REVISION REQUIRED\n${fixMsg}`, json: true, maxTokens: 16000, temperature: 0.4, cacheSystem: true });
      const program2 = JSON.parse(res2.content);
      const second = processProgram(program2, maxes);
      return { ok: true, preflight, program: second.program, report: second.report, reasoning: program2.reasoning, self_check: program2.self_check, bounced: true, usage: [res1.usage, res2.usage] };
    } catch (e) { /* fall through to the first (already repaired) program */ }
  }

  return { ok: true, preflight, program: first.program, report: first.report, reasoning: program.reasoning, self_check: program.self_check, bounced: false, usage: [res1.usage] };
}

module.exports = { generateProgram, processProgram, computeLoads, lintAndRepair, getMaxes, buildSystemPrompt, buildUserPrompt, parentMaxFor };
