/**
 * rebuildBoards — the recomputation escape hatch (design doc §8).
 *
 * BoardEntry is derived data: this script regenerates every entry and every
 * materialized rank from the Lift log. A corrupted read model is never lost
 * data, and the materialization stays safe to evolve.
 *
 * Uses the SAME code path as submission and moderation (recomputeAthlete +
 * renumberPartition), so "rebuild reproduces the live board" is a test of
 * the write path itself. Run against a QUIESCED system (outbox drained) —
 * a mid-drain worker produces spurious diffs (§11).
 *
 * Usage: MONGODB_URI=... node scripts/rebuildBoards.js [--scope S1|alltime]
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);

  const Lift = require('../models/Lift');
  const User = require('../models/User');
  const Season = require('../models/Season');
  const OutboxEvent = require('../models/OutboxEvent');
  const { recomputeAthlete } = require('../services/boardWrite');
  const { renumberPartition } = require('../services/renumber');

  const pending = await OutboxEvent.countDocuments({ status: 'pending' });
  if (pending > 0) {
    console.error(`Refusing to rebuild: ${pending} outbox events pending — quiesce the worker first (§11).`);
    process.exit(1);
  }

  const scopeArg = process.argv.includes('--scope')
    ? process.argv[process.argv.indexOf('--scope') + 1]
    : null;
  const seasons = await Season.find({ status: { $in: ['active', 'grace'] } }).lean();
  const scopes = scopeArg
    ? [scopeArg]
    : ['alltime', ...seasons.map((s) => s.key)];

  const userIds = await Lift.distinct('user', { status: 'live' });
  console.log(`Rebuilding ${scopes.join(', ')} for ${userIds.length} athletes with live lifts…`);

  const partitions = new Set();
  let done = 0;
  for (const userId of userIds) {
    const user = await User.findById(userId);
    if (!user) continue;
    for (const scopeKey of scopes) {
      const window = scopeKey === 'alltime' ? null : seasons.find((s) => s.key === scopeKey);
      if (scopeKey !== 'alltime' && !window) continue;
      try {
        const touched = await recomputeAthlete(user, scopeKey, window);
        const sex = user.profile && user.profile.sex === 'Female' ? 'F' : 'M';
        for (const wc of touched) partitions.add(JSON.stringify({ scopeKey, sex, weightClass: wc }));
      } catch (err) {
        console.warn(`skip user ${userId} (${err.message})`);
      }
    }
    if (++done % 100 === 0) console.log(`  ${done}/${userIds.length} athletes`);
  }

  console.log(`Renumbering ${partitions.size} partitions…`);
  for (const p of partitions) {
    await renumberPartition(JSON.parse(p));
  }

  console.log('Rebuild complete.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
