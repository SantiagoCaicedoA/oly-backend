/**
 * boardWrite — the ONE code path that turns lifts into BoardEntries.
 *
 * Submission, moderation (restore/remove), account anonymization and the
 * rebuildBoards script all converge here: recomputeAthlete() derives a
 * user's entries in a scope FROM THEIR LIVE LIFTS, holistically. That
 * choice (recompute-from-log instead of incremental best-compare) is
 * deliberate: it is idempotent by construction, it makes removal exactly
 * as cheap as approval (design doc §5), and the §4.5 class-boundary rule
 * — the subtlest logic in the system — lives in ONE pure function,
 * computeEntriesFromLifts, which the DB-free checks exercise directly.
 *
 * Bounded by design: a recompute reads one athlete's lifts (dozens), never
 * a partition.
 */

const BoardEntry = require('../models/BoardEntry');
const Lift = require('../models/Lift');
const {
  classForBodyweight,
  isHeavierOrEqualClass,
  CURRENT_CLASS_SET,
} = require('../utils/leaderboard/classTable');
const { sinclairScore, CURRENT_SINCLAIR_SET } = require('../utils/leaderboard/sinclair');

/**
 * Identity snapshot denormalized onto entries (design doc §4.4 — identity
 * ONLY: never weightClass, never an age category). Throws AppError-shaped
 * {status, message} objects the controller converts to 422s: an athlete
 * cannot enter a sexed, country-filtered board without those facts.
 */
function buildIdentity(user) {
  const p = (user && user.profile) || {};
  const sex = p.sex === 'Male' ? 'M' : p.sex === 'Female' ? 'F' : null;
  if (!sex) {
    const err = new Error('Complete your profile first: sex (Male/Female) is required to enter the leaderboard');
    err.statusCode = 422;
    throw err;
  }
  const countryCode =
    typeof p.countryCode === 'string' && /^[A-Z]{3}$/.test(p.countryCode) ? p.countryCode : null;
  if (!countryCode) {
    const err = new Error('Complete your profile first: country is required to enter the leaderboard');
    err.statusCode = 422;
    throw err;
  }
  // birthYear preferred; legacy profiles carry age — derive a stable year
  // once (approximate by a year at worst, same as the IWF birth-year rule).
  const birthYear =
    typeof p.birth_year === 'number'
      ? p.birth_year
      : typeof p.age === 'number'
        ? new Date().getUTCFullYear() - p.age
        : null;
  return {
    // findOneAndUpdate does not run schema validators by default, so a
    // missing name would write through silently — always have one.
    name: p.display_name || user.name || 'Athlete',
    avatarUrl: p.profile_image_url || null,
    club: p.club || null,
    countryCode,
    sex,
    birthYear,
  };
}

/**
 * PURE §4.5 core: given an athlete's LIVE lifts for one scope and their
 * identity, produce the exact set of BoardEntry field-documents.
 *
 * Rules encoded (design doc §4.2/§4.5, rev 3–5):
 *  - each single lift ranks in the class of ITS OWN bodyweight (best* fields
 *    hold only lifts belonging to that entry's class);
 *  - the combined total (overall best snatch + overall best clean, sessions
 *    may differ — "best lifts", honestly labeled) ranks ONCE, in the
 *    HEAVIER of the two contributing classes (total* fields on that entry
 *    only), so one lift never appears on two class boards;
 *  - Sinclair uses the HEAVIER contributing bodyweight (ungameable) and
 *    lives on the same heavier-class entry;
 *  - per-metric tie dates: snatch/clean use their own liftDate; the total's
 *    date is when the total was COMPLETED (the later of the two);
 *  - best-lift compare: higher weight wins; equal weight keeps the EARLIER
 *    lift (the athlete who got there first holds the spot — and the entry's
 *    tie-break date never moves backward in fairness).
 *
 * CONTRACT (review round 4): pure over `lifts`, but NOT total — it throws
 * on an unknown (classSetVersion, sex) pair via classForBodyweight. Callers
 * must pre-validate identity.sex through buildIdentity(); every caller in
 * this codebase does.
 *
 * @param {Array} lifts   live lifts in scope: {liftType, weightKg, bodyweightKg, liftDate, _id, pendingReview}
 * @param {Object} identity  from buildIdentity()
 * @returns {Array} entry docs keyed by weightClass (no user/scopeKey — caller adds)
 */
function computeEntriesFromLifts(lifts, identity) {
  const { sex } = identity;
  const byClass = new Map(); // classLabel -> { snatch: lift|null, clean: lift|null }

  const better = (a, b) => {
    // b is the incumbent; a challenges: strictly heavier wins; equal weight
    // keeps the earlier lift.
    if (!b) return true;
    if (a.weightKg !== b.weightKg) return a.weightKg > b.weightKg;
    return new Date(a.liftDate) < new Date(b.liftDate);
  };

  let bestSnatchOverall = null;
  let bestCleanOverall = null;

  for (const lift of lifts) {
    const cls = classForBodyweight(lift.bodyweightKg, sex);
    if (!byClass.has(cls)) byClass.set(cls, { snatch: null, clean: null });
    const slot = byClass.get(cls);
    if (lift.liftType === 'snatch') {
      if (better(lift, slot.snatch)) slot.snatch = lift;
      if (better(lift, bestSnatchOverall)) bestSnatchOverall = lift;
    } else {
      if (better(lift, slot.clean)) slot.clean = lift;
      if (better(lift, bestCleanOverall)) bestCleanOverall = lift;
    }
  }

  // Where does the combined total live? Heavier of the two contributing
  // classes (only exists when BOTH lift types exist).
  let totalClass = null;
  if (bestSnatchOverall && bestCleanOverall) {
    const snCls = classForBodyweight(bestSnatchOverall.bodyweightKg, sex);
    const cjCls = classForBodyweight(bestCleanOverall.bodyweightKg, sex);
    totalClass = isHeavierOrEqualClass(snCls, cjCls, sex) ? snCls : cjCls;
    if (!byClass.has(totalClass)) byClass.set(totalClass, { snatch: null, clean: null });
  }

  const entries = [];
  for (const [weightClass, slot] of byClass) {
    const e = {
      weightClass,
      classSetVersion: CURRENT_CLASS_SET,
      bestSnatchKg: slot.snatch ? slot.snatch.weightKg : null,
      snatchLift: slot.snatch ? slot.snatch._id : null,
      snatchBwKg: slot.snatch ? slot.snatch.bodyweightKg : null,
      snatchAchievedAt: slot.snatch ? slot.snatch.liftDate : null,
      bestCleanKg: slot.clean ? slot.clean.weightKg : null,
      cleanLift: slot.clean ? slot.clean._id : null,
      cleanBwKg: slot.clean ? slot.clean.bodyweightKg : null,
      cleanAchievedAt: slot.clean ? slot.clean.liftDate : null,
      totalSnatchKg: null,
      totalSnatchLift: null,
      totalCleanKg: null,
      totalCleanLift: null,
      totalKg: null,
      totalBwKg: null,
      totalAchievedAt: null,
      sinclair: null,
      sinclairSetVersion: null,
      provisional: false,
      // The visible "pending verification" badge (§5): the entry wears it
      // while any contributing lift is pending review.
      pendingReview: false,
      ...identity,
    };
    if (weightClass === totalClass) {
      const sn = bestSnatchOverall;
      const cj = bestCleanOverall;
      e.totalSnatchKg = sn.weightKg;
      e.totalSnatchLift = sn._id;
      e.totalCleanKg = cj.weightKg;
      e.totalCleanLift = cj._id;
      e.totalKg = sn.weightKg + cj.weightKg;
      e.totalBwKg = Math.max(sn.bodyweightKg, cj.bodyweightKg); // heavier — ungameable
      e.totalAchievedAt = new Date(Math.max(new Date(sn.liftDate), new Date(cj.liftDate)));
      e.sinclair = sinclairScore(e.totalKg, e.totalBwKg, identity.sex);
      e.sinclairSetVersion = CURRENT_SINCLAIR_SET;
    }
    const contributing = [slot.snatch, slot.clean];
    if (weightClass === totalClass) contributing.push(bestSnatchOverall, bestCleanOverall);
    e.pendingReview = contributing.some((l) => l && l.pendingReview);
    entries.push(e);
  }
  return entries;
}

/**
 * Derive the scopeKeys a lift contributes to: alltime always; the season
 * whose window contains liftDate when one exists and is not closed.
 */
function scopeKeysForLiftDate(liftDate, seasons) {
  const keys = ['alltime'];
  const d = new Date(liftDate);
  for (const s of seasons) {
    if (s.status === 'closed') continue;
    if (d >= new Date(s.startsAt) && d <= new Date(s.endsAt)) keys.push(s.key);
  }
  return keys;
}

/**
 * PURE reconcile step (review round 4 — extracted after the blocker):
 * decide which of the EXISTING entries must be deleted, given the desired
 * set. The rule is "delete what recompute did not just write":
 *
 *  - a class in the desired set was just (re)written — NEVER delete it.
 *    (The blocker this fixes: the first verified lift converts the
 *    same-class provisional ghost in place via the upsert; the old code
 *    consulted the PRE-upsert snapshot's provisional flag and deleted the
 *    entry it had just written — on the product's modal onboarding path.)
 *  - a class NOT in the desired set is deleted when it's a stale real
 *    entry (its lifts were removed), or a provisional ghost that verified
 *    lifts have superseded (rev 3: first verified lift clears every ghost
 *    in scope);
 *  - a ghost is KEPT only while the athlete has no live lifts in scope.
 *
 * Pure so the DB-free checks can exercise it — the phase-2 review's core
 * lesson: the half of recompute that touches the database was the half
 * with no checks.
 */
function reconcileEntries(existing, desired, hasLiveLifts) {
  const desiredClasses = new Set(desired.map((e) => e.weightClass));
  const deletions = [];
  for (const old of existing) {
    if (desiredClasses.has(old.weightClass)) continue; // just written — keep
    if (!old.provisional || hasLiveLifts) deletions.push(old);
  }
  return deletions;
}

/**
 * Recompute ONE athlete's entries in ONE scope from their live lifts —
 * the shared idempotent core (submit, restore, remove, anonymize, rebuild).
 *
 * CONCURRENCY (review round 4 — why concurrent same-user submits are safe,
 * written down so nobody "optimizes" it away): two simultaneous transactions
 * both upsert the SAME entry documents (including the heavier-class total
 * entry in the cross-class case) → WriteConflict → withTransaction aborts
 * and retries one of them → the retry reads a fresh snapshot that now
 * includes the other's committed lift → correct. This self-healing depends
 * on both transactions touching the same document; narrowing the upserts to
 * "only changed fields/classes" would break it silently. The sequential
 * fallback (dev-only, env-gated) has NO such protection — which is why it
 * can never run in production.
 *
 * @param {Object} identityOverride  optional pre-built identity (review
 *   path uses entry-derived identity when a profile has gone incomplete —
 *   moderation must not 500 on a profile edit).
 * @returns {Array<string>} the weight classes whose partitions changed
 *   (for the renumber worker).
 */
async function recomputeAthlete(user, scopeKey, seasonWindow, session = null, identityOverride = null) {
  const identity = identityOverride || buildIdentity(user);
  const liftFilter = { user: user._id, status: 'live' };
  if (seasonWindow) {
    liftFilter.liftDate = { $gte: seasonWindow.startsAt, $lte: seasonWindow.endsAt };
  }
  const opts = session ? { session } : {};
  const lifts = await Lift.find(liftFilter).lean().session(session || null);

  const desired = computeEntriesFromLifts(lifts, identity);
  const existing = await BoardEntry.find({ user: user._id, scopeKey }).lean().session(session || null);

  const touched = new Set();

  // Upsert every desired entry.
  for (const e of desired) {
    await BoardEntry.findOneAndUpdate(
      { user: user._id, scopeKey, weightClass: e.weightClass },
      { $set: e },
      { upsert: true, ...opts }
    );
    touched.add(e.weightClass);
  }
  // Delete only what recompute did not just write (pure rule above).
  for (const old of reconcileEntries(existing, desired, lifts.length > 0)) {
    await BoardEntry.deleteOne({ _id: old._id }, opts);
    touched.add(old.weightClass);
  }
  return [...touched];
}

/**
 * Board-mutation transaction wrapper (review round 4): atomicity is decided
 * by OPERATOR INTENT, never by regex-matching an error message at runtime —
 * the first version fell back to non-atomic sequential writes whenever an
 * error mentioned replica sets, which an Atlas failover can do; a submit
 * failing partway through then left a Lift with no BoardEntry, no outbox
 * event, and no repair path short of rebuildBoards.
 *
 * Rule: transactions are REQUIRED. Only a standalone dev Mongo, with
 * ALLOW_NON_TRANSACTIONAL=1 set explicitly, may run the same writes
 * sequentially — and only when the error is actually the no-replica-set
 * class. Production can never silently take that branch.
 */
const mongoose = require('mongoose');
async function runBoardTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => fn(session));
  } catch (err) {
    const txnUnsupported = /replica set|Transaction numbers/i.test(err.message || '');
    if (txnUnsupported && process.env.ALLOW_NON_TRANSACTIONAL === '1') {
      console.warn('boardWrite: transactions unavailable — SEQUENTIAL fallback (dev only, ALLOW_NON_TRANSACTIONAL=1)');
      await fn(null);
    } else {
      throw err;
    }
  } finally {
    session.endSession();
  }
}

module.exports = {
  buildIdentity,
  computeEntriesFromLifts,
  reconcileEntries,
  scopeKeysForLiftDate,
  recomputeAthlete,
  runBoardTransaction,
};
