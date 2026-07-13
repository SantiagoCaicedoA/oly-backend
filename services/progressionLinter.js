/**
 * Progression + deload linter — enforces the two laws that make a BLOCK work over time,
 * which no per-set check can see:
 *   - §6D  a deload roughly every 4th week (never >5 straight building weeks).
 *   - Law #4  progressive overload — intensity climbs across the block, peaking late, not flat/declining.
 *
 * Flag-only: neither is auto-repairable (they need the AI to re-plan), so these bounce back.
 * No-ops safely on short programs (a 1–3 week preview can't be judged on block structure).
 */

const { normPhase, isSquat, isClassicMain, isMainVariation } = require('./volumeIntensityLinter');

const dayLists = (days) =>
  (Array.isArray(days) ? days : Object.values(days || {}))
    .map((d) => (Array.isArray(d) ? d : d && Array.isArray(d.exercises) ? d.exercises : null))
    .filter(Boolean);

const isClassicLift = (name) => isClassicMain(name) || isMainVariation(name);
const topPct = (ex) => Math.max(0, ...(ex.sets || []).map((s) => (typeof s.percent === 'number' ? s.percent : 0)));

/** A week's intensity index = the heaviest top-% among its squats and classic lifts. */
function weekIntensity(week) {
  let mx = 0;
  for (const dl of dayLists(week.days)) for (const ex of dl) {
    if (ex && Array.isArray(ex.sets) && (isSquat(ex.name) || isClassicLift(ex.name))) mx = Math.max(mx, topPct(ex));
  }
  return mx;
}

function checkProgression(weeks) {
  const flags = [];
  const W = (weeks || []).map((w, i) => ({
    week: w.week != null ? w.week : i + 1,
    phase: normPhase(w.phase),
    idx: weekIntensity(w),
  }));
  const n = W.length;

  // --- Deload cadence (only judge a block long enough to need one) ---
  if (n >= 6) {
    if (!W.some((w) => w.phase === 'deload')) {
      flags.push({ type: 'no_deload', note: `${n}-week block has no deload week — §6D wants ~1 every 4th week. Fatigue will accumulate and stall the athlete.` });
    }
    let run = 0, maxRun = 0;
    for (const w of W) { if (w.phase !== 'deload' && w.phase !== 'taper') { run++; maxRun = Math.max(maxRun, run); } else run = 0; }
    if (maxRun > 5) flags.push({ type: 'deload_gap_too_long', run: maxRun, note: `${maxRun} straight building weeks with no deload — insert one by ~week 4.` });
  }

  // --- Progressive overload across the building weeks ---
  const builds = W.filter((w) => w.phase !== 'deload' && w.phase !== 'taper' && w.idx > 0);
  if (builds.length >= 4) {
    const idxs = builds.map((b) => b.idx);
    const peak = Math.max(...idxs), trough = Math.min(...idxs);
    const first = idxs[0], last = idxs[idxs.length - 1];
    if (peak - trough < 2) {
      flags.push({ type: 'no_progression', note: `Top intensities are flat across the block (${trough}–${peak}%) — no progressive overload (Law #4). The demand must climb.` });
    } else if (last < first - 1) {
      flags.push({ type: 'declining_block', first, last, note: `The block's late building weeks (${last}%) are lighter than its early weeks (${first}%) — intensity should climb toward the peak, not fall.` });
    }
  }

  return { flags };
}

module.exports = { checkProgression, weekIntensity };
