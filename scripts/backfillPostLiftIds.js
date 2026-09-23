/**
 * Give existing posts a canonical lift_id, resolved from their lift_name.
 *
 * Matching ignores case and punctuation, so "Clean & Jerk", "clean and jerk"
 * and "CLEANJERK" all land on clean_jerk. Anything the catalogue does not
 * recognise is left NULL rather than guessed: a gap shows up in a badge rule
 * as no data, a wrong guess shows up as a wrong record, and only one of those
 * is noticeable.
 *
 * Idempotent. Re-running only touches posts that still have no lift_id.
 *
 * Dry run:  node scripts/backfillPostLiftIds.js
 * Apply:    node scripts/backfillPostLiftIds.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { resolveLiftId } = require('../utils/liftCatalog');

const APPLY = process.argv.includes('--apply');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  // autoIndex off. With it on, the first query triggers createIndexes, so a
  // command whose banner says DRY RUN would start building two indexes on the
  // production posts collection before printing a line. Build those
  // deliberately, once, not as a side effect of looking.
  await mongoose.connect(uri, { autoIndex: false });
  const Post = require('../models/Post');

  console.log(`=== ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'} ===\n`);

  const total = await Post.estimatedDocumentCount();
  // `{ lift_id: null }` matches documents where the field is ABSENT too,
  // which is every post written before this shipped.
  const query = { lift_id: null };
  const pending = await Post.countDocuments(query);
  console.log(`  ${total} post(s) total, ${pending} without a lift_id\n`);

  const byId = new Map();
  const unmatched = new Map();
  // Distinct unresolved names are unbounded free text, and the list is
  // printed to stdout, which on ECS means CloudWatch. Count past the cap
  // without keeping the strings.
  const UNMATCHED_SAMPLE = 200;
  let unmatchedOverflow = 0;

  // A cursor, not find().lean() into an array. The first run matches the
  // whole collection, and loading millions of documents into one array is how
  // a maintenance script takes the task down with it.
  for await (const p of Post.find(query).select('_id lift_name').lean().cursor()) {
    const id = resolveLiftId(p.lift_name);
    if (id) {
      byId.set(id, (byId.get(id) || 0) + 1);
    } else {
      const key = p.lift_name || '(empty)';
      if (unmatched.has(key)) unmatched.set(key, unmatched.get(key) + 1);
      else if (unmatched.size < UNMATCHED_SAMPLE) unmatched.set(key, 1);
      else unmatchedOverflow += 1;
    }
  }

  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  if (byId.size) {
    console.log('  Would set:');
    for (const [id, n] of sorted(byId)) console.log(`    ${String(n).padStart(5)}  ${id}`);
  }
  if (unmatched.size) {
    console.log('\n  Left null (no match in the catalogue):');
    for (const [name, n] of sorted(unmatched)) console.log(`    ${String(n).padStart(5)}  ${name}`);
    if (unmatchedOverflow) console.log(`    ${String(unmatchedOverflow).padStart(5)}  (further distinct names, not listed)`);
    console.log('\n  Check that list before applying. A name that SHOULD map and');
    console.log('  does not means the catalogue needs another alias, not a guess here.');
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply.');
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  const ops = [];
  // Streamed for the same reason as the count pass. Safe to re-run after a
  // partial failure: the filter IS the "not done yet" predicate.
  for await (const p of Post.find(query).select('_id lift_name').lean().cursor()) {
    const id = resolveLiftId(p.lift_name);
    if (!id) continue;
    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { lift_id: id } } } });
    if (ops.length === 500) {
      const r = await Post.bulkWrite(ops);
      written += r.modifiedCount;
      ops.length = 0;
    }
  }
  if (ops.length) {
    const r = await Post.bulkWrite(ops);
    written += r.modifiedCount;
  }

  console.log(`\n  updated ${written}`);
  const left = await Post.countDocuments({ lift_id: null });
  console.log(`  ${left} post(s) still without a lift_id (expected: the unmatched names above)`);

  console.log('\nDone.');
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('backfill failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
