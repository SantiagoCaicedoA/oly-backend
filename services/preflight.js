/**
 * Pre-flight guard — the INPUT side of the safety system (mirror of the output linters).
 *
 * Before a single line of training is written, this:
 *   1. checkInputs()   — refuses to generate on missing or physically impossible data
 *                        (no maxes, no availability, snatch heavier than C&J, etc.).
 *                        Garbage in can't be fixed by checking the output, so we stop it here.
 *   2. buildDirectives() — promotes the decisions we can compute deterministically
 *                        (tier + intensity cap, the limiter and its DIRECTION, session size,
 *                        meet timeline) into NON-NEGOTIABLE instructions the AI can't drift on.
 *
 * Pure + deterministic; no LLM. `maxes` is the {snatch,clean_jerk,clean,jerk,back_squat,front_squat} map.
 */

const { resolveTier, tierCeiling } = require('./openaiService');

// Generous plausible human ranges (kg) — only catches typos / nonsense, not "unusual".
const RANGE = {
  snatch: [15, 260],
  clean_jerk: [20, 320],
  back_squat: [20, 400],
  front_squat: [20, 360],
};

/**
 * @returns {{ ok:boolean, errors:string[], warnings:string[] }}
 *   errors  -> block generation (missing critical data or impossible values)
 *   warnings -> allowed, but surfaced (unusual-but-possible, estimated maxes, etc.)
 */
function checkInputs(profile, maxes) {
  const errors = [];
  const warnings = [];
  const p = profile || {};
  const m = maxes || {};

  // --- 1. Completeness ---
  for (const k of ['snatch', 'clean_jerk', 'back_squat', 'front_squat']) {
    if (m[k] == null) errors.push(`Missing a required max: ${k}. Can't program without it.`);
  }
  const days = p.availability && p.availability.training_days_per_week;
  if (!days || days < 1) errors.push('Missing training days per week — needed to lay out the week.');
  if (p.competition && p.competition.preparing && !(p.competition && p.competition.date)) {
    warnings.push('Athlete is competing but gave no meet date — will run a rolling cycle instead of peaking.');
  }

  // --- 2. Sanity (only on values we actually have) ---
  for (const [k, [lo, hi]] of Object.entries(RANGE)) {
    const v = m[k];
    if (v != null && (v < lo || v > hi)) errors.push(`${k} = ${v}kg is outside a plausible range (${lo}–${hi}kg) — likely a typo.`);
  }
  const { snatch: sn, clean_jerk: cj, back_squat: bsq, front_squat: fsq } = m;
  if (sn && cj && sn >= cj) errors.push(`Snatch (${sn}kg) ≥ Clean & Jerk (${cj}kg) is physically implausible — check for a typo.`);
  if (fsq && bsq && fsq > bsq) errors.push(`Front squat (${fsq}kg) > Back squat (${bsq}kg) is implausible — check for a typo.`);

  if (sn && cj && sn < cj * 0.6) warnings.push(`Snatch is only ${Math.round((sn / cj) * 100)}% of C&J (very low) — confirm it isn't a typo.`);
  if (cj && fsq && fsq < cj) warnings.push(`Front squat (${fsq}kg) is below the clean & jerk (${cj}kg) — clean recovery is likely a hard limiter (or a typo).`);
  if (cj && bsq && bsq < cj) warnings.push(`Back squat (${bsq}kg) is below the C&J (${cj}kg) — unusually low leg strength; confirm.`);
  if (p.strength_accuracy && p.strength_accuracy !== 'Tested') {
    warnings.push('Maxes are estimated, not tested — the program will be worked conservatively under them.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

// --- Limiter + direction, computed from ratios + stated gaps ---
function diagnoseLimiter(profile, maxes) {
  const p = profile || {}, m = maxes || {};
  const items = [];
  const snR = m.snatch && m.clean_jerk ? m.snatch / m.clean_jerk : null;
  const sqR = m.front_squat && m.back_squat ? m.front_squat / m.back_squat : null;
  if (snR != null && snR < 0.78) items.push('the snatch (snatch:C&J below 78% — snatch trails the C&J)');
  if (sqR != null && sqR < 0.82) items.push('clean recovery (front:back squat below 82% — front squat / out-of-the-clean strength lags)');

  // Direction from the athlete's own words.
  const gaps = (Array.isArray(p.performance_gaps) ? p.performance_gaps : []).join(' ').toLowerCase();
  const dir = [];
  if (/high|receiv|depth|shallow|soft/.test(gaps)) dir.push('RECEIVING — the athlete catches HIGH, so use get-UNDER work (no-feet, tall, drop snatch, snatch balance, overhead squat, bottom pauses). Do NOT program power/high-catch variations — they reinforce the fault.');
  if (/slow|crash|speed|fast/.test(gaps)) dir.push('SPEED / turnover — use speed pulls, power variations, tall variations.');
  if (/pull|off the floor|position|back/.test(gaps)) dir.push('PULLING / positions — use pauses at the knee, blocks/segment work, deficit pulls, RDLs.');
  if (/overhead|lockout|jerk|stability|shoulder/.test(gaps)) dir.push('OVERHEAD stability — overhead squat, snatch balance, drop snatch, jerk-support/pause jerk.');

  return { items, directions: dir, statedGaps: Array.isArray(p.performance_gaps) ? p.performance_gaps : [] };
}

/**
 * Non-negotiable directives injected into the prompt. These lock the decisions we
 * can compute so the AI can't override them.
 * @returns {string} a formatted block (empty string if nothing computable)
 */
function buildDirectives(profile, maxes) {
  const p = profile || {};
  const D = [];

  const tier = resolveTier(p);
  const cap = tierCeiling(tier);
  D.push(`TIER = ${tier} (LOCKED). Hard intensity ceiling: ${cap}% of max on any lift. ` +
    (tier === 'Developing'
      ? 'Developing/beginner: load by feel to ~RPE 6–7, NO maximal singles, classic lifts never above 80%.'
      : tier === 'National+'
        ? 'Advanced: trains heavy — classic lifts live 85–95% in normal weeks, multiple heavy exposures.'
        : 'Provincial: classic lifts 88–92% on the heavy day, must not exceed 92% outside the peak.'));

  const lim = diagnoseLimiter(p, maxes);
  if (lim.statedGaps.length) D.push(`STATED WEAKNESSES (must be visibly addressed): ${lim.statedGaps.join('; ')}.`);
  if (lim.items.length) D.push(`COMPUTED LIMITER(S): ${lim.items.join(' AND ')}.`);
  if (lim.directions.length) D.push(`CORRECTIVE DIRECTION (LOCKED — match the fault's mechanism): ${lim.directions.join(' ')}`);

  const dur = (p.availability && p.availability.session_duration) || 60;
  const nEx = dur >= 90 ? 5 : dur >= 60 ? 4 : 3;
  D.push(`SESSION SIZE (LOCKED): every training day has at least ${nEx} exercises within the ${dur}-min budget (main lift + pull/variation + squat + 1–2 accessories); one squat pattern per day.`);

  if (p.competition && p.competition.preparing && p.competition.date) {
    D.push(`MEET (LOCKED): peak toward ${p.competition.date}${p.competition.name ? ' (' + p.competition.name + ')' : ''} — real taper + PR attempts above current max on the day.`);
  }

  return D.length
    ? `# NON-NEGOTIABLE DIRECTIVES (computed for THIS athlete — these OVERRIDE any conflicting default; apply exactly)\n- ${D.join('\n- ')}`
    : '';
}

module.exports = { checkInputs, buildDirectives, diagnoseLimiter, RANGE };
