/**
 * renumber — the background worker that keeps materialized class-partition
 * ranks current (design doc §5).
 *
 * INVARIANTS (rev 3/4, checked in scripts/checksWritePath.js):
 *  - IDEMPOTENT BY CONSTRUCTION: never $inc — re-read the partition in
 *    sorted order and $set each entry's rank to its computed position,
 *    writing only entries whose rank changed. Replaying the same event any
 *    number of times produces the identical board (at-least-once safe).
 *  - SERIAL PER PARTITION: the interval loop drains events one at a time,
 *    so renumbers for the same partition never run concurrently — for
 *    free. Any future parallelization requires a partition lock FIRST.
 *  - Sinclair rank is NEVER materialized (its ~25k partition would amplify
 *    each submit into tens of thousands of writes); it is always served by
 *    the covered count. Only total/snatch/clean class ranks live here.
 */

const BoardEntry = require('../models/BoardEntry');
const OutboxEvent = require('../models/OutboxEvent');

const RANK_METRICS = [
  { field: 'totalKg', tie: 'totalAchievedAt', rankKey: 'ranks.total' },
  { field: 'bestSnatchKg', tie: 'snatchAchievedAt', rankKey: 'ranks.snatch' },
  { field: 'bestCleanKg', tie: 'cleanAchievedAt', rankKey: 'ranks.clean' },
];

/**
 * PURE: given a partition's entries already sorted for one metric, return
 * the minimal $set ops — [{ _id, rank }] for entries whose stored rank is
 * wrong. Entries without the metric get rank null.
 */
function rankOps(sortedEntries, metricField, currentRankOf) {
  const ops = [];
  let rank = 0;
  for (const e of sortedEntries) {
    const desired = e[metricField] > 0 ? ++rank : null;
    if (currentRankOf(e) !== desired) ops.push({ _id: e._id, rank: desired });
  }
  return ops;
}

/** Renumber one (scopeKey, sex, weightClass) partition for all three metrics. */
async function renumberPartition({ scopeKey, sex, weightClass }) {
  let writes = 0;
  for (const m of RANK_METRICS) {
    const entries = await BoardEntry.find({
      scopeKey,
      sex,
      weightClass,
      provisional: false,
      [m.field]: { $gt: 0 },
    })
      .sort({ [m.field]: -1, [m.tie]: 1, user: 1 })
      .select(`_id ${m.field} ranks`)
      .lean();

    const key = m.rankKey.split('.')[1];
    const ops = rankOps(entries, m.field, (e) => (e.ranks ? e.ranks[key] : null));
    if (ops.length) {
      await BoardEntry.bulkWrite(
        ops.map((op) => ({
          updateOne: { filter: { _id: op._id }, update: { $set: { [m.rankKey]: op.rank } } },
        })),
        { ordered: false }
      );
      writes += ops.length;
    }

    // Entries that LOST the metric (their lifts were removed) fall outside
    // the sorted fetch above and would keep a stale rank forever — wrong
    // data a later feature would trust (review round 4). Clear it.
    const cleared = await BoardEntry.updateMany(
      {
        scopeKey,
        sex,
        weightClass,
        provisional: false,
        $or: [{ [m.field]: null }, { [m.field]: { $lte: 0 } }],
        [m.rankKey]: { $ne: null },
      },
      { $set: { [m.rankKey]: null } }
    );
    writes += cleared.modifiedCount || 0;
  }
  return writes;
}

const MAX_ATTEMPTS = 5;
const REAP_AFTER_MS = 5 * 60 * 1000;

/** PURE: retry backoff in seconds — attempts² × 5s, capped at 5 minutes. */
function retryDelaySeconds(attempts) {
  return Math.min(attempts * attempts * 5, 300);
}

/**
 * Return crashed claims to the queue: a 'processing' event older than
 * REAP_AFTER_MS means its worker died mid-drain — idempotent renumbering
 * makes the re-run safe.
 */
async function reapStaleClaims() {
  const cutoff = new Date(Date.now() - REAP_AFTER_MS);
  const r = await OutboxEvent.updateMany(
    { status: 'processing', claimedAt: { $lt: cutoff } },
    { $set: { status: 'pending', claimedAt: null } }
  );
  if (r.modifiedCount) console.warn(`renumber: reaped ${r.modifiedCount} stale claim(s)`);
  return r.modifiedCount || 0;
}

/**
 * Drain available pending events, oldest first, serially.
 *
 * The claim is ATOMIC (status → processing): safe with multiple workers in
 * phase 3, not just under today's serial loop. Failures reschedule with
 * quadratic backoff so retries land on later ticks instead of burning all
 * attempts inside one; only MAX_ATTEMPTS genuine failures mark an event
 * failed (visible for ops).
 */
async function drainOutbox(max = 20) {
  await reapStaleClaims();
  let drained = 0;
  for (let i = 0; i < max; i++) {
    const event = await OutboxEvent.findOneAndUpdate(
      { status: 'pending', availableAt: { $lte: new Date() } },
      { $set: { status: 'processing', claimedAt: new Date() }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, new: true }
    );
    if (!event) break;
    try {
      for (const p of event.partitions) {
        await renumberPartition(p);
      }
      event.status = 'done';
      event.processedAt = new Date();
      event.claimedAt = null;
      event.lastError = null;
      await event.save();
      drained++;
    } catch (err) {
      console.error('renumber: event failed', event._id, `attempt ${event.attempts}:`, err.message);
      event.lastError = err.message;
      event.claimedAt = null;
      if (event.attempts >= MAX_ATTEMPTS) {
        event.status = 'failed';
      } else {
        event.status = 'pending';
        event.availableAt = new Date(Date.now() + retryDelaySeconds(event.attempts) * 1000);
      }
      await event.save();
    }
  }
  return drained;
}

/**
 * Phase-2 worker: an in-process interval loop (single API instance — the
 * boardCache guard enforces that deployment shape). Phase 3 moves this to
 * its own process; the drain/renumber functions move unchanged.
 */
let timer = null;
function startRenumberWorker(intervalMs = 3000) {
  if (timer) return timer;
  let running = false; // serial: never two drains at once
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await drainOutbox();
    } catch (err) {
      console.error('renumber worker tick failed:', err.message);
    } finally {
      running = false;
    }
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

function stopRenumberWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  RANK_METRICS,
  rankOps,
  retryDelaySeconds,
  reapStaleClaims,
  renumberPartition,
  drainOutbox,
  startRenumberWorker,
  stopRenumberWorker,
};
