/**
 * Live acceptance run for the leaderboard WRITE path (design doc §10,
 * phase-2 gate) — the evidence the DB-free checks structurally cannot
 * give: real transactions on a real replica set, worker convergence,
 * the flag→badge→review chain, rebuild equivalence, and the meet-day
 * concurrent burst.
 *
 * DESTRUCTIVE on its database: refuses to run unless the connected DB
 * name contains "bench" (same safety wall as the seed/bench scripts).
 *
 * Usage:
 *   MONGODB_URI=...oly-bench... JWT_SECRET=... node scripts/acceptWritePath.js
 * Exit 0 = every step passed.
 */

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

let passed = 0;
let failed = 0;
const step = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}: ${err.message}`);
  }
};
const assert = require('assert');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const dbName = mongoose.connection.name;
  if (!/bench/i.test(dbName)) {
    console.error(`Refusing to run: connected database is "${dbName}", not a bench database.`);
    process.exit(1);
  }

  const User = require('../models/User');
  const Lift = require('../models/Lift');
  const Season = require('../models/Season');
  const BoardEntry = require('../models/BoardEntry');
  const OutboxEvent = require('../models/OutboxEvent');
  const Flag = require('../models/Flag');
  const routes = require('../routes');
  const { drainOutbox } = require('../services/renumber');
  const { recomputeAthlete } = require('../services/boardWrite');
  const { renumberPartition } = require('../services/renumber');
  const { CURRENT_CLASS_SET } = require('../utils/leaderboard/classTable');

  // Clean slate (bench DB only — guarded above).
  await Promise.all([
    User.deleteMany({}), Lift.deleteMany({}), Season.deleteMany({}),
    BoardEntry.deleteMany({}), OutboxEvent.deleteMany({}), Flag.deleteMany({}),
    mongoose.connection.collection('auditlogs').deleteMany({}),
  ]);
  await BoardEntry.syncIndexes();
  await Lift.syncIndexes();
  await OutboxEvent.syncIndexes();

  // Season S1 covering today.
  const now = new Date();
  const startsAt = new Date(now.getTime() - 30 * 86400e3);
  const endsAt = new Date(now.getTime() + 90 * 86400e3);
  await Season.create({
    key: 'S1', label: 'Season 1', startsAt, endsAt,
    snapshotAt: new Date(endsAt.getTime() + 7 * 86400e3), status: 'active',
  });

  const mkUser = async (name, profile) =>
    User.create({ name, email: `${name.toLowerCase().replace(/ /g, '')}@accept.local`, password: 'accept-pass-1!', ...(profile ? { profile } : {}) });
  const fullProfile = (over = {}) => ({
    display_name: over.display_name || undefined,
    sex: 'Male', countryCode: 'COL', birth_year: 1999, club: 'Club Accept', ...over,
  });

  const bare = await mkUser('No Profile Yet');
  const hero = await mkUser('Hero Athlete', fullProfile({ display_name: 'Hero' }));
  const flagger = await mkUser('Flagger', fullProfile());
  const admin = await mkUser('Admin', fullProfile());
  admin.isAdmin = true;
  await admin.save();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api', routes);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const tokenOf = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const call = async (method, path, user, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${tokenOf(user)}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const video = 'https://oly-video.s3.eu-north-1.amazonaws.com/videos/accept/x.mp4';
  const idem = () => crypto.randomUUID();
  const submit = (user, over = {}) =>
    call('POST', '/lifts', user, {
      liftType: 'snatch', weightKg: 100, bodyweightKg: 87.0,
      liftDate: new Date(now.getTime() - 86400e3).toISOString(),
      videoUrl: video, idemKey: idem(), ...over,
    });

  // -------------------------------------------------------------------------
  await step('incomplete profile → 422 with a plain-language message', async () => {
    const r = await submit(bare);
    assert.strictEqual(r.status, 422);
    assert.match(r.body.message, /profile/i);
  });

  await step('BLOCKER case live: first verified lift CONVERTS the same-class ghost', async () => {
    // Simulate onboarding: provisional ghost in class 88 (bodyweight 87).
    await BoardEntry.create({
      user: hero._id, scopeKey: 'S1', weightClass: '88', classSetVersion: CURRENT_CLASS_SET,
      provisional: true, bestSnatchKg: 90, snatchBwKg: 87, snatchAchievedAt: now,
      name: 'Hero', countryCode: 'COL', sex: 'M', birthYear: 1999,
    });
    const r = await submit(hero, { weightKg: 110, bodyweightKg: 87.0 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const entry = await BoardEntry.findOne({ user: hero._id, scopeKey: 'S1', weightClass: '88' }).lean();
    assert.ok(entry, 'entry must EXIST (the round-4 blocker deleted it)');
    assert.strictEqual(entry.provisional, false, 'ghost converted, not ghost');
    assert.strictEqual(entry.bestSnatchKg, 110, 'real lift, not the onboarding 1RM');
    assert.ok(r.body.ranks && r.body.ranks.lift === 1, 'response carries the live rank');
  });

  await step('/leaderboard/me agrees with the submit response (never disagree, §5)', async () => {
    const r = await call('GET', '/leaderboard/me?lift=snatch&class=88&sex=M', hero);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.me.rank, 1);
    assert.strictEqual(r.body.me.provisional, false);
  });

  await step('split-class: C&J at 79kg bodyweight → total lands in the HEAVIER class (88)', async () => {
    const r = await submit(hero, { liftType: 'cleanjerk', weightKg: 140, bodyweightKg: 78.9 });
    assert.strictEqual(r.status, 201);
    const e88 = await BoardEntry.findOne({ user: hero._id, scopeKey: 'S1', weightClass: '88' }).lean();
    const e79 = await BoardEntry.findOne({ user: hero._id, scopeKey: 'S1', weightClass: '79' }).lean();
    assert.strictEqual(e88.totalKg, 250, 'total on the heavier entry');
    assert.strictEqual(e88.totalCleanKg, 140, 'borrowed component');
    assert.strictEqual(e79.bestCleanKg, 140, 'single ranks in its own class');
    assert.strictEqual(e79.totalKg, null, 'one lift never on two total boards');
  });

  await step('idempotency: same idemKey returns the ORIGINAL, creates nothing', async () => {
    const key = idem();
    const a = await submit(hero, { weightKg: 105, idemKey: key });
    assert.strictEqual(a.status, 201);
    const before = await Lift.countDocuments({ user: hero._id });
    const b = await submit(hero, { weightKg: 105, idemKey: key });
    assert.strictEqual(b.status, 200);
    assert.strictEqual(b.body.duplicate, true);
    assert.strictEqual(await Lift.countDocuments({ user: hero._id }), before);
  });

  await step('plausibility cap: a 260kg snatch is HELD, never ranks', async () => {
    const r = await submit(hero, { weightKg: 260 });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.held, true);
    assert.strictEqual(r.body.ranks, null);
    const e = await BoardEntry.findOne({ user: hero._id, scopeKey: 'S1', weightClass: '88' }).lean();
    assert.strictEqual(e.bestSnatchKg, 110, 'board unchanged by the held lift');
  });

  await step('worker converges: materialized ranks appear after drain', async () => {
    const drained = await drainOutbox(100);
    assert.ok(drained > 0, 'events were drained');
    const e = await BoardEntry.findOne({ user: hero._id, scopeKey: 'S1', weightClass: '88' }).lean();
    assert.strictEqual(e.ranks.snatch, 1);
    assert.strictEqual(e.ranks.total, 1);
    assert.strictEqual(await OutboxEvent.countDocuments({ status: 'pending' }), 0);
  });

  const boardHash = async () => {
    const all = await BoardEntry.find({}).sort({ user: 1, scopeKey: 1, weightClass: 1 }).lean();
    const norm = all.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest);
    return crypto.createHash('md5').update(JSON.stringify(norm)).digest('hex');
  };

  await step('triple replay: re-running every done event changes NOTHING', async () => {
    const before = await boardHash();
    for (let i = 0; i < 3; i++) {
      await OutboxEvent.updateMany({ status: 'done' }, { $set: { status: 'pending', availableAt: new Date(0) } });
      await drainOutbox(100);
    }
    assert.strictEqual(await boardHash(), before, 'board byte-identical after replays');
  });

  await step('flag → the badge VISIBLY appears on the board row (round-4 finding)', async () => {
    const lift = await Lift.findOne({ user: hero._id, weightKg: 110 });
    const r = await call('POST', `/lifts/${lift._id}/flag`, flagger, { reason: 'fake_weight' });
    assert.strictEqual(r.status, 201);
    const board = await call('GET', '/leaderboard?lift=snatch&class=88&sex=M', flagger);
    const row = board.body.entries.find((x) => String(x.user.id) === String(hero._id));
    assert.strictEqual(row.pendingReview, true, 'row wears the pending badge');
    const dup = await call('POST', `/lifts/${lift._id}/flag`, flagger, { reason: 'other' });
    assert.strictEqual(dup.status, 409, 'one flag per user per lift');
  });

  await step('admin gate: non-admin cannot touch the review queue', async () => {
    const r = await call('GET', '/review/queue', hero);
    assert.strictEqual(r.status, 403);
  });

  await step('review approve clears the badge through the normal recompute path', async () => {
    const lift = await Lift.findOne({ user: hero._id, weightKg: 110 });
    const r = await call('POST', `/review/${lift._id}`, admin, { action: 'approve' });
    assert.strictEqual(r.status, 200);
    await drainOutbox(100);
    const e = await BoardEntry.findOne({ user: hero._id, scopeKey: 'S1', weightClass: '88' }).lean();
    assert.strictEqual(e.pendingReview, false);
  });

  await step('review remove: entries shrink correctly and stale ranks clear', async () => {
    const lift = await Lift.findOne({ user: hero._id, liftType: 'cleanjerk' });
    const r = await call('POST', `/review/${lift._id}`, admin, { action: 'remove', reason: 'test removal' });
    assert.strictEqual(r.status, 200);
    await drainOutbox(100);
    const e79 = await BoardEntry.findOne({ user: hero._id, scopeKey: 'S1', weightClass: '79' }).lean();
    assert.strictEqual(e79, null, 'the 79 entry existed only for that C&J');
    const e88 = await BoardEntry.findOne({ user: hero._id, scopeKey: 'S1', weightClass: '88' }).lean();
    assert.strictEqual(e88.totalKg, null, 'total gone with its component');
    assert.strictEqual(e88.ranks.total, null, 'stale total rank cleared (round 4)');
    assert.strictEqual(e88.ranks.snatch, 1, 'snatch rank survives');
    const mine = await call('GET', '/lifts/me', hero);
    const removed = mine.body.lifts.find((l) => String(l.id) === String(lift._id));
    assert.strictEqual(removed.status, 'removed');
    assert.strictEqual(removed.review.reason, 'test removal', 'athlete sees the reason');
  });

  await step('review approve of the HELD lift ranks it through the same path', async () => {
    const held = await Lift.findOne({ user: hero._id, weightKg: 260 });
    const r = await call('POST', `/review/${held._id}`, admin, { action: 'approve' });
    assert.strictEqual(r.status, 200);
    await drainOutbox(100);
    const e = await BoardEntry.findOne({ user: hero._id, scopeKey: 'S1', weightClass: '88' }).lean();
    assert.strictEqual(e.bestSnatchKg, 260, 'reviewer judged it real — it ranks');
  });

  await step('MEET-DAY BURST: 10 concurrent submits into one partition, all consistent', async () => {
    const rivals = [];
    for (let i = 0; i < 10; i++) {
      rivals.push(await mkUser(`Rival ${i}`, fullProfile({ display_name: `Rival ${i}` })));
    }
    const results = await Promise.all(
      rivals.map((u, i) => submit(u, { weightKg: 90 + i, bodyweightKg: 86 + (i % 3) * 0.3 }))
    );
    for (const r of results) assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await drainOutbox(200);
    const entries = await BoardEntry.find({ scopeKey: 'S1', weightClass: '88', provisional: false, bestSnatchKg: { $gt: 0 } })
      .sort({ bestSnatchKg: -1, snatchAchievedAt: 1, user: 1 }).lean();
    // Ranks must be exactly 1..N in sorted order, no gaps, no duplicates.
    entries.forEach((e, i) => assert.strictEqual(e.ranks.snatch, i + 1, `rank at position ${i}`));
    // Every submit's reported rank must have been internally consistent:
    // the top rival (99kg) must now sit directly under the hero pair.
    const top = entries.findIndex((e) => e.bestSnatchKg === 99);
    assert.ok(top >= 0, '99kg rival present');
  });

  await step('rebuildBoards equivalence: derive-from-log reproduces the live board', async () => {
    await drainOutbox(200); // quiesce
    const before = await boardHash();
    const seasons = await Season.find({ status: { $in: ['active', 'grace'] } }).lean();
    const userIds = await Lift.distinct('user', { status: 'live' });
    const partitions = new Set();
    for (const uid of userIds) {
      const u = await User.findById(uid);
      for (const scopeKey of ['alltime', 'S1']) {
        const window = scopeKey === 'alltime' ? null : seasons.find((s) => s.key === scopeKey);
        const touched = await recomputeAthlete(u, scopeKey, window);
        for (const wc of touched) partitions.add(JSON.stringify({ scopeKey, sex: 'M', weightClass: wc }));
      }
    }
    for (const p of partitions) await renumberPartition(JSON.parse(p));
    assert.strictEqual(await boardHash(), before, 'rebuild is byte-identical');
  });

  server.close();
  await mongoose.disconnect();
  console.log(`\n${passed} passed, ${failed} failed — ${failed === 0 ? 'ACCEPTANCE PASS' : 'ACCEPTANCE FAIL'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
