/**
 * DB-free checks for the leaderboard WRITE path (phase 2) — pure functions
 * + router introspection, no database. Run: node scripts/checksWritePath.js
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

const {
  computeEntriesFromLifts,
  buildIdentity,
  reconcileEntries,
  scopeKeysForLiftDate,
} = require('../services/boardWrite');
const { rankOps, retryDelaySeconds } = require('../services/renumber');
const { crossesPlausibilityCap } = require('../utils/leaderboard/caps');
const { parseSubmission } = require('../controllers/liftController');

const identity = {
  name: 'Test Athlete', avatarUrl: null, club: null,
  countryCode: 'COL', sex: 'M', birthYear: 1999,
};
const lift = (type, kg, bw, date, id, pending = false) => ({
  _id: id, liftType: type, weightKg: kg, bodyweightKg: bw,
  liftDate: new Date(date), pendingReview: pending,
});

// --- §4.5 class-boundary core ----------------------------------------------
check('single lift in one class: entry with best + no total', () => {
  const es = computeEntriesFromLifts([lift('snatch', 120, 78.5, '2026-09-01', 's1')], identity);
  assert.strictEqual(es.length, 1);
  assert.strictEqual(es[0].weightClass, '79');
  assert.strictEqual(es[0].bestSnatchKg, 120);
  assert.strictEqual(es[0].totalKg, null);
  assert.strictEqual(es[0].sinclair, null);
});
check('snatch + clean in the same class: total, sinclair, per-metric dates', () => {
  const es = computeEntriesFromLifts([
    lift('snatch', 120, 78.5, '2026-09-01', 's1'),
    lift('cleanjerk', 150, 78.9, '2026-09-03', 'c1'),
  ], identity);
  assert.strictEqual(es.length, 1);
  const e = es[0];
  assert.strictEqual(e.totalKg, 270);
  assert.strictEqual(e.totalBwKg, 78.9); // heavier contributing bodyweight
  assert.strictEqual(e.snatchAchievedAt.toISOString().slice(0, 10), '2026-09-01');
  assert.strictEqual(e.totalAchievedAt.toISOString().slice(0, 10), '2026-09-03'); // when COMPLETED
  assert.ok(e.sinclair > 270, 'sinclair adjusts up for sub-b bodyweight');
});
check('REAL split-class pair (78.6 / 80.4): singles rank in own class, total in the heavier', () => {
  const es = computeEntriesFromLifts([
    lift('snatch', 120, 78.6, '2026-09-01', 's1'),
    lift('cleanjerk', 150, 80.4, '2026-09-02', 'c1'),
  ], identity);
  const by = Object.fromEntries(es.map((e) => [e.weightClass, e]));
  assert.ok(by['79'] && by['88'], 'two entries exist');
  // 79 entry: snatch ranks there, NO total (one lift never on two boards)
  assert.strictEqual(by['79'].bestSnatchKg, 120);
  assert.strictEqual(by['79'].totalKg, null);
  assert.strictEqual(by['79'].sinclair, null);
  // 88 entry: clean ranks there, total lives there with borrowed snatch
  assert.strictEqual(by['88'].bestCleanKg, 150);
  assert.strictEqual(by['88'].bestSnatchKg, null, 'snatch does NOT rank in 88');
  assert.strictEqual(by['88'].totalKg, 270);
  assert.strictEqual(by['88'].totalSnatchKg, 120, 'borrowed component');
  assert.strictEqual(by['88'].totalBwKg, 80.4);
});
check('best-lift compare: heavier wins; equal weight keeps the EARLIER lift', () => {
  const es = computeEntriesFromLifts([
    lift('snatch', 120, 78, '2026-09-05', 'late'),
    lift('snatch', 120, 78, '2026-09-01', 'early'),
    lift('snatch', 118, 78, '2026-09-06', 'lower'),
  ], identity);
  assert.strictEqual(es[0].snatchLift, 'early');
  assert.strictEqual(es[0].snatchAchievedAt.toISOString().slice(0, 10), '2026-09-01');
});
check('weight cut mid-season: 88 entry survives, 79 entry appears (like real competition)', () => {
  const es = computeEntriesFromLifts([
    lift('snatch', 125, 87.5, '2026-08-01', 's88'),
    lift('cleanjerk', 155, 87.0, '2026-08-02', 'c88'),
    lift('snatch', 122, 78.9, '2026-09-01', 's79'),
  ], identity);
  const by = Object.fromEntries(es.map((e) => [e.weightClass, e]));
  assert.strictEqual(by['88'].bestSnatchKg, 125);
  assert.strictEqual(by['79'].bestSnatchKg, 122);
  // Combined total = overall best snatch (125@88) + best clean (155@88) → 88
  assert.strictEqual(by['88'].totalKg, 280);
  assert.strictEqual(by['79'].totalKg, null);
});
check('pending badge propagates to every entry a pending lift contributes to', () => {
  const es = computeEntriesFromLifts([
    lift('snatch', 120, 78.6, '2026-09-01', 's1', true),
    lift('cleanjerk', 150, 80.4, '2026-09-02', 'c1'),
  ], identity);
  const by = Object.fromEntries(es.map((e) => [e.weightClass, e]));
  assert.strictEqual(by['79'].pendingReview, true); // its own class
  assert.strictEqual(by['88'].pendingReview, true); // contributes to the total there
});
check('no lifts → no entries (recompute deletes what submission created)', () =>
  assert.deepStrictEqual(computeEntriesFromLifts([], identity), []));

// --- reconcile: the delete rule, now pure (review round 4 BLOCKER) ---------
check('BLOCKER regression: first verified lift converts the same-class ghost — NEVER deleted', () => {
  // The modal onboarding path: provisional 88 ghost, first real lift lands
  // in 88 → the upsert flipped that very document to provisional:false; the
  // old code consulted the stale pre-upsert snapshot and deleted it.
  const existing = [{ _id: 'g1', weightClass: '88', provisional: true }];
  const desired = [{ weightClass: '88' }];
  assert.deepStrictEqual(reconcileEntries(existing, desired, true), []);
});
check('ghost in a DIFFERENT class is cleared once verified lifts exist (rev 3)', () => {
  const existing = [{ _id: 'g1', weightClass: '94', provisional: true }];
  const desired = [{ weightClass: '88' }];
  const del = reconcileEntries(existing, desired, true);
  assert.strictEqual(del.length, 1);
  assert.strictEqual(del[0]._id, 'g1');
});
check('ghost is KEPT while the athlete has no live lifts in scope', () => {
  const existing = [{ _id: 'g1', weightClass: '88', provisional: true }];
  assert.deepStrictEqual(reconcileEntries(existing, [], false), []);
});
check('stale real entry (its lifts removed) is deleted', () => {
  const existing = [
    { _id: 'e88', weightClass: '88', provisional: false },
    { _id: 'e79', weightClass: '79', provisional: false },
  ];
  const desired = [{ weightClass: '88' }];
  const del = reconcileEntries(existing, desired, true);
  assert.deepStrictEqual(del.map((d) => d._id), ['e79']);
});
check('reconcile rule is exactly "delete what was not just written"', () => {
  // Every class in the desired set survives regardless of its old flags.
  const existing = [
    { _id: 'a', weightClass: '79', provisional: true },
    { _id: 'b', weightClass: '88', provisional: false },
  ];
  const desired = [{ weightClass: '79' }, { weightClass: '88' }];
  assert.deepStrictEqual(reconcileEntries(existing, desired, true), []);
});

// --- identity gate ----------------------------------------------------------
check('identity: requires profile sex and IOC countryCode (422s, not silent boards)', () => {
  assert.throws(() => buildIdentity({ name: 'X', profile: { countryCode: 'COL' } }), /sex/);
  assert.throws(() => buildIdentity({ name: 'X', profile: { sex: 'Male' } }), /country/);
  const id = buildIdentity({ name: 'X', profile: { sex: 'Female', countryCode: 'COL', birth_year: 2000 } });
  assert.strictEqual(id.sex, 'F');
  assert.strictEqual(id.birthYear, 2000);
});

// --- scope derivation -------------------------------------------------------
check('scopeKeys: alltime always; season only when liftDate inside an open window', () => {
  const seasons = [
    { key: 'S1', status: 'active', startsAt: '2026-09-01', endsAt: '2026-12-31' },
    { key: 'S0', status: 'closed', startsAt: '2026-05-01', endsAt: '2026-08-31' },
  ];
  assert.deepStrictEqual(scopeKeysForLiftDate('2026-09-10', seasons), ['alltime', 'S1']);
  assert.deepStrictEqual(scopeKeysForLiftDate('2026-08-15', seasons), ['alltime'], 'closed season unreachable');
});

// --- renumber math ----------------------------------------------------------
check('rankOps: sorted positions, only CHANGED ranks written (idempotent $set)', () => {
  const entries = [
    { _id: 'a', totalKg: 300, ranks: { total: 1 } },
    { _id: 'b', totalKg: 290, ranks: { total: 3 } }, // wrong → 2
    { _id: 'c', totalKg: 280, ranks: { total: 3 } }, // right
  ];
  const ops = rankOps(entries, 'totalKg', (e) => e.ranks.total);
  assert.deepStrictEqual(ops, [{ _id: 'b', rank: 2 }]);
});
check('rankOps triple-replay: once ranks are right, replay produces ZERO writes', () => {
  const entries = [
    { _id: 'a', totalKg: 300, ranks: { total: null } },
    { _id: 'b', totalKg: 290, ranks: { total: null } },
  ];
  const first = rankOps(entries, 'totalKg', (e) => e.ranks.total);
  assert.strictEqual(first.length, 2);
  for (const op of first) entries.find((e) => e._id === op._id).ranks.total = op.rank;
  // replay twice more — the at-least-once safety property
  assert.deepStrictEqual(rankOps(entries, 'totalKg', (e) => e.ranks.total), []);
  assert.deepStrictEqual(rankOps(entries, 'totalKg', (e) => e.ranks.total), []);
});

check('retry backoff: later attempts wait longer, capped at 5 minutes', () => {
  assert.strictEqual(retryDelaySeconds(1), 5);
  assert.strictEqual(retryDelaySeconds(2), 20);
  assert.strictEqual(retryDelaySeconds(4), 80);
  assert.strictEqual(retryDelaySeconds(20), 300); // cap
});

// --- plausibility caps ------------------------------------------------------
check('caps: absurd weights hold, human weights never do', () => {
  assert.strictEqual(crossesPlausibilityCap(231, 'snatch', 'M', '88'), true);
  assert.strictEqual(crossesPlausibilityCap(180, 'snatch', 'M', '88'), false);
  assert.strictEqual(crossesPlausibilityCap(196, 'cleanjerk', 'F', '77'), true);
  assert.strictEqual(crossesPlausibilityCap(140, 'cleanjerk', 'F', '77'), false);
});

// --- submission validation --------------------------------------------------
check('parseSubmission: valid body accepted', () => {
  const r = parseSubmission({
    liftType: 'snatch', weightKg: 120, bodyweightKg: 79,
    liftDate: '2026-09-01', videoUrl: 'https://oly-video.s3.eu-north-1.amazonaws.com/videos/u/x.mp4',
    idemKey: 'client-uuid-1234',
  });
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.value.weightKg, 120);
});
check('parseSubmission: no video, no rank — and ranges enforced', () => {
  assert.ok(parseSubmission({ liftType: 'snatch', weightKg: 120, bodyweightKg: 79, liftDate: '2026-09-01', idemKey: 'client-uuid-1234' }).error);
  assert.ok(parseSubmission({ liftType: 'snatch', weightKg: 500, bodyweightKg: 79, liftDate: '2026-09-01', videoUrl: 'https://b.amazonaws.com/k.mp4', idemKey: 'client-uuid-1234' }).error);
  assert.ok(parseSubmission({ liftType: 'deadlift', weightKg: 120, bodyweightKg: 79, liftDate: '2026-09-01', videoUrl: 'https://b.amazonaws.com/k.mp4', idemKey: 'client-uuid-1234' }).error);
  assert.ok(parseSubmission({ liftType: 'snatch', weightKg: 120, bodyweightKg: 79, liftDate: '2026-09-01', videoUrl: 'https://b.amazonaws.com/k.mp4' }).error, 'idemKey required');
});

// --- model shapes -----------------------------------------------------------
const OutboxEvent = require('../models/OutboxEvent');
check('outbox: atomic claim lifecycle (processing status + availableAt backoff field)', () => {
  assert.ok(OutboxEvent.schema.path('status').enumValues.includes('processing'));
  assert.ok('availableAt' in OutboxEvent.schema.paths);
  assert.ok('claimedAt' in OutboxEvent.schema.paths);
  const idx = OutboxEvent.schema.indexes();
  assert.ok(idx.some(([keys]) => keys.status === 1 && keys.availableAt === 1 && keys.createdAt === 1));
});
const LiftModel = require('../models/Lift');
check('lift: {user, status, liftDate} index — recompute cost independent of career length', () => {
  const idx = LiftModel.schema.indexes();
  assert.ok(idx.some(([keys]) => keys.user === 1 && keys.status === 1 && keys.liftDate === 1));
});
const Flag = require('../models/Flag');
check('flag: one per user per lift (unique index)', () => {
  const idx = Flag.schema.indexes();
  assert.ok(idx.some(([keys, o]) => keys.lift === 1 && keys.user === 1 && o.unique));
});
const BoardEntry = require('../models/BoardEntry');
check('board entry carries the pendingReview badge field', () =>
  assert.ok('pendingReview' in BoardEntry.schema.paths));

// --- router registration ----------------------------------------------------
check('routes mounted: /lifts{,/me,/:id/flag}, /review/queue, /review/:liftId', () => {
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
  for (const want of ['/lifts/', '/lifts/me', '/lifts/:id/flag', '/review/queue', '/review/:liftId']) {
    assert.ok(mounted.some((m) => m.replace(/\/+/g, '/') === want.replace(/\/+/g, '/')),
      `missing ${want}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
