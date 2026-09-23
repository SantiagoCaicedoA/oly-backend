/**
 * purgeSeedAccounts — remove the seeded demo athletes for good.
 *
 * These were created by seed-profile-data.js to exercise the board before
 * there were real users. They sit on the PUBLIC Men 94 board with videoUrls
 * pointing at oly-seed.s3.amazonaws.com, which does not exist, so the first
 * tester who opens Rank sees fake athletes with broken proof.
 *
 * This is a HARD delete, not anonymizeUser. Anonymizing is the right answer
 * for a real person, because other athletes earned results against them.
 * Nobody earned anything against a fixture, so leaving "Former athlete" rows
 * on the board would be worse than removing them.
 *
 * Order matters: rows go first, then the users, then the affected partitions
 * are renumbered so the ranks close the gaps the deletions leave behind.
 *
 * Usage:
 *   MONGODB_URI=... node scripts/purgeSeedAccounts.js            # dry run
 *   MONGODB_URI=... node scripts/purgeSeedAccounts.js --apply    # do it
 */

require('dotenv').config();
const mongoose = require('mongoose');

const SEED_EMAILS = [
  'seed.athlete@olytraining.com',
  'seed.buddy1@olytraining.com',
  'seed.buddy2@olytraining.com',
];

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const apply = process.argv.includes('--apply');

  await mongoose.connect(process.env.MONGODB_URI);

  const User = require('../models/User');
  const Lift = require('../models/Lift');
  const BoardEntry = require('../models/BoardEntry');
  const Follow = require('../models/Follow');
  const Post = require('../models/Post');
  const Like = require('../models/Like');
  const Comment = require('../models/Comment');
  const Video = require('../models/Video');
  const Flag = require('../models/Flag');
  const SetLog = require('../models/SetLog');
  const WeeklyTraining = require('../models/WeeklyTraining');
  const AthleteProfile = require('../models/AthleteProfile');
  const OutboxEvent = require('../models/OutboxEvent');
  const { renumberPartition } = require('../services/renumber');

  console.log(apply ? '=== APPLY ===' : '=== DRY RUN (pass --apply to delete) ===');

  const users = await User.find({ email: { $in: SEED_EMAILS } }).lean();
  if (users.length === 0) {
    console.log('No seed accounts found. Nothing to do.');
    return mongoose.disconnect();
  }
  const ids = users.map((u) => u._id);
  console.log(`\nFound ${users.length} seed account(s):`);
  users.forEach((u) => console.log(`  ${u.email}  (${u.name})  ${u._id}`));

  // Remember which partitions need their ranks closing up afterwards.
  const entries = await BoardEntry.find({ user: { $in: ids } })
    .select('scopeKey sex weightClass')
    .lean();
  const partitions = [
    ...new Map(
      entries.map((e) => [
        `${e.scopeKey}|${e.sex}|${e.weightClass}`,
        { scopeKey: e.scopeKey, sex: e.sex, weightClass: e.weightClass },
      ])
    ).values(),
  ];

  const postIds = (await Post.find({ user: { $in: ids } }).select('_id').lean()).map((p) => p._id);
  // Outbox events reference lifts. Drop the ones pointing at lifts we are
  // about to remove, or the worker drains them into nothing forever.
  const liftIds = (await Lift.find({ user: { $in: ids } }).select('_id').lean()).map((l) => l._id);

  const plan = [
    ['BoardEntry', BoardEntry, { user: { $in: ids } }],
    ['Lift', Lift, { user: { $in: ids } }],
    ['Flag', Flag, { user: { $in: ids } }],
    ['Like', Like, { $or: [{ user: { $in: ids } }, { post: { $in: postIds } }] }],
    ['Comment', Comment, { $or: [{ user: { $in: ids } }, { post: { $in: postIds } }] }],
    ['Post', Post, { user: { $in: ids } }],
    ['Video', Video, { user: { $in: ids } }],
    ['Follow', Follow, { $or: [{ follower: { $in: ids } }, { following: { $in: ids } }] }],
    ['SetLog', SetLog, { user: { $in: ids } }],
    ['WeeklyTraining', WeeklyTraining, { user: { $in: ids } }],
    ['AthleteProfile', AthleteProfile, { user: { $in: ids } }],
    ['OutboxEvent', OutboxEvent, { lift: { $in: liftIds } }],
  ];

  console.log('\nRows to remove:');
  for (const [label, Model, filter] of plan) {
    const n = await Model.countDocuments(filter);
    console.log(`  ${String(n).padStart(4)}  ${label}`);
    if (apply && n > 0) await Model.deleteMany(filter);
  }

  console.log(`\n  ${String(users.length).padStart(4)}  User`);
  if (apply) await User.deleteMany({ _id: { $in: ids } });

  console.log(`\nPartitions to renumber: ${partitions.length}`);
  partitions.forEach((p) => console.log(`  ${p.scopeKey} ${p.sex} ${p.weightClass}`));
  if (apply) {
    for (const p of partitions) {
      const { writes } = await renumberPartition(p);
      console.log(`  renumbered ${p.scopeKey} ${p.sex} ${p.weightClass} (${writes} writes)`);
    }
  }

  console.log(apply ? '\nDone.' : '\nDry run only. Re-run with --apply.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
