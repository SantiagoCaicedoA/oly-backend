/**
 * DB-free checks for the leaderboard phase-1 code — same harness style as
 * the follow-system/security work: pure functions + router introspection,
 * no database required. Run: node scripts/checksLeaderboard.js
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'check-secret';
let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}
const assert = require('assert');

// --- class table -----------------------------------------------------------
const { classForBodyweight, classLabels, isHeavierOrEqualClass } = require('../utils/leaderboard/classTable');
check('class table: 2025-06 men labels', () =>
  assert.deepStrictEqual(classLabels('M'), ['60', '65', '71', '79', '88', '94', '110', '+110']));
check('class table: 2025-06 women labels', () =>
  assert.deepStrictEqual(classLabels('F'), ['48', '53', '58', '63', '69', '77', '86', '+86']));
check('class for 79.2 M is 88 (79 cap exceeded)', () =>
  assert.strictEqual(classForBodyweight(79.2, 'M'), '88'));
check('class for 79.0 M is 79 (at the cap)', () =>
  assert.strictEqual(classForBodyweight(79.0, 'M'), '79'));
check('class for 130 M is +110', () => assert.strictEqual(classForBodyweight(130, 'M'), '+110'));
check('heavier-or-equal ordering', () => {
  assert.ok(isHeavierOrEqualClass('88', '79', 'M'));
  assert.ok(isHeavierOrEqualClass('+110', '60', 'M'));
  assert.ok(!isHeavierOrEqualClass('60', '65', 'M'));
});

// --- sinclair --------------------------------------------------------------
const { sinclairScore } = require('../utils/leaderboard/sinclair');
check('sinclair: heavier bodyweight scores lower (ungameable direction)', () => {
  const light = sinclairScore(250, 78, 'M');
  const heavy = sinclairScore(250, 88, 'M');
  assert.ok(light > heavy, `${light} !> ${heavy}`);
});
check('sinclair: at/above b returns raw total', () =>
  assert.strictEqual(sinclairScore(250, 200, 'M'), 250));
check('sinclair: null on missing inputs', () => assert.strictEqual(sinclairScore(null, 80, 'M'), null));

// --- age categories --------------------------------------------------------
const { categoriesForBirthYear, birthYearPredicate } = require('../utils/leaderboard/ageCategories');
check('19yo is open AND junior (overlap, never an enum)', () =>
  assert.deepStrictEqual(categoriesForBirthYear(2007, 2026).sort(), ['junior', 'open']));
check('40yo is open AND masters', () =>
  assert.deepStrictEqual(categoriesForBirthYear(1986, 2026).sort(), ['masters', 'open']));
check('27yo is open only', () =>
  assert.deepStrictEqual(categoriesForBirthYear(1999, 2026), ['open']));
check('open filter imposes no restriction', () =>
  assert.deepStrictEqual(birthYearPredicate('open', 2026), {}));
check('junior filter is a birth-year range', () =>
  assert.deepStrictEqual(birthYearPredicate('junior', 2026), { birthYear: { $gte: 2006 } }));

// --- cursor ----------------------------------------------------------------
const { encodeCursor, decodeCursor, betterThanPredicate } = require('../utils/leaderboard/cursor');
check('cursor round-trips', () => {
  const c = decodeCursor(encodeCursor(212, 1725000000000, '650000000000000000000001'));
  assert.deepStrictEqual(c, { value: 212, tieDateMs: 1725000000000, userId: '650000000000000000000001' });
});
check('garbage cursor decodes to null, never throws', () => {
  assert.strictEqual(decodeCursor('not-a-cursor!!'), null);
  assert.strictEqual(decodeCursor(''), null);
});
check('betterThan predicate: value beats, earlier date breaks ties', () => {
  const p = betterThanPredicate('totalKg', 'totalAchievedAt', 212, new Date(0), 'u1');
  assert.strictEqual(p.$or.length, 3);
  assert.deepStrictEqual(p.$or[0], { totalKg: { $gt: 212 } });
  assert.deepStrictEqual(p.$or[1].totalAchievedAt, { $lt: new Date(0) });
});

// --- controller param parsing / query shapes -------------------------------
const { parseBoardParams, boardFilter } = require('../controllers/leaderboardController');
check('params: defaults are total/season/M/open', () => {
  const p = parseBoardParams({});
  assert.strictEqual(p.lift, 'total');
  assert.strictEqual(p.scope, 'season');
  assert.strictEqual(p.age, 'open');
});
check('params: limit clamped to 50', () =>
  assert.strictEqual(parseBoardParams({ limit: '500' }).limit, 50));
check('params: bad country rejected (equality only, IOC shape)', () =>
  assert.strictEqual(parseBoardParams({ country: 'colombia; DROP' }).country, null));
check('every board filter carries provisional:false (partial-index match)', () => {
  for (const lift of ['total', 'snatch', 'cleanjerk', 'sinclair']) {
    const f = boardFilter({ lift, scopeKey: 'S1', sex: 'M', weightClass: '79', age: 'open', country: null });
    assert.strictEqual(f.provisional, false, lift);
  }
});
check('sinclair filter carries sinclair:{$gt:0} (partial-index selection, rev 5)', () => {
  const f = boardFilter({ lift: 'sinclair', scopeKey: 'S1', sex: 'M', weightClass: null, age: 'open', country: null });
  assert.deepStrictEqual(f.sinclair, { $gt: 0 });
  assert.ok(!('weightClass' in f), 'sinclair board spans classes');
});

// --- model index definitions ----------------------------------------------
const BoardEntry = require('../models/BoardEntry');
check('all four board indexes are partial on provisional:false', () => {
  const idx = BoardEntry.schema.indexes();
  const partials = idx.filter(([, o]) => o.partialFilterExpression);
  assert.strictEqual(partials.length, 4, `expected 4 partial indexes, got ${partials.length}`);
  for (const [, opts] of partials) {
    assert.strictEqual(opts.partialFilterExpression.provisional, false, opts.name);
  }
});
check('sinclair index partial additionally requires sinclair > 0', () => {
  const idx = BoardEntry.schema.indexes();
  const [, opts] = idx.find(([, o]) => o.name === 'board_sinclair');
  assert.deepStrictEqual(opts.partialFilterExpression.sinclair, { $gt: 0 });
});
check('each metric index tie-breaks on its OWN date (rev 5 finding #1)', () => {
  const idx = BoardEntry.schema.indexes();
  const byName = Object.fromEntries(idx.map(([keys, o]) => [o.name, keys]));
  assert.deepStrictEqual(Object.keys(byName.board_total),
    ['scopeKey', 'sex', 'weightClass', 'totalKg', 'totalAchievedAt', 'user', 'countryCode', 'birthYear']);
  assert.ok('snatchAchievedAt' in byName.board_snatch);
  assert.ok('cleanAchievedAt' in byName.board_clean);
  assert.ok('totalAchievedAt' in byName.board_sinclair);
});
check('unique key is (user, scopeKey, weightClass) — split-class athletes allowed', () => {
  const idx = BoardEntry.schema.indexes();
  const unique = idx.find(([, o]) => o.unique);
  assert.deepStrictEqual(Object.keys(unique[0]), ['user', 'scopeKey', 'weightClass']);
});

// --- router registration ---------------------------------------------------
check('routes mounted: /leaderboard{,/me,/friends}, /seasons/current, /athletes/:id/card', () => {
  const routes = require('../routes');
  const mounted = [];
  const walk = (layer, prefix) => {
    if (layer.route) {
      mounted.push(prefix + layer.route.path);
    } else if (layer.name === 'router' && layer.handle.stack) {
      const seg = layer.regexp.source
        .replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
      layer.handle.stack.forEach((l) => walk(l, prefix + '/' + seg.replace(/[^a-z-]/gi, '')));
    }
  };
  routes.stack.forEach((l) => walk(l, ''));
  for (const want of ['/leaderboard/', '/leaderboard/me', '/leaderboard/friends', '/seasons/current', '/athletes/:id/card']) {
    assert.ok(mounted.some((m) => m.replace(/\/+/g, '/') === want.replace(/\/+/g, '/')),
      `missing ${want} in ${JSON.stringify(mounted)}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
