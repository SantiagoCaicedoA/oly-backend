/**
 * Skewed leaderboard seed — 50k athletes distributed the way reality is,
 * NOT uniformly (design doc §11 / review round 2):
 *
 *   ~70% of athletes concentrated in three (sex, class) partitions
 *   ~90% from one country (COL), the rest spread thin
 *   a small share of provisional entries, a share of split-class athletes
 *
 * Seeds BoardEntry (+ a Season, + sample Lifts for athlete-card testing).
 * This is exactly the data the k6/bench acceptance gates run against —
 * including the worst-case tuple: rare country in a dominant class.
 *
 * Usage:  MONGODB_URI=... node scripts/seedLeaderboard.js [--users 50000]
 * Safe:   writes ONLY to Season/Lift/BoardEntry; refuses to run unless the
 *         target collections are empty or --force is passed.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Season = require('../models/Season');
const Lift = require('../models/Lift');
const BoardEntry = require('../models/BoardEntry');
const { classForBodyweight, classLabels, CURRENT_CLASS_SET, isHeavierOrEqualClass } = require('../utils/leaderboard/classTable');
const { sinclairScore, CURRENT_SINCLAIR_SET } = require('../utils/leaderboard/sinclair');

const N_USERS = (() => {
  const i = process.argv.indexOf('--users');
  return i > -1 ? parseInt(process.argv[i + 1], 10) : 50000;
})();
const FORCE = process.argv.includes('--force');

// Deterministic PRNG so two seed runs produce comparable boards.
let seedState = 42;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const COUNTRIES = ['COL', 'PER', 'ECU', 'VEN', 'BRA', 'MEX', 'USA', 'ESP', 'JPN', 'GEO'];
const FIRST = ['Andrés', 'Camilo', 'Jhon', 'Mateo', 'Luis', 'Kevin', 'Óscar', 'Julián', 'David', 'Sebastián', 'Valentina', 'Mariana', 'Sofía', 'Isabella', 'Laura', 'Daniela'];
const LAST = ['Rojas', 'Herrera', 'Valencia', 'Quintero', 'Cárdenas', 'Palacios', 'Mena', 'Torres', 'Muñoz', 'Ríos', 'Guzmán', 'Cruz', 'López', 'Restrepo', 'Vargas', 'Ortiz'];
const CLUBS = ['Halterofilia Bogotá', 'Valle Oro', 'Cali Lifting', 'Bogotá Barbell', 'Medellín WL', 'Chocó Power', 'Club Antioquia', 'Santander Strong', 'Eje Cafetero WL'];

// The three dominant partitions holding ~70% of athletes (reality: a few
// classes are crowded, the rest thin).
const HOT_PARTITIONS = [
  { sex: 'M', class: '79' },
  { sex: 'M', class: '88' },
  { sex: 'F', class: '63' },
];

function pickPartition() {
  if (rand() < 0.7) return pick(HOT_PARTITIONS);
  const sex = rand() < 0.65 ? 'M' : 'F';
  return { sex, class: pick(classLabels(sex)) };
}

function pickCountry() {
  return rand() < 0.9 ? 'COL' : pick(COUNTRIES.slice(1));
}

function bwForClass(sex, label) {
  const labels = classLabels(sex);
  const idx = labels.indexOf(label);
  const upper = label.startsWith('+') ? parseInt(label.slice(1), 10) + 15 : parseInt(label, 10);
  const lowerLabel = idx > 0 ? labels[idx - 1] : null;
  const lower = lowerLabel && !lowerLabel.startsWith('+') ? parseInt(lowerLabel, 10) : upper - 8;
  return Math.round((lower + 0.1 + rand() * (upper - lower - 0.2)) * 10) / 10;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri);

  const existing = await BoardEntry.estimatedDocumentCount();
  if (existing > 0 && !FORCE) {
    throw new Error(`BoardEntry has ${existing} docs — pass --force to wipe and reseed`);
  }
  await Promise.all([Season.deleteMany({}), Lift.deleteMany({}), BoardEntry.deleteMany({})]);

  // Season 1: started 6 weeks ago, ends in ~7 weeks, snapshot +7d.
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  const season = await Season.create({
    key: 'S1',
    label: 'Season 1',
    startsAt: new Date(now - 42 * DAY),
    endsAt: new Date(now + 49 * DAY),
    snapshotAt: new Date(now + 56 * DAY),
    status: 'active',
  });

  const entries = [];
  const lifts = [];
  const year = new Date().getUTCFullYear();

  for (let i = 0; i < N_USERS; i++) {
    const userId = new mongoose.Types.ObjectId();
    const part = pickPartition();
    const sex = part.sex;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const country = pickCountry();
    const club = pick(CLUBS);
    // Age skew: mostly 18-32, tails into junior and masters territory.
    const age = 15 + Math.floor(rand() * (rand() < 0.85 ? 18 : 40));
    const birthYear = year - age;
    const provisional = rand() < 0.05; // onboarding 1RMs, no video yet
    const splitClass = !provisional && rand() < 0.12; // boundary athletes

    // Base strength scaled loosely by class and sex.
    const classNum = parseInt(part.class.replace('+', ''), 10);
    const base = (sex === 'M' ? 0.95 : 0.78) * classNum;
    const sn = Math.round(base * (0.85 + rand() * 0.55));
    const cj = Math.round(sn * (1.18 + rand() * 0.14));
    const bwA = bwForClass(sex, part.class);
    const snDate = new Date(now - Math.floor(rand() * 40) * DAY);
    const cjDate = new Date(now - Math.floor(rand() * 40) * DAY);
    const totalDate = snDate > cjDate ? snDate : cjDate;

    const denorm = {
      name,
      avatarUrl: null,
      club,
      countryCode: country,
      sex,
      birthYear,
      classSetVersion: CURRENT_CLASS_SET,
    };

    const mkLift = (liftType, weightKg, bodyweightKg, liftDate) => {
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        liftType,
        weightKg,
        bodyweightKg,
        liftDate,
        videoUrl: `https://example-bucket.s3.amazonaws.com/lifts/${userId}-${liftType}.mp4`,
        status: 'live',
        pendingReview: false,
        flagCount: 0,
        idemKey: `${userId}-${liftType}-seed`,
      };
      lifts.push(doc);
      return doc;
    };

    if (provisional) {
      // Private would-be entry: excluded from public boards by the partial
      // indexes; served only via /leaderboard/me.
      entries.push({
        user: userId,
        scopeKey: 'S1',
        weightClass: classForBodyweight(bwA, sex),
        provisional: true,
        bestSnatchKg: sn,
        bestCleanKg: cj,
        totalSnatchKg: sn,
        totalCleanKg: cj,
        totalKg: sn + cj,
        totalBwKg: bwA,
        sinclair: sinclairScore(sn + cj, bwA, sex),
        sinclairSetVersion: CURRENT_SINCLAIR_SET,
        snatchAchievedAt: snDate,
        cleanAchievedAt: cjDate,
        totalAchievedAt: totalDate,
        snatchBwKg: bwA,
        cleanBwKg: bwA,
        ...denorm,
      });
      continue;
    }

    if (!splitClass) {
      // Common case: both lifts in one class. One entry holds everything.
      const cls = classForBodyweight(bwA, sex);
      const snatchLift = mkLift('snatch', sn, bwA, snDate);
      const cleanLift = mkLift('cleanjerk', cj, bwA, cjDate);
      entries.push({
        user: userId,
        scopeKey: 'S1',
        weightClass: cls,
        provisional: false,
        bestSnatchKg: sn,
        snatchLift: snatchLift._id,
        snatchBwKg: bwA,
        bestCleanKg: cj,
        cleanLift: cleanLift._id,
        cleanBwKg: bwA,
        totalSnatchKg: sn,
        totalSnatchLift: snatchLift._id,
        totalCleanKg: cj,
        totalCleanLift: cleanLift._id,
        totalKg: sn + cj,
        totalBwKg: bwA,
        sinclair: sinclairScore(sn + cj, bwA, sex),
        sinclairSetVersion: CURRENT_SINCLAIR_SET,
        snatchAchievedAt: snDate,
        cleanAchievedAt: cjDate,
        totalAchievedAt: totalDate,
        ...denorm,
      });
    } else {
      // Boundary athlete (§4.5): snatch in a lighter class than the C&J.
      // Single lifts rank in their own class; total + Sinclair live in the
      // heavier entry with the snatch BORROWED into total* only.
      const labels = classLabels(sex);
      const cls = classForBodyweight(bwA, sex);
      const idx = labels.indexOf(cls);
      const heavier = labels[Math.min(idx + 1, labels.length - 1)];
      const bwB = bwForClass(sex, heavier);
      if (!isHeavierOrEqualClass(heavier, cls, sex) || heavier === cls) {
        i--; // degenerate at table edge; redraw
        continue;
      }
      const snatchLift = mkLift('snatch', sn, bwA, snDate);
      const cleanLift = mkLift('cleanjerk', cj, bwB, cjDate);
      const heavierBw = Math.max(bwA, bwB);
      // Lighter-class entry: the snatch ranks here; no total here.
      entries.push({
        user: userId,
        scopeKey: 'S1',
        weightClass: cls,
        provisional: false,
        bestSnatchKg: sn,
        snatchLift: snatchLift._id,
        snatchBwKg: bwA,
        snatchAchievedAt: snDate,
        ...denorm,
      });
      // Heavier-class entry: the C&J ranks here; the total lives here with
      // the borrowed snatch component; Sinclair on the heavier bodyweight.
      entries.push({
        user: userId,
        scopeKey: 'S1',
        weightClass: heavier,
        provisional: false,
        bestCleanKg: cj,
        cleanLift: cleanLift._id,
        cleanBwKg: bwB,
        cleanAchievedAt: cjDate,
        totalSnatchKg: sn,
        totalSnatchLift: snatchLift._id,
        totalCleanKg: cj,
        totalCleanLift: cleanLift._id,
        totalKg: sn + cj,
        totalBwKg: heavierBw,
        sinclair: sinclairScore(sn + cj, heavierBw, sex),
        sinclairSetVersion: CURRENT_SINCLAIR_SET,
        totalAchievedAt: totalDate,
        ...denorm,
      });
    }
  }

  console.log(`Inserting ${entries.length} board entries, ${lifts.length} lifts...`);
  const BATCH = 5000;
  for (let i = 0; i < entries.length; i += BATCH) {
    await BoardEntry.insertMany(entries.slice(i, i + BATCH), { ordered: false });
  }
  for (let i = 0; i < lifts.length; i += BATCH) {
    await Lift.insertMany(lifts.slice(i, i + BATCH), { ordered: false });
  }

  // Materialize canonical class-partition ranks the way the phase-2 worker
  // will: sorted recompute + $set per partition (idempotent by construction).
  console.log('Materializing canonical class ranks...');
  const partitions = await BoardEntry.aggregate([
    { $match: { provisional: false } },
    { $group: { _id: { scopeKey: '$scopeKey', sex: '$sex', weightClass: '$weightClass' } } },
  ]);
  const METRICS = [
    ['totalKg', 'totalAchievedAt', 'ranks.total'],
    ['bestSnatchKg', 'snatchAchievedAt', 'ranks.snatch'],
    ['bestCleanKg', 'cleanAchievedAt', 'ranks.clean'],
  ];
  for (const p of partitions) {
    for (const [field, tie, rankPath] of METRICS) {
      const rows = await BoardEntry.find({
        ...p._id,
        provisional: false,
        [field]: { $gt: 0 },
      })
        .sort({ [field]: -1, [tie]: 1, user: 1 })
        .select('_id')
        .lean();
      if (!rows.length) continue;
      const ops = rows.map((r, i) => ({
        updateOne: { filter: { _id: r._id }, update: { $set: { [rankPath]: i + 1 } } },
      }));
      await BoardEntry.bulkWrite(ops, { ordered: false });
    }
  }

  const summary = await BoardEntry.aggregate([
    { $group: { _id: { sex: '$sex', weightClass: '$weightClass' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 8 },
  ]);
  console.log('Season:', season.key, season.label);
  console.log('Top partitions:', JSON.stringify(summary));
  console.log('Done.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
