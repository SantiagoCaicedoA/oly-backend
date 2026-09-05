/**
 * One-time production setup for the leaderboard (run from your Mac):
 *
 *   1. Creates Season 1 (idempotent — safe to run twice)
 *   2. Sets the leaderboard identity fields on YOUR user profile
 *      (countryCode, birth_year, sex if missing)
 *
 * SAFE BY DEFAULT: without APPLY=1 it only PRINTS what it would change.
 *
 *   export MONGODB_URI='<your production connection string>'
 *   node scripts/setupProdLeaderboard.js            # dry run — look first
 *   APPLY=1 node scripts/setupProdLeaderboard.js    # actually write
 */
const mongoose = require('mongoose');

const EMAIL = 'santiagocaicedo.a@gmail.com';
const IDENTITY = { countryCode: 'COL', birth_year: 2000 }; // club: none (Independent)

// Season 1 — 4-month window (design doc §4.3), UTC.
const SEASON = {
  key: 'S1',
  label: 'Season 1',
  startsAt: new Date('2026-09-01T00:00:00Z'),
  endsAt: new Date('2027-01-01T00:00:00Z'),
  snapshotAt: new Date('2027-01-08T00:00:00Z'), // endsAt + 7d grace
  status: 'active',
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGODB_URI first.');
  const apply = process.env.APPLY === '1';

  await mongoose.connect(uri);
  const dbName = mongoose.connection.name;
  console.log(`Connected to database: ${dbName}`);
  console.log(apply ? 'MODE: APPLY (writing)' : 'MODE: DRY RUN (printing only)\n');

  const Season = require('../models/Season');
  const User = require('../models/User');

  // ---- 1. Season ----------------------------------------------------------
  const existing = await Season.findOne({ key: SEASON.key }).lean();
  if (existing) {
    console.log(`Season ${SEASON.key} already exists (${existing.label}, status ${existing.status}) — leaving it alone.`);
  } else {
    console.log(`Season ${SEASON.key} does not exist. Would create:`);
    console.log(`  ${SEASON.label}: ${SEASON.startsAt.toISOString()} -> ${SEASON.endsAt.toISOString()} (snapshot ${SEASON.snapshotAt.toISOString()})`);
    if (apply) {
      await Season.create(SEASON);
      console.log('  CREATED.');
    }
  }

  // ---- 2. Your profile identity -------------------------------------------
  const user = await User.findOne({ email: EMAIL }).select('name email profile.countryCode profile.birth_year profile.sex profile.club profile.age').lean();
  if (!user) throw new Error(`No user found with email ${EMAIL} in ${dbName}`);
  const p = user.profile || {};
  console.log(`\nUser: ${user.name} <${user.email}>`);
  console.log(`  current: countryCode=${p.countryCode ?? '(missing)'} birth_year=${p.birth_year ?? '(missing)'} sex=${p.sex ?? '(missing)'} club=${p.club ?? '(none)'}`);

  const set = {};
  if (p.countryCode !== IDENTITY.countryCode) set['profile.countryCode'] = IDENTITY.countryCode;
  if (p.birth_year !== IDENTITY.birth_year) set['profile.birth_year'] = IDENTITY.birth_year;
  if (!p.sex) set['profile.sex'] = 'Male';

  if (Object.keys(set).length === 0) {
    console.log('  identity already complete — nothing to change.');
  } else {
    console.log(`  would set: ${JSON.stringify(set)}`);
    if (apply) {
      await User.updateOne({ _id: user._id }, { $set: set });
      console.log('  UPDATED.');
    }
  }

  if (!apply) console.log('\nDry run only. Re-run with APPLY=1 to write.');
  await mongoose.disconnect();
  console.log('\nDONE.');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
