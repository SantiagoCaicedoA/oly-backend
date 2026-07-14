/**
 * Rolling program — the PAID pipeline (the "living coach").
 *
 * Instead of freezing a 12-week block up front, the AI writes a compact BLOCK PLAN once
 * (the arc: phase, intensity, variation rotation, deloads), stored in TrainingBlock
 * (tier 'personalized'). Then each week a small step:
 *   1. adapts the athlete's maxes from recent logs (adapter),
 *   2. assembles feedback (make-rate, misses, readiness, max changes) (feedbackAssembler),
 *   3. has the AI write JUST THAT WEEK from the plan slot + feedback,
 *   4. runs it through the full guard chain (programGenerator.processProgram),
 *   5. stores it.
 * One cheap, fast call per week → closes the feedback loop, gives block-to-block continuity,
 * cuts cost, and stays under the request timeout. Free (team) tier keeps the deterministic engine.
 *
 * Pure pieces (prompt builders, processWeek) are unit-testable; DB glue is lazy-required.
 */

const { complete } = require('./llmClient');
const {
  buildSystemPrompt, getMaxes, processProgram, parentMaxFor,
} = require('./programGenerator');
const { formatProfileForPrompt, resolveTier } = require('./openaiService');
const { checkInputs, buildDirectives } = require('./preflight');
const { assembleFeedback } = require('./feedbackAssembler');

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
const PLAN_SHAPE = `{
  "reasoning": "limiter + direction, the phase arc, and how variety/deloads/peak are laid out",
  "ending": "max_out | base_test | meet",
  "plan": [
    { "week": 1, "phase": "Base", "top_intensity": 82, "squat_pct": 80, "is_deload": false, "is_special": false,
      "main_variation": "hang snatch (above knee)", "pull_variation": "snatch pull",
      "accessory_focus": "posterior chain + upper back", "emphasis": "snatch positions",
      "note": "one-line intention for the week" }
  ]
}`;

function buildPlanPrompt(profile, maxes, weeks, directives) {
  return `# THIS ATHLETE\n${formatProfileForPrompt(profile)}\n\n` +
    `# MAXES (kg)\n${JSON.stringify(maxes)}\n\n` +
    `# TASK — write the BLOCK PLAN, not the workouts.\n` +
    `Design the ${weeks}-week arc following the Generation Spec: diagnose the limiter + direction, lay out the phases (base → strength → peak → taper/max-out), schedule a deload ~every 4th week, and decide the variation rotation (which main-lift-slot variation and pull to feature each phase). This is the skeleton the weekly builder fills in — give per-week targets, not sets.\n\n` +
    `Output ONLY this JSON:\n${PLAN_SHAPE}\n${directives ? `\n${directives}\n` : ''}\n` +
    `Rotate variations at phase boundaries (not weekly). Output ONLY the JSON object.`;
}

const WEEK_SHAPE = `{
  "reasoning": "how this week executes the plan slot and responds to the feedback",
  "days": [
    { "focus": "e.g. Snatch — key day (heavy)",
      "exercises": [ { "name": "exact library name", "rest": "3-5 min",
        "sets": [ { "percent": 82, "reps": 2, "intent": "quality" } ] } ] } ]
}`;

function buildWeekPrompt(profile, maxes, slot, feedbackSummary, directives) {
  return `# THIS ATHLETE\n${formatProfileForPrompt(profile)}\n\n` +
    `# MAXES (kg) — percentages are of the parent lift's max\n${JSON.stringify(maxes)}\n\n` +
    `# THIS WEEK'S PLAN SLOT (from the block plan — execute it)\n${JSON.stringify(slot)}\n\n` +
    `# RECENT ATHLETE FEEDBACK — ADAPT TO THIS (progress on makes, hold/insert the corrective on misses, respect readiness)\n${feedbackSummary}\n\n` +
    `# TASK — write ONLY this one week's sessions, executing the plan slot's phase, top intensity, squat %, and variation choices, adjusted for the feedback above. Every set's percent is a % of the parent lift's max.\n\n` +
    `REP SCHEME (strict): classic lifts and their close variations (pause, hang, block, no-feet, power, drop, balance) stay in SINGLES or DOUBLES above 75% — triples only at ≤75% for technique. Squats/pulls per the phase.\n\n` +
    `Output ONLY this JSON:\n${WEEK_SHAPE}\n${directives ? `\n${directives}\n` : ''}\nOutput ONLY the JSON object.`;
}

// ---------------------------------------------------------------------------
// Block plan generation (AI, cheap — runs once per block)
// ---------------------------------------------------------------------------
async function generateBlockPlan(profile, opts = {}) {
  const maxes = getMaxes(profile);
  const preflight = checkInputs(profile, maxes);
  if (!preflight.ok) return { ok: false, preflight };

  const weeks = opts.weeks || 12;
  const system = await buildSystemPrompt();
  const user = buildPlanPrompt(profile, maxes, weeks, buildDirectives(profile, maxes));
  const res = await complete({ task: 'brain', system, user, json: true, maxTokens: 3000, temperature: 0.4, cacheSystem: true });

  let parsed;
  try { parsed = JSON.parse(res.content); } catch (e) { throw new Error('Plan generator returned invalid JSON: ' + (e && e.message)); }
  const plan = Array.isArray(parsed.plan) ? parsed.plan : [];
  if (!plan.length) throw new Error('Plan generator returned an empty plan.');

  return {
    ok: true, preflight, tier: resolveTier(profile),
    plan, reasoning: parsed.reasoning, ending: parsed.ending || (profile.competition && profile.competition.preparing ? 'meet' : 'max_out'),
    weeks_total: weeks, meet_date: (profile.competition && profile.competition.date) || null, usage: res.usage,
  };
}

// ---------------------------------------------------------------------------
// One-week build: normalize the AI week + run the full guard chain (pure — testable)
// ---------------------------------------------------------------------------
function processWeek(rawWeek, slot, maxes, opts = {}) {
  const days = Array.isArray(rawWeek && rawWeek.days) ? rawWeek.days
    : (rawWeek && rawWeek.weeks && rawWeek.weeks[0] && rawWeek.weeks[0].days) || [];
  const program = { weeks: [{ week: (slot && slot.week) || 1, phase: (slot && slot.phase) || 'Base', days }] };
  const processed = processProgram(program, maxes, { tier: opts.tier, sessionMinutes: opts.sessionMinutes, painFlags: opts.painFlags });
  return { week: processed.program.weeks[0], report: processed.report };
}

async function generateWeek(profile, block, weekIndex, feedback, maxes, opts = {}) {
  const slot = (block.plan && block.plan[weekIndex - 1]) || { week: weekIndex, phase: 'Base' };
  const system = await buildSystemPrompt();
  const user = buildWeekPrompt(profile, maxes, slot, feedback.summary, buildDirectives(profile, maxes));
  const res = await complete({ task: 'brain', system, user, json: true, maxTokens: 6000, temperature: 0.4, cacheSystem: true });

  let raw;
  try { raw = JSON.parse(res.content); } catch (e) { throw new Error('Week generator returned invalid JSON: ' + (e && e.message)); }
  const out = processWeek(raw, slot, maxes, { ...opts, painFlags: feedback.painFlags });
  return { ...out, reasoning: raw.reasoning, slot, usage: res.usage };
}

// ---------------------------------------------------------------------------
// Orchestration (DB — lazy requires so this file loads without mongoose)
// ---------------------------------------------------------------------------
async function advanceRollingBlock(user, opts = {}) {
  const TrainingBlock = require('../models/TrainingBlock');
  const WeeklyTraining = require('../models/WeeklyTraining');
  const { currentWeekIndex, isComplete } = require('./blockPlanner');
  const { adaptUserMaxes } = require('./adapter');
  const { getWeekStart } = require('./trainingWeekService');
  const now = opts.now || new Date();
  // opts.profile lets a test call drive the flow with a supplied athlete (real logs are skipped).
  const profile = opts.profile || user.profile;
  const isTest = !!opts.profile;

  // 1) Get/create the athlete's active PERSONALIZED block (roll when finished).
  let block = await TrainingBlock.findOne({ user: user._id, tier: 'personalized', status: 'active' }).sort({ createdAt: -1 });
  if (block && isComplete(block, now)) { block.status = 'completed'; await block.save(); block = null; }
  if (!block) {
    const gen = await generateBlockPlan(profile, { weeks: opts.weeks || 12 });
    if (!gen.ok) return { ok: false, preflight: gen.preflight };
    const competing = !!(profile.competition && profile.competition.preparing);
    block = await TrainingBlock.create({
      user: user._id, tier: 'personalized', season_key: competing ? 'peak' : 'base', season_name: 'Personalized',
      start_date: getWeekStart(now), weeks_total: gen.weeks_total, ending: gen.ending, meet_date: gen.meet_date, plan: gen.plan, status: 'active',
    });
  }

  // 2) Adapt maxes from recent logs (skipped for a test profile), then 3) assemble feedback.
  if (!isTest) { try { await adaptUserMaxes(user); } catch (e) { console.error('adaptUserMaxes failed:', e && e.message); } }
  const sessions = isTest ? [] : await WeeklyTraining.find({ user: user._id }).sort({ week_start: -1 }).limit(3).lean();
  const maxes = getMaxes(profile);
  const feedback = assembleFeedback(sessions, opts.checkIn || null, maxes);
  const { aggregate, evidenceLine } = require('./metrics');
  const evidence = evidenceLine(aggregate(sessions, maxes));

  // 4) Build the current week from the plan slot + feedback, through the guard chain.
  const weekIndex = currentWeekIndex(block, now);
  const tier = resolveTier(profile);
  const sessionMinutes = (profile.availability && profile.availability.session_duration) || 90;
  const built = await generateWeek(profile, block, weekIndex, feedback, maxes, { tier, sessionMinutes });

  return {
    ok: true, week_index: weekIndex, tier, plan: block.plan, week: built.week, report: built.report,
    reasoning: built.reasoning, feedback: feedback.summary, evidence,
    // Block metadata for storage + coach-note context:
    block_id: block._id, phase: (built.slot && built.slot.phase) || null, weeks_total: block.weeks_total,
    ending: block.ending, slot: built.slot,
  };
}

module.exports = { generateBlockPlan, generateWeek, processWeek, advanceRollingBlock, buildPlanPrompt, buildWeekPrompt };
