/**
 * Week Builder — materializes ONE week's concrete sessions from its season-template
 * slot + the athlete's maxes. Pure computation (no DB), a faithful port of the
 * validated spreadsheet logic: differentiated Day-5, tapering squats/accessories,
 * deloads, Max-Out / Base-Test weeks. Returns the workout-tab JSON shape
 * ({ training_days: [...] }) that the existing pipeline already consumes, so the
 * block engine simply replaces the AI call. History-awareness flows through the
 * maxes, which the Adapter keeps honest from logged results.
 */
const { SEASONS } = require('../data/season-blocks');

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* ---------- maxes ---------- */
function getMaxes(profile) {
  const ss = (profile && profile.strength_stats) || {};
  const v = (o) => (o && typeof o.value === 'number' && o.value > 0 ? o.value : null);
  const c = ss.classic || {}, va = ss.variation || {}, sq = ss.squat || {}, pr = ss.press || {};
  const back = v(sq.back_squat);
  return {
    snatch: v(c.snatch),
    cj: v(c.clean_jerk),
    clean: v(va.clean) || v(c.clean_jerk),
    power_snatch: v(va.power_snatch) || (v(c.snatch) ? Math.round(v(c.snatch) * 0.8) : null),
    power_clean: v(va.power_clean) || (v(va.clean) ? Math.round(v(va.clean) * 0.82) : null),
    jerk: v(pr.jerk) || v(c.clean_jerk),
    back_squat: back,
    front_squat: v(sq.front_squat) || (back ? Math.round(back * 0.86) : null),
  };
}

/* ---------- load helpers ---------- */
const r25 = (w) => Math.round(w / 2.5) * 2.5;
const load = (pct, mx) => (mx ? r25((pct / 100) * mx) : null);
function ramp(top, start, sets) {
  if (sets <= 1) return [top];
  const step = (top - start) / (sets - 1);
  return Array.from({ length: sets }, (_, i) => Math.round(start + step * i));
}
// scheme -> array of {pct, reps, weight}
function scheme(top, start, sets, reps, mx) {
  return ramp(top, start, sets).map((p) => ({ pct: p, reps, weight: load(p, mx) }));
}
function flat(pct, sets, reps, mx) {
  return Array.from({ length: sets }, () => ({ pct, reps, weight: load(pct, mx) }));
}

/* ---------- intent + context ---------- */
function intentFor(name) {
  const n = name.toLowerCase();
  if (/pull|squat|deadlift|rdl|row|extension|press/.test(n)) return 'Strength Under Load';
  if (/power|speed|tall|drop|balance|openers|touch/.test(n)) return 'Speed & Power';
  if (/hang|pause|tempo|no-feet|segment|primer|test/.test(n)) return 'Technical Consistency';
  return 'Strength Under Load';
}
// convert internal sets [{pct,reps,weight}] to workout-tab set objects
function toSets(raw) {
  const topW = Math.max(...raw.map((s) => s.weight || 0));
  return raw.map((s, i) => ({
    set_number: i + 1,
    weight: s.weight,
    reps: s.reps,
    rpm_percent: s.pct,
    coach_prescription: '',
    key_cues: [],
    intent: 'Strength Under Load',
    context: raw.length > 1 && s.weight === topW && i === raw.length - 1 ? 'Top Set' : `Set ${i + 1} of ${raw.length}`,
  }));
}
function ex(name, raw) {
  const sets = toSets(raw).map((s) => ({ ...s, intent: intentFor(name) }));
  return { exercise_name: name, time: '', no_of_set: sets.length, coach_note: '', sets };
}

/* ---------- PEAK week ---------- */
function buildPeakDays(w, M) {
  if (w.acc === 'max') {
    return [
      { label: 'Primer', exercises: [ex('Snatch (primer)', scheme(80, 60, 3, 1, M.snatch)), ex('Clean & Jerk (primer)', scheme(80, 60, 3, 1, M.cj))] },
      { label: 'Light touch', exercises: [ex('Snatch (light touch)', scheme(85, 75, 2, 1, M.snatch)), ex('Clean & Jerk (light touch)', scheme(85, 75, 2, 1, M.cj))] },
      { label: 'Max-Out Day', exercises: [ex('Snatch — build to MAX', scheme(100, 70, 5, 1, M.snatch)), ex('Clean & Jerk — build to MAX', scheme(100, 70, 5, 1, M.cj))] },
    ];
  }
  const { main, day5, squat, pull, acc } = w;
  const sqScheme = (mx, lvl) =>
    lvl === 'heavy' ? flat(squat.pct, squat.sets, squat.reps, mx)
    : lvl === 'mod' ? flat(Math.max(squat.pct - 14, 72), 3, 3, mx)
    : flat(Math.max(squat.pct - 8, 68), 2, 2, mx);
  const addSquat = (list, i, name, mx) => {
    if (acc === 'full' || acc === 'reduced') list.push(ex(name, sqScheme(mx, 'heavy')));
    else if (acc === 'peak') { if (i === 1) list.push(ex(name, sqScheme(mx, 'heavy'))); else if (i === 4) list.push(ex(name, sqScheme(mx, 'mod'))); }
    else if (acc === 'taper') { if (i === 1) list.push(ex(name, flat(squat.pct, 2, 2, mx))); else if (i === 4) list.push(ex(name, sqScheme(mx, 'light'))); }
  };
  const heavy = (name, mx) => ex(name, scheme(main.top, main.start, main.sets, main.reps, mx));
  const pullEx = (name, mx) => (pull ? ex(name, flat(pull.pct, pull.sets, pull.reps, mx)) : null);

  // Day 1 — Snatch + Squat
  const d1 = [heavy('Snatch', M.snatch)];
  if (pullEx('Snatch pull', M.snatch)) d1.push(pullEx('Snatch pull', M.snatch));
  addSquat(d1, 1, 'Back squat', M.back_squat);
  // Day 2 — C&J + Squat
  const d2 = [heavy('Clean & Jerk', M.cj)];
  if (pullEx('Clean pull', M.clean)) d2.push(pullEx('Clean pull', M.clean));
  addSquat(d2, 2, 'Front squat', M.front_squat);
  // Day 3 — Snatch skill + Strength
  const d3 = [];
  if (acc === 'full' || acc === 'reduced') {
    const ht = main.top - (acc === 'full' ? 8 : 12);
    d3.push(ex('Hang snatch', scheme(ht, ht - 5, 3, 2, M.snatch)));
  }
  addSquat(d3, 3, 'Back squat', M.back_squat);
  if (acc === 'full') { d3.push(ex('Snatch balance', flat(Math.min(main.top, 92), 3, 2, M.snatch))); d3.push(ex('Romanian deadlift (RDL)', flat(55, 3, 5, M.back_squat))); }
  else if (acc === 'reduced') d3.push(ex('Romanian deadlift (RDL)', flat(45, 3, 5, M.back_squat)));
  else if (acc === 'peak') d3.push(ex('Snatch balance (light)', flat(78, 2, 2, M.snatch)));
  // Day 4 — Power + Jerk
  const d4 = [];
  if (acc === 'full' || acc === 'reduced') {
    d4.push(ex('Power snatch', scheme(Math.min(main.top, 88), main.start, 4, main.reps === 1 ? 1 : 2, M.power_snatch)));
    if (acc === 'full') d4.push(ex('Power clean & jerk', scheme(Math.min(main.top, 88), main.start, 4, main.reps === 1 ? 1 : 2, M.power_clean)));
    d4.push(ex('Jerk (from rack)', scheme(Math.min(main.top, 90), main.start, 3, 1, M.jerk)));
  } else if (acc === 'peak') d4.push(ex('Jerk (openers)', flat(85, 2, 1, M.jerk)));
  else if (acc === 'taper') d4.push(ex('Jerk (light primer)', flat(75, 2, 1, M.jerk)));
  addSquat(d4, 4, 'Front squat', M.front_squat);
  // Day 5 — differentiated
  const d5 = [
    ex(day5.label, scheme(day5.top, Math.max(day5.top - 6, 55), day5.sets, day5.reps, M.snatch)),
    ex(day5.label.replace('Snatch', 'C&J'), scheme(day5.top, Math.max(day5.top - 6, 55), day5.sets, day5.reps, M.cj)),
  ];
  addSquat(d5, 5, 'Back squat', M.back_squat);

  return [
    { label: 'Snatch + Squat', exercises: d1 },
    { label: 'Clean & Jerk + Squat', exercises: d2 },
    { label: 'Snatch skill + Strength', exercises: d3 },
    { label: 'Power + Jerk', exercises: d4 },
    { label: 'Snatch + C&J (speed/openers)', exercises: d5 },
  ];
}

/* ---------- BASE week ---------- */
function buildBaseDays(w, M) {
  if (w.acc === 'test') {
    return [
      { label: 'Primer', exercises: [ex('Snatch (primer)', scheme(75, 60, 3, 2, M.snatch)), ex('Clean & Jerk (primer)', scheme(75, 60, 3, 2, M.cj))] },
      { label: 'Base Test Day', exercises: [
        ex('Snatch (test single)', scheme(90, 70, 4, 1, M.snatch)),
        ex('Clean & Jerk (test single)', scheme(90, 70, 4, 1, M.cj)),
        ex('Back squat (3RM)', scheme(90, 78, 3, 3, M.back_squat)),
        ex('Front squat (3RM)', scheme(88, 76, 3, 3, M.front_squat)),
      ] },
    ];
  }
  const { main, day5, squat, pull, acc } = w;
  const full = acc === 'full';
  const sq = (mx) => flat(squat.pct, squat.sets, squat.reps, mx);
  const pullEx = (name, mx) => (pull ? ex(name, flat(pull.pct, pull.sets, pull.reps, mx)) : null);
  const heavy = (name, mx) => ex(name, scheme(main.top, main.start, main.sets, main.reps, mx));
  const accSets = full ? 4 : acc === 'reduced' ? 3 : 0;
  const repEx = (name, reps) => ({ exercise_name: name, time: '', no_of_set: accSets, coach_note: '',
    sets: Array.from({ length: accSets }, (_, i) => ({ set_number: i + 1, weight: null, reps, rpm_percent: null, coach_prescription: 'RPE 7–8', key_cues: [], intent: 'Strength Under Load', context: `Set ${i + 1} of ${accSets}` })) });

  const d1 = [heavy('Snatch', M.snatch)];
  if (pullEx('Snatch pull', M.snatch)) d1.push(pullEx('Snatch pull', M.snatch));
  d1.push(ex('Back squat', sq(M.back_squat)));
  if (accSets) d1.push(repEx('Barbell row', 8));

  const d2 = [heavy('Clean & Jerk', M.cj)];
  if (pullEx('Clean pull', M.clean)) d2.push(pullEx('Clean pull', M.clean));
  d2.push(ex('Front squat', sq(M.front_squat)));
  if (accSets) d2.push(repEx('Back extension', 12));

  const htop = Math.min(main.top - 6, 80);
  const d3 = [ex('Hang snatch (triples)', scheme(htop, htop - 6, full ? 3 : 2, 3, M.snatch)), ex('Back squat', sq(M.back_squat))];
  if (full) d3.push(ex('Snatch balance', flat(Math.min(main.top, 90), 3, 2, M.snatch)));

  const d4 = [];
  if (acc !== 'taper') {
    d4.push(ex('Power snatch', scheme(Math.min(main.top, 85), main.start, 4, 2, M.power_snatch)));
    d4.push(ex('Hang clean (triples)', scheme(Math.min(main.top - 4, 82), main.start - 4, full ? 3 : 2, 3, M.clean)));
    d4.push(ex('Jerk (from rack)', scheme(Math.min(main.top, 88), main.start, 3, 2, M.jerk)));
  }
  d4.push(ex('Front squat', sq(M.front_squat)));

  const d5 = [
    ex('Snatch (speed/tech)', scheme(day5.top, Math.max(day5.top - 6, 55), full ? 3 : 2, 2, M.snatch)),
    ex('C&J (speed/tech)', scheme(day5.top, Math.max(day5.top - 6, 55), full ? 3 : 2, 2, M.cj)),
  ];
  if (acc !== 'taper') d5.push(ex('Back squat', sq(M.back_squat)));
  if (accSets) d5.push(repEx('Strict press (overhead)', 6));

  return [
    { label: 'Snatch + Squat + Row', exercises: d1 },
    { label: 'C&J + Squat + Back Ext', exercises: d2 },
    { label: 'Snatch volume + Strength', exercises: d3 },
    { label: 'Power + Clean volume', exercises: d4 },
    { label: 'Speed/tech + Accessories', exercises: d5 },
  ];
}

/**
 * Build one week's sessions.
 * @returns { training_days: [{day_label, theme, exercises}], phase, week, season_key, is_special }
 */
function buildWeek(seasonKey, weekIndex, maxes, options = {}) {
  const season = SEASONS[seasonKey];
  if (!season) throw new Error('Unknown season: ' + seasonKey);
  const w = season.weeks[Math.max(1, Math.min(season.weeks_total, weekIndex)) - 1];
  const rawDays = seasonKey === 'peak' ? buildPeakDays(w, maxes) : buildBaseDays(w, maxes);

  // assign training days onto the athlete's non-rest weekdays, in order.
  // Cap at the number of available training weekdays so two sessions never collide
  // on the same day_label (an athlete with fewer training days gets the first N).
  const rest = (options.rest_days || ['Saturday', 'Sunday']).map((d) => d.toLowerCase());
  const trainingWeekdays = WEEKDAYS.filter((d) => !rest.includes(d.toLowerCase()));
  const training_days = rawDays
    .filter((d) => d.exercises && d.exercises.length)
    .slice(0, trainingWeekdays.length)
    .map((d, i) => ({ day_label: trainingWeekdays[i], theme: d.label, exercises: d.exercises }));

  return { training_days, phase: w.phase, week: w.week, season_key: seasonKey, is_special: w.acc === 'max' || w.acc === 'test' };
}

module.exports = { getMaxes, buildWeek, r25, load };
