/**
 * Phase-1 evidence run (design doc §10 acceptance + reviewer's checkpoint):
 *
 *   1. explain() for every board shape — asserting the WINNING INDEX BY
 *      NAME (not just absence of COLLSCAN; the Sinclair partial index is
 *      silently skipped if its $gt predicate is dropped), and that rank
 *      counts run index-only (no FETCH stage).
 *   2. Latency under load — 50 RPS sustained per scenario against the
 *      skewed seed, including the worst-case tuple: rare country in a
 *      dominant class + deep pagination + /me. Dependency-free load driver
 *      (no k6 needed for the evidence run; gate: p95 < 100 ms).
 *
 * Boots the API in-process on an ephemeral port WITHOUT the global rate
 * limiter (which would 429 a 50 RPS bench by design; the limiter is
 * benched separately in its own unit tests).
 *
 * Usage:
 *   MONGODB_URI=... JWT_SECRET=... node scripts/benchLeaderboard.js
 * Writes: bench-report.md + bench-report.json in the repo root.
 *
 * Run scripts/seedLeaderboard.js first.
 */

require('dotenv').config();
const fs = require('fs');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const DURATION_S = parseInt(process.env.BENCH_DURATION_S || '30', 10);
const TARGET_RPS = parseInt(process.env.BENCH_RPS || '50', 10);
const P95_GATE_MS = 100;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  await mongoose.connect(process.env.MONGODB_URI);

  const User = require('../models/User');
  const BoardEntry = require('../models/BoardEntry');
  const routes = require('../routes');

  // Ensure indexes exist and are named as designed before explaining.
  await BoardEntry.syncIndexes();

  // Bench identity: a real user (auth middleware does User.findById).
  const benchUser = await User.findOneAndUpdate(
    { email: 'bench@oly.local' },
    {
      $setOnInsert: {
        email: 'bench@oly.local',
        password: 'bench-password-not-used-1!',
        name: 'Bench User',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const token = jwt.sign({ id: benchUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // Give the bench user a board entry so /me exercises the count path.
  const sample = await BoardEntry.findOne({ provisional: false, weightClass: '79', sex: 'M' }).lean();
  if (sample) {
    await BoardEntry.findOneAndUpdate(
      { user: benchUser._id, scopeKey: sample.scopeKey, weightClass: sample.weightClass },
      {
        $set: {
          ...['bestSnatchKg','snatchBwKg','bestCleanKg','cleanBwKg','totalSnatchKg','totalCleanKg','totalKg','totalBwKg','sinclair','sinclairSetVersion','snatchAchievedAt','cleanAchievedAt','totalAchievedAt','classSetVersion','sex','countryCode','birthYear','club'].reduce(
            (acc, k) => ((acc[k] = sample[k]), acc), {}),
          name: 'Bench User',
          provisional: false,
        },
      },
      { upsert: true }
    );
  }

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api', routes); // no global limiter: benching the routes, not the throttle
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api`;
  const headers = { Authorization: `Bearer ${token}` };

  // -------------------------------------------------------------------------
  // Part 1 — explain() per board shape: winning index name + covered counts
  // -------------------------------------------------------------------------
  const { boardFilter } = require('../controllers/leaderboardController');
  const { betterThanBranches } = require('../utils/leaderboard/cursor');

  const shapes = [
    { name: 'total board (hot partition, COL)', lift: 'total', expectIndex: 'board_total',
      p: { lift: 'total', scopeKey: 'S1', sex: 'M', weightClass: '79', age: 'open', country: 'COL' } },
    { name: 'snatch board', lift: 'snatch', expectIndex: 'board_snatch',
      p: { lift: 'snatch', scopeKey: 'S1', sex: 'M', weightClass: '79', age: 'open', country: null } },
    { name: 'clean board', lift: 'cleanjerk', expectIndex: 'board_clean',
      p: { lift: 'cleanjerk', scopeKey: 'S1', sex: 'M', weightClass: '88', age: 'open', country: null } },
    { name: 'sinclair board (must select partial index)', lift: 'sinclair', expectIndex: 'board_sinclair',
      p: { lift: 'sinclair', scopeKey: 'S1', sex: 'M', weightClass: null, age: 'open', country: null } },
    { name: 'WORST CASE: rare country in dominant class', lift: 'total', expectIndex: 'board_total',
      p: { lift: 'total', scopeKey: 'S1', sex: 'M', weightClass: '79', age: 'open', country: 'JPN' } },
    { name: 'junior filter (birthYear range)', lift: 'total', expectIndex: 'board_total',
      p: { lift: 'total', scopeKey: 'S1', sex: 'M', weightClass: '79', age: 'junior', country: null } },
  ];

  const METRICS = {
    total: { field: 'totalKg', tie: 'totalAchievedAt' },
    snatch: { field: 'bestSnatchKg', tie: 'snatchAchievedAt' },
    cleanjerk: { field: 'bestCleanKg', tie: 'cleanAchievedAt' },
    sinclair: { field: 'sinclair', tie: 'totalAchievedAt' },
  };

  /**
   * Explain output arrives in different envelopes depending on the command:
   * a plain find explain has queryPlanner at the top; countDocuments runs as
   * an aggregate, whose explain nests everything under stages[0].$cursor;
   * sharded output nests per-shard. Normalize before reading.
   */
  function explainRoot(explained) {
    const doc = Array.isArray(explained) ? explained[0] : explained;
    if (!doc) return {};
    if (doc.queryPlanner || doc.executionStats) return doc;
    if (Array.isArray(doc.stages)) {
      const cur = doc.stages.find((st) => st && st.$cursor);
      if (cur) return cur.$cursor;
    }
    if (doc.shards) {
      const first = Object.values(doc.shards)[0];
      if (first) return explainRoot(first);
    }
    return doc;
  }
  function collectStages(stage, out = new Set()) {
    if (!stage) return out;
    if (stage.stage) out.add(stage.stage);
    if (stage.queryPlan) collectStages(stage.queryPlan, out); // SBE nesting
    if (stage.inputStage) collectStages(stage.inputStage, out);
    if (stage.inputStages) stage.inputStages.forEach((s) => collectStages(s, out));
    if (stage.innerStage) collectStages(stage.innerStage, out);
    if (stage.outerStage) collectStages(stage.outerStage, out);
    return out;
  }
  function findIndexNames(stage, out = new Set()) {
    if (!stage) return out;
    if (stage.indexName) out.add(stage.indexName);
    if (stage.queryPlan) findIndexNames(stage.queryPlan, out);
    if (stage.inputStage) findIndexNames(stage.inputStage, out);
    if (stage.inputStages) stage.inputStages.forEach((s) => findIndexNames(s, out));
    return out;
  }

  const explainResults = [];
  for (const s of shapes) {
    const m = METRICS[s.lift];
    const filter = boardFilter(s.p);
    // Board page plan
    const pagePlanRaw = await BoardEntry.find(filter)
      .sort({ [m.field]: -1, [m.tie]: 1, user: 1 })
      .limit(25)
      .explain('executionStats');
    const pagePlan = explainRoot(pagePlanRaw);
    const pageWinning = pagePlan.queryPlanner && pagePlan.queryPlanner.winningPlan;
    const pageStages = [...collectStages(pageWinning)];
    const pageIndexes = [...findIndexNames(pageWinning)];

    // Rank count plan (the covered-walk claim): count docs "better than" a
    // mid-board row under the same filters.
    const mid = await BoardEntry.findOne(filter).sort({ [m.field]: -1 }).skip(50).lean()
      || await BoardEntry.findOne(filter).lean();
    let countStages = [], countIndexes = [], countDocsExamined = null, keysExamined = null;
    if (mid) {
      // Explain each of the three parallel branch counts the API actually
      // runs (betterThanBranches) and sum: covered means the TOTAL docs
      // examined across all branches is zero.
      countDocsExamined = 0;
      keysExamined = 0;
      const stagesAll = new Set();
      const indexesAll = new Set();
      for (const branch of betterThanBranches(m.field, m.tie, mid[m.field], mid[m.tie], mid.user)) {
        const raw = await BoardEntry.collection
          .aggregate([{ $match: { ...filter, ...branch } }, { $count: 'n' }])
          .explain('executionStats');
        const plan = explainRoot(raw);
        const w = plan.queryPlanner && plan.queryPlanner.winningPlan;
        collectStages(w, stagesAll);
        findIndexNames(w, indexesAll);
        if (plan.executionStats) {
          countDocsExamined += plan.executionStats.totalDocsExamined;
          keysExamined += plan.executionStats.totalKeysExamined;
        }
      }
      countStages = [...stagesAll];
      countIndexes = [...indexesAll];
    }

    const pass =
      pageIndexes.includes(s.expectIndex) &&
      !pageStages.includes('COLLSCAN') &&
      !countStages.includes('COLLSCAN') &&
      (countDocsExamined === null || countDocsExamined === 0); // covered: zero docs fetched

    explainResults.push({
      shape: s.name,
      expectIndex: s.expectIndex,
      pageIndexes,
      pageStages,
      pageMs: pagePlan.executionStats
        ? pagePlan.executionStats.executionTimeMillis
        : null,
      countIndexes,
      countStages,
      countKeysExamined: keysExamined,
      countDocsExamined,
      pass,
    });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${s.name}  page=${pageIndexes} count docsExamined=${countDocsExamined}`);
  }

  // -------------------------------------------------------------------------
  // Part 2 — latency at target RPS (dependency-free driver)
  // -------------------------------------------------------------------------
  async function fire(path) {
    const t0 = process.hrtime.bigint();
    const res = await fetch(base + path, { headers });
    await res.arrayBuffer();
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, status: res.status };
  }

  async function scenario(name, path) {
    const latencies = [];
    let errors = 0;
    const started = Date.now();
    const interval = 1000 / TARGET_RPS;
    let n = 0;
    const inflight = new Set();
    while (Date.now() - started < DURATION_S * 1000) {
      const p = fire(path)
        .then((r) => {
          latencies.push(r.ms);
          if (r.status >= 400) errors++;
        })
        .catch(() => errors++)
        .finally(() => inflight.delete(p));
      inflight.add(p);
      n++;
      const nextAt = started + n * interval;
      const wait = nextAt - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    await Promise.all([...inflight]);
    latencies.sort((a, b) => a - b);
    const pct = (q) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
    const out = {
      name, path, requests: latencies.length, errors,
      rps: Math.round(latencies.length / DURATION_S),
      p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), p99: +pct(0.99).toFixed(1),
      pass: pct(0.95) < P95_GATE_MS && errors === 0,
    };
    console.log(`${out.pass ? 'PASS' : 'FAIL'}  ${name}  p50=${out.p50}ms p95=${out.p95}ms p99=${out.p99}ms err=${errors}`);
    return out;
  }

  // Deep page cursor for the worst case: page far into the hot partition.
  let deepCursor = null;
  {
    let cursor = null;
    for (let i = 0; i < 8; i++) {
      const r = await fetch(
        `${base}/leaderboard?lift=total&class=79&sex=M&limit=50${cursor ? `&cursor=${cursor}` : ''}`,
        { headers }
      ).then((x) => x.json());
      if (!r.nextCursor) break;
      cursor = r.nextCursor;
    }
    deepCursor = cursor;
  }

  const scenarios = [];
  scenarios.push(await scenario('default board (hot, COL)', '/leaderboard?lift=total&class=79&sex=M&country=COL'));
  scenarios.push(await scenario('sinclair board', '/leaderboard?lift=sinclair&sex=M'));
  scenarios.push(await scenario('WORST: rare country + deep page',
    `/leaderboard?lift=total&class=79&sex=M&country=JPN${deepCursor ? `&cursor=${deepCursor}` : ''}`));
  scenarios.push(await scenario('/me (hot board)', '/leaderboard/me?lift=total&class=79&sex=M'));
  scenarios.push(await scenario('/me (sinclair)', '/leaderboard/me?lift=sinclair&sex=M'));
  scenarios.push(await scenario('athlete card', sample ? `/athletes/${sample.user}/card?lift=total&class=${sample.weightClass}&sex=${sample.sex}` : '/seasons/current'));

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  const allPass = explainResults.every((r) => r.pass) && scenarios.every((s) => s.pass);
  const report = { generatedAt: new Date().toISOString(), targetRps: TARGET_RPS, durationS: DURATION_S, p95GateMs: P95_GATE_MS, explainResults, scenarios, allPass };
  fs.writeFileSync('bench-report.json', JSON.stringify(report, null, 2));

  const md = [
    '# Leaderboard Phase 1 — evidence run',
    '',
    `Generated ${report.generatedAt} · target ${TARGET_RPS} RPS × ${DURATION_S}s per scenario · gate p95 < ${P95_GATE_MS} ms`,
    '',
    '## explain() — winning index per board shape',
    '',
    '| Shape | Expected index | Winning (page) | Count keys/docs examined | Verdict |',
    '|---|---|---|---|---|',
    ...explainResults.map((r) =>
      `| ${r.shape} | \`${r.expectIndex}\` | \`${r.pageIndexes.join(', ')}\` | ${r.countKeysExamined} / ${r.countDocsExamined} | ${r.pass ? 'PASS' : '**FAIL**'} |`),
    '',
    'Covered-count criterion: `totalDocsExamined = 0` — the rank count never leaves the index.',
    '',
    '## Latency under load (skewed 50k seed)',
    '',
    '| Scenario | RPS | p50 | p95 | p99 | Errors | Verdict |',
    '|---|---|---|---|---|---|---|',
    ...scenarios.map((s) =>
      `| ${s.name} | ${s.rps} | ${s.p50} ms | ${s.p95} ms | ${s.p99} ms | ${s.errors} | ${s.pass ? 'PASS' : '**FAIL**'} |`),
    '',
    `## Overall: ${allPass ? '**ALL GATES PASS**' : '**FAILURES — see above**'}`,
    '',
  ].join('\n');
  fs.writeFileSync('bench-report.md', md);
  console.log(`\nReport written: bench-report.md / bench-report.json — overall ${allPass ? 'PASS' : 'FAIL'}`);

  server.close();
  await mongoose.disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
