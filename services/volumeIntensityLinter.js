/**
 * Volume / intensity linter — the "is this actually loaded hard enough" guardrail.
 * Complements the plausibility linter (which catches loads too HEAVY): this one
 * catches primary lifts left too LIGHT for their phase, thin accessory work, and
 * stale variety. Deterministic; can REPAIR the squat up (the base lift of the sport)
 * or flag/bounce for the generator to fix. Runs on a generated program.
 *
 * Input: weeks = [{ phase, days }], where days is a dict {Mon:[ex,...]} or an array
 * of exercise-lists, and each exercise = { name, family, sets:[{percent,...}] }.
 */

// Top-intensity band the PRIMARY work should reach by a phase's heaviest week.
const PHASE_BAND = {
  base:     { squatMin: 80, classicMin: 74 },
  strength: { squatMin: 90, classicMin: 85 }, // a real strength block drives the squat to 90%+
  peak:     { squatMin: 85, classicMin: 90 },
  // deload / taper: intentionally light — not intensity-checked
};
const ACCESSORY_AVG_TARGET = 1.3; // aim ~1.5/session (2 on key days); below this = thin
const SQUAT_REPAIR_MAX_GAP = 6;   // only auto-nudge a modest shortfall; a big gap is a structural error → bounce

const CLASSIC = ['snatch', 'clean & jerk'];
const ACCESSORY_FAMILIES = ['accessory', 'posterior', 'core', 'midline', 'press'];
const ACCESSORY_KEYWORDS = ['row', 'extension', 'plank', 'curl', 'raise', 'face pull', 'split squat',
  'ghr', 'carry', 'pull-up', 'pullup', 'dip', 'good morning', 'hyper', 'nordic', 'pallof', 'sit-up', 'situp'];

function normPhase(p) {
  const s = String(p || '').toLowerCase();
  if (s.includes('deload')) return 'deload';
  if (s.includes('taper') || s.includes('meet') || s.includes('peak/mee')) return 'taper';
  if (s.includes('peak')) return 'peak';
  if (s.includes('strength')) return 'strength';
  if (s.includes('base') || s.includes('volume')) return 'base';
  return 'base';
}
const isSquat = (name) => /squat/i.test(name) && !/overhead/i.test(name); // OHS is a snatch-overhead drill, not a strength squat
const isClassicMain = (name) => CLASSIC.includes(String(name || '').toLowerCase());
// A classic-lift VARIATION filling the main slot on a secondary day (pause/hang/blocks/no-feet...).
function isMainVariation(name) {
  const n = String(name || '').toLowerCase();
  if (!/snatch|clean/.test(n)) return false;
  if (isClassicMain(name)) return false; // the full comp lift itself
  if (/pull|deadlift|high pull|balance|drop|press|row|squat|shrug/.test(n)) return false; // pulls/accessories/OHS
  return true;
}
function isAccessory(ex) {
  const fam = String(ex.family || '').toLowerCase();
  const nm = String(ex.name || '').toLowerCase();
  if (ACCESSORY_FAMILIES.some((f) => fam.includes(f)) && !isClassicMain(ex.name) && !/pull$|pull /.test(nm)) return true;
  return ACCESSORY_KEYWORDS.some((k) => nm.includes(k));
}
const dayLists = (days) => (Array.isArray(days) ? days : Object.values(days || {})).filter(Array.isArray);
const topPct = (ex) => Math.max(0, ...(ex.sets || []).map((s) => (typeof s.percent === 'number' ? s.percent : 0)));
const topSet = (ex) => (ex.sets || []).reduce((a, b) => ((typeof b.percent === 'number' && b.percent > (a ? a.percent : -1)) ? b : a), null);

function checkProgram(weeks, opts = {}) {
  const repair = opts.repair === true; // default false — pipeline opts in
  const flags = [];

  // 1) Phase-level intensity: the heaviest week of each phase should reach the band.
  const byPhase = {};
  const topSquatRef = {}; // phase -> the heaviest squat SET object (for repair)
  const varsByPhase = {}; // phase -> Set of main-variation names (for variety check)
  for (const w of weeks || []) {
    const ph = normPhase(w.phase);
    varsByPhase[ph] = varsByPhase[ph] || new Set();
    for (const dl of dayLists(w.days)) for (const ex of dl) {
      if (!ex) continue;
      if (isMainVariation(ex.name)) varsByPhase[ph].add(ex.name.toLowerCase().trim());
      if (!Array.isArray(ex.sets)) continue;
      if (ph === 'deload' || ph === 'taper') continue;
      const p = (byPhase[ph] = byPhase[ph] || { squat: 0, classic: 0 });
      const t = topPct(ex);
      if (isSquat(ex.name) && t > p.squat) { p.squat = t; topSquatRef[ph] = topSet(ex); }
      if (isClassicMain(ex.name)) p.classic = Math.max(p.classic, t);
    }
  }
  for (const [ph, hit] of Object.entries(byPhase)) {
    const band = PHASE_BAND[ph];
    if (!band) continue;
    if (hit.squat && hit.squat < band.squatMin) {
      const gap = band.squatMin - hit.squat;
      let repaired = false;
      if (repair && gap <= SQUAT_REPAIR_MAX_GAP && topSquatRef[ph]) { topSquatRef[ph].percent = band.squatMin; repaired = true; }
      flags.push({ type: 'squat_too_light', phase: ph, reached: hit.squat, target_min: band.squatMin, repaired,
        note: `Squats in the ${ph} phase only reached ${hit.squat}% — target ≥${band.squatMin}%.`
          + (repaired ? ` → repaired top squat set to ${band.squatMin}%.` : (gap > SQUAT_REPAIR_MAX_GAP ? ' Gap too large to auto-fix — regenerate.' : '')) });
    }
    if (hit.classic && hit.classic < band.classicMin)
      flags.push({ type: 'classic_too_light', phase: ph, reached: hit.classic, target_min: band.classicMin,
        note: `Classic lifts in the ${ph} phase only reached ${hit.classic}% — target ≥${band.classicMin}%.` });
  }

  // 2) Accessory floor + volume: non-deload/taper sessions carry >=1, averaging ~1.5.
  let sessions = 0, under = 0, totalAcc = 0;
  for (const w of weeks || []) {
    const ph = normPhase(w.phase);
    if (ph === 'deload' || ph === 'taper') continue;
    for (const dl of dayLists(w.days)) {
      sessions++;
      const nAcc = dl.filter((ex) => ex && isAccessory(ex)).length;
      totalAcc += nAcc;
      if (nAcc < 1) under++;
    }
  }
  const avgAcc = sessions ? totalAcc / sessions : 0;
  if (sessions && under / sessions > 0.2)
    flags.push({ type: 'under_accessorized', sessions_without_accessories: under, total_sessions: sessions,
      note: `${under}/${sessions} working sessions have no accessory — every working session needs 1–2.` });
  else if (sessions && avgAcc < ACCESSORY_AVG_TARGET)
    flags.push({ type: 'accessories_thin', avg_per_session: Math.round(avgAcc * 100) / 100,
      note: `Accessories average ${avgAcc.toFixed(2)}/session — thin. Aim ~1.5 (2 on key strength/squat days).` });

  // 3) Variety: a main-slot variation should not be carried across multiple phases (stale rotation).
  const rotatingPhases = ['base', 'strength']; // peak/taper intentionally narrow to the full lifts
  const seen = {};
  for (const ph of rotatingPhases) for (const v of (varsByPhase[ph] || [])) (seen[v] = seen[v] || []).push(ph);
  const stale = Object.entries(seen).filter(([, phs]) => phs.length > 1).map(([v]) => v);
  const distinct = Object.keys(seen).length;
  if (stale.length)
    flags.push({ type: 'variety_stale', reused: stale,
      note: `Main-slot variation(s) reused across phases instead of rotating: ${stale.join(', ')}. Use a different variation each phase.` });
  else if (distinct <= 1)
    flags.push({ type: 'variety_narrow', distinct,
      note: `Only ${distinct} main-slot variation across Base+Strength — rotate through hang / pause / blocks / no-feet by phase.` });

  return { flags, repaired: repair, summary: { phases: byPhase, sessions_without_accessories: under, working_sessions: sessions, avg_accessories: Math.round(avgAcc * 100) / 100, variations_by_phase: Object.fromEntries(Object.entries(varsByPhase).map(([k, v]) => [k, [...v]])) } };
}

module.exports = { checkProgram, normPhase, isSquat, isClassicMain, isMainVariation, isAccessory, PHASE_BAND };
