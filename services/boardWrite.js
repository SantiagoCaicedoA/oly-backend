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
    name: p.display_name || user.name,
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
 * Recompute ONE athlete's entries in ONE scope from their live lifts —
 * the shared idempotent core (submit, restore, remove, anonymize, rebuild).
 *
 * Also clears provisional entries once verified lifts exist in the scope
 * (rev 3: the first verified lift clears EVERY provisional entry the
 * athlete has in that scope).
 *
 * @returns {Array<string>} the weight classes whose partitions changed
 *   (for the renumber worker).
 */
async function recomputeAthlete(user, scopeKey, seasonWindow, session = null) {
  const identity = buildIdentity(user);
  const liftFilter = { user: user._id, status: 'live' };
  if (seasonWindow) {
    liftFilter.liftDate = { $gte: seasonWindow.startsAt, $lte: seasonWindow.endsAt };
  }
  const opts = session ? { session } : {};
  const lifts = await Lift.find(liftFilter).lean().session(session || null);

  const desired = computeEntriesFromLifts(lifts, identity);
  const existing = await BoardEntry.find({ user: user._id, scopeKey }).lean().session(session || null);

  const touched = new Set();
  const desiredByClass = new Map(desired.map((e) => [e.weightClass, e]));

  // Upsert every desired entry.
  for (const e of desired) {
    await BoardEntry.findOneAndUpdate(
      { user: user._id, scopeKey, weightClass: e.weightClass },
      { $set: e },
      { upsert: true, ...opts }
    );
    touched.add(e.weightClass);
  }
  // Delete entries that should no longer exist: provisional ghosts once any
  // verified lift exists (rev 3), and real entries whose lifts were removed.
  for (const old of existing) {
    const stillWanted = desiredByClass.has(old.weightClass);
    const provisionalGhost = old.provisional && lifts.length > 0;
    if ((!stillWanted && !old.provisional) || provisionalGhost) {
      await BoardEntry.deleteOne({ _id: old._id }, opts);
      touched.add(old.weightClass);
    }
  }
  return [...touched];
}

module.exports = {
  buildIdentity,
  computeEntriesFromLifts,
  scopeKeysForLiftDate,
  recomputeAthlete,
};
