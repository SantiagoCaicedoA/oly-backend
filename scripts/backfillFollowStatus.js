/**
 * Set `status: 'accepted'` on follow edges written before private accounts
 * existed.
 *
 * Reads filter on `{ status: 'accepted' }` rather than `{ $ne: 'pending' }`,
 * because a privacy control should fail closed: a typo'd or future status
 * must not read as an approved follow. That choice only works once every
 * legacy row carries the field, which is what this does.
 *
 * Run BEFORE deploying any code that filters on status, or every existing
 * follow relationship disappears from counts, lists and the friends feed.
 *
 * Dry run:  node scripts/backfillFollowStatus.js
 * Apply:    node scripts/backfillFollowStatus.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const Follow = require('../models/Follow');

  console.log(`=== ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'} ===\n`);

  const missing = await Follow.countDocuments({ status: { $exists: false } });
  const accepted = await Follow.countDocuments({ status: 'accepted' });
  const pending = await Follow.countDocuments({ status: 'pending' });
  const total = await Follow.estimatedDocumentCount();

  console.log(`  ${total} follow edge(s) total`);
  console.log(`  ${missing} missing status  ->  would become 'accepted'`);
  console.log(`  ${accepted} already 'accepted'`);
  console.log(`  ${pending} 'pending' (left alone)\n`);

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply.');
    await mongoose.disconnect();
    return;
  }

  if (missing === 0) {
    console.log('Nothing to do.');
  } else {
    const res = await Follow.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'accepted' } }
    );
    console.log(`  updated ${res.modifiedCount}`);
    const left = await Follow.countDocuments({ status: { $exists: false } });
    if (left !== 0) throw new Error(`${left} edges still have no status`);
    console.log('  verified: 0 edges without a status');
  }

  console.log('\nDone.');
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('backfill failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
