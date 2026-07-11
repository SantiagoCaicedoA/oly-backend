/**
 * Season block templates — the two validated 12-week loading plans (Peak & Base),
 * ported exactly from the reviewed spreadsheet generators. Pure DATA: each week
 * carries its phase, loading schemes, differentiated Day-5, accessory level, and
 * deload/test/max-out markers. The Week Builder interprets this against the
 * exercise library + the athlete's maxes to produce concrete sessions.
 *
 * Scheme shapes:
 *   main:  { top, start, sets, reps }   // heavy Day-1/2 classic lift ramp
 *   day5:  { label, top, sets, reps }   // the lighter, differentiated day (never a 2nd max)
 *   squat: { pct, sets, reps }          // that week's squat working load (% of the squat max)
 *   pull:  { pct, sets, reps } | null   // pulls (% of the lift); null = no pull that week
 *   acc:   'full' | 'reduced' | 'peak' | 'taper' | 'max' | 'test'  // accessory/secondary volume level
 */

const PEAK_SEASON = {
  key: 'peak',
  name: 'Peak Season',
  weeks_total: 12,
  ending: 'max_out', // week 12 = build to a true max
  weeks: [
    { week: 1,  phase: 'Base',            acc: 'full',    main: { top: 77, start: 70, sets: 5, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 67, sets: 3, reps: 2 }, squat: { pct: 72, sets: 4, reps: 5 }, pull: { pct: 100, sets: 4, reps: 3 }, note: 'Build the base — positions and volume.' },
    { week: 2,  phase: 'Base',            acc: 'full',    main: { top: 80, start: 73, sets: 5, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 70, sets: 3, reps: 2 }, squat: { pct: 76, sets: 5, reps: 4 }, pull: { pct: 103, sets: 4, reps: 3 }, note: 'Highest base volume — the work that pays later.' },
    { week: 3,  phase: 'Strength',        acc: 'full',    main: { top: 84, start: 78, sets: 4, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 73, sets: 3, reps: 2 }, squat: { pct: 82, sets: 5, reps: 3 }, pull: { pct: 105, sets: 3, reps: 3 }, note: 'Heavier bars, own the positions.' },
    { week: 4,  phase: 'Deload',          acc: 'reduced', main: { top: 72, start: 66, sets: 3, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 62, sets: 2, reps: 2 }, squat: { pct: 70, sets: 3, reps: 4 }, pull: { pct: 100, sets: 3, reps: 3 }, note: 'Planned recovery — absorb the base.' },
    { week: 5,  phase: 'Strength',        acc: 'full',    main: { top: 86, start: 78, sets: 5, reps: 1 }, day5: { label: 'Snatch (speed/tech)', top: 74, sets: 3, reps: 2 }, squat: { pct: 85, sets: 5, reps: 3 }, pull: { pct: 107, sets: 3, reps: 3 }, note: 'Strength is the engine for bigger lifts.' },
    { week: 6,  phase: 'Strength',        acc: 'full',    main: { top: 88, start: 80, sets: 5, reps: 1 }, day5: { label: 'Snatch (speed/tech)', top: 76, sets: 3, reps: 2 }, squat: { pct: 87, sets: 4, reps: 3 }, pull: { pct: 110, sets: 3, reps: 3 }, note: 'Heaviest strength — confidence under load.' },
    { week: 7,  phase: 'Peak',            acc: 'peak',    main: { top: 90, start: 82, sets: 4, reps: 1 }, day5: { label: 'Snatch (openers)',    top: 84, sets: 2, reps: 1 }, squat: { pct: 88, sets: 4, reps: 2 }, pull: { pct: 107, sets: 3, reps: 2 }, note: 'First near-max exposure — one heavy single.' },
    { week: 8,  phase: 'Deload',          acc: 'reduced', main: { top: 80, start: 72, sets: 3, reps: 1 }, day5: { label: 'Snatch (speed/tech)', top: 70, sets: 2, reps: 2 }, squat: { pct: 78, sets: 3, reps: 3 }, pull: { pct: 100, sets: 3, reps: 2 }, note: 'Recover so you peak clean.' },
    { week: 9,  phase: 'Peak',            acc: 'peak',    main: { top: 91, start: 83, sets: 4, reps: 1 }, day5: { label: 'Snatch (openers)',    top: 85, sets: 2, reps: 1 }, squat: { pct: 90, sets: 3, reps: 2 }, pull: { pct: 90, sets: 2, reps: 2 }, note: 'A single heavy exposure at 90%+.' },
    { week: 10, phase: 'Peak',            acc: 'peak',    main: { top: 93, start: 85, sets: 4, reps: 1 }, day5: { label: 'Snatch (openers)',    top: 87, sets: 2, reps: 1 }, squat: { pct: 88, sets: 3, reps: 2 }, pull: null, note: 'Top peak week — one quality heavy single.' },
    { week: 11, phase: 'Taper',           acc: 'taper',   main: { top: 88, start: 80, sets: 3, reps: 1 }, day5: { label: 'Snatch (speed/tech)', top: 78, sets: 2, reps: 1 }, squat: { pct: 78, sets: 2, reps: 2 }, pull: null, note: 'Openers only — shed fatigue everywhere, not just the bar.' },
    { week: 12, phase: 'Max-Out',         acc: 'max',     main: null, day5: null, squat: null, pull: null, note: 'Light primer + light mid-week touch, then build to a max Sunday.' },
  ],
};

const BASE_SEASON = {
  key: 'base',
  name: 'Base Season',
  weeks_total: 12,
  ending: 'base_test', // week 12 = a true work-up-to-3RM benchmark (not a 1RM)
  weeks: [
    { week: 1,  phase: 'Base',     acc: 'full',    main: { top: 75, start: 68, sets: 4, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 63, sets: 3, reps: 2 }, squat: { pct: 70, sets: 4, reps: 6 }, pull: { pct: 100, sets: 4, reps: 4 }, note: 'Build the volume base, groove positions.' },
    { week: 2,  phase: 'Base',     acc: 'full',    main: { top: 77, start: 70, sets: 4, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 66, sets: 3, reps: 2 }, squat: { pct: 72, sets: 4, reps: 6 }, pull: { pct: 103, sets: 4, reps: 4 }, note: 'Add volume; technique under fatigue.' },
    { week: 3,  phase: 'Base',     acc: 'full',    main: { top: 78, start: 71, sets: 5, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 68, sets: 3, reps: 2 }, squat: { pct: 75, sets: 5, reps: 5 }, pull: { pct: 105, sets: 4, reps: 4 }, note: 'Highest volume — the growth work.' },
    { week: 4,  phase: 'Deload',   acc: 'reduced', main: { top: 72, start: 66, sets: 3, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 62, sets: 2, reps: 2 }, squat: { pct: 68, sets: 3, reps: 5 }, pull: { pct: 97, sets: 3, reps: 3 }, note: 'Recover, absorb.' },
    { week: 5,  phase: 'Strength', acc: 'full',    main: { top: 80, start: 73, sets: 4, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 70, sets: 3, reps: 2 }, squat: { pct: 78, sets: 5, reps: 4 }, pull: { pct: 107, sets: 4, reps: 3 }, note: 'Convert volume toward strength.' },
    { week: 6,  phase: 'Strength', acc: 'full',    main: { top: 82, start: 75, sets: 4, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 72, sets: 3, reps: 2 }, squat: { pct: 80, sets: 5, reps: 4 }, pull: { pct: 108, sets: 4, reps: 3 }, note: 'Heavier, still high volume.' },
    { week: 7,  phase: 'Strength', acc: 'full',    main: { top: 85, start: 77, sets: 4, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 74, sets: 3, reps: 2 }, squat: { pct: 83, sets: 4, reps: 4 }, pull: { pct: 110, sets: 3, reps: 3 }, note: 'Positional strength climbs.' },
    { week: 8,  phase: 'Deload',   acc: 'reduced', main: { top: 78, start: 71, sets: 3, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 68, sets: 2, reps: 2 }, squat: { pct: 72, sets: 3, reps: 4 }, pull: { pct: 102, sets: 3, reps: 3 }, note: 'Recover.' },
    { week: 9,  phase: 'Strength', acc: 'full',    main: { top: 86, start: 78, sets: 4, reps: 2 }, day5: { label: 'Snatch (speed/tech)', top: 75, sets: 3, reps: 2 }, squat: { pct: 85, sets: 4, reps: 3 }, pull: { pct: 110, sets: 3, reps: 3 }, note: 'Consolidate strength.' },
    { week: 10, phase: 'Strength', acc: 'full',    main: { top: 88, start: 80, sets: 4, reps: 1 }, day5: { label: 'Snatch (speed/tech)', top: 76, sets: 3, reps: 2 }, squat: { pct: 87, sets: 4, reps: 3 }, pull: { pct: 110, sets: 3, reps: 3 }, note: 'Own heavier positions.' },
    { week: 11, phase: 'Taper',    acc: 'taper',   main: { top: 86, start: 78, sets: 3, reps: 1 }, day5: { label: 'Snatch (speed/tech)', top: 74, sets: 2, reps: 2 }, squat: { pct: 84, sets: 3, reps: 3 }, pull: null, note: 'Sharpen, shed some fatigue.' },
    { week: 12, phase: 'Base Test', acc: 'test',   main: null, day5: null, squat: null, pull: null, note: 'Benchmark: a true work-up-to-3RM squat (sets next block’s squat max via e1RM) + one clean technical single each lift.' },
  ],
};

// Rotation: a member alternates Base -> Peak -> Base -> Peak ... (build before you peak).
const SEASON_ROTATION = ['base', 'peak'];
const SEASONS = { peak: PEAK_SEASON, base: BASE_SEASON };

module.exports = { PEAK_SEASON, BASE_SEASON, SEASONS, SEASON_ROTATION };
