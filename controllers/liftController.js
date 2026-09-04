const mongoose = require('mongoose');
const Lift = require('../models/Lift');
const Flag = require('../models/Flag');
const Season = require('../models/Season');
const BoardEntry = require('../models/BoardEntry');
const OutboxEvent = require('../models/OutboxEvent');
const AuditLog = require('../models/AuditLog');
const { buildIdentity, recomputeAthlete, scopeKeysForLiftDate } = require('../services/boardWrite');
const { classForBodyweight } = require('../utils/leaderboard/classTable');
const { crossesPlausibilityCap } = require('../utils/leaderboard/caps');
const { betterThanBranches } = require('../utils/leaderboard/cursor');

/**
 * Lift write path (design doc §5, phase 2).
 *
 * POST /api/lifts — trust-by-default: a valid lift RANKS IMMEDIATELY (the
 * instant post → rank-moves loop the retention model depends on). The
 * request does the minimum: persist the lift, recompute the submitter's
 * OWN entries, enqueue one outbox event; the worker renumbers partitions.
 * The response can already say "you're now #8".
 *
 * The only pre-rank gate is the absolute plausibility cap (held for
 * review). Top-3 lifts on mature boards rank instantly WITH a visible
 * pending badge and jump the review queue — public reversal beats a
 * silent hold (§5 rev 3).
 */

const DAILY_SUBMISSION_CAP = 10;
const BACKDATE_DAYS = 30;
const TOP_N_BADGE = 3;
const MATURE_BOARD_MIN = 10;

const METRIC_FOR_TYPE = {
  snatch: { field: 'bestSnatchKg', tie: 'snatchAchievedAt' },
  cleanjerk: { field: 'bestCleanKg', tie: 'cleanAchievedAt' },
};

function bad(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/** Validate the submission body. Returns {error} or {value}. */
function parseSubmission(body) {
  const liftType = body.liftType === 'snatch' || body.liftType === 'cleanjerk' ? body.liftType : null;
  if (!liftType) return { error: 'liftType must be "snatch" or "cleanjerk"' };
  const weightKg = Number(body.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300)
    return { error: 'weightKg must be between 20 and 300' };
  const bodyweightKg = Number(body.bodyweightKg);
  if (!Number.isFinite(bodyweightKg) || bodyweightKg < 25 || bodyweightKg > 250)
    return { error: 'bodyweightKg must be between 25 and 250' };
  const liftDate = new Date(body.liftDate);
  if (Number.isNaN(liftDate.getTime())) return { error: 'liftDate must be a valid date' };
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  if (!/^https:\/\/[a-z0-9.-]+\.amazonaws\.com\/.+/.test(videoUrl))
    return { error: 'videoUrl must be an uploaded video (no video, no rank)' };
  const idemKey = typeof body.idemKey === 'string' && body.idemKey.length >= 8 && body.idemKey.length <= 128
    ? body.idemKey
    : null;
  if (!idemKey) return { error: 'idemKey (8–128 chars) is required — retries must be safe' };
  return { value: { liftType, weightKg, bodyweightKg, liftDate, videoUrl, idemKey } };
}

/**
 * Backdating window (§8): at most 30 days, never into the future, and
 * never earlier than the most recent CLOSED season's snapshotAt — frozen
 * seasons are unreachable regardless of the 30-day window.
 */
async function validateLiftDate(liftDate) {
  const now = new Date();
  if (liftDate > now) return 'liftDate cannot be in the future';
  const floor = new Date(now.getTime() - BACKDATE_DAYS * 24 * 3600 * 1000);
  if (liftDate < floor) return `liftDate can be backdated at most ${BACKDATE_DAYS} days`;
  const lastClosed = await Season.findOne({ status: 'closed' }).sort({ snapshotAt: -1 }).lean();
  if (lastClosed && liftDate < new Date(lastClosed.snapshotAt))
    return 'liftDate falls inside a closed season — those standings are frozen';
  return null;
}

/**
 * "Would this lift enter the top-3 of a mature class board?" — checked
 * against the board as it stands (fewer than TOP_N better values), on any
 * scope the lift lands in. Drives the pending badge + priority review.
 */
async function entersMatureTop(liftType, weightKg, sex, weightClass, scopeKeys) {
  const m = METRIC_FOR_TYPE[liftType];
  for (const scopeKey of scopeKeys) {
    const base = { scopeKey, sex, weightClass, provisional: false };
    const size = await BoardEntry.countDocuments({ ...base, [m.field]: { $gt: 0 } });
    if (size < MATURE_BOARD_MIN) continue;
    const betterCount = await BoardEntry.countDocuments({ ...base, [m.field]: { $gt: weightKg } });
    if (betterCount < TOP_N_BADGE) return true;
  }
  return false;
}

/** Covered rank count for the response (rank = better + 1). */
async function rankOnBoard(filterBase, m, value, tieDate, userId) {
  const branches = betterThanBranches(m.field, m.tie, value, tieDate, userId);
  const counts = await Promise.all(
    branches.map((b) => BoardEntry.countDocuments({ ...filterBase, [m.field]: { $gt: 0 }, ...b }))
  );
  return counts.reduce((a, b) => a + b, 0) + 1;
}

// ---------------------------------------------------------------------------
// POST /api/lifts
// ---------------------------------------------------------------------------
async function submitLift(req, res) {
  try {
    // Identity gate first: no sexed board membership, no submission.
    let identity;
    try {
      identity = buildIdentity(req.user);
    } catch (err) {
      return bad(res, err.statusCode || 422, err.message);
    }

    const parsed = parseSubmission(req.body || {});
    if (parsed.error) return bad(res, 400, parsed.error);
    const v = parsed.value;

    const dateError = await validateLiftDate(v.liftDate);
    if (dateError) return bad(res, 400, dateError);

    // Idempotency: a retry returns the ORIGINAL lift, no side effects.
    const existing = await Lift.findOne({ user: req.user._id, idemKey: v.idemKey }).lean();
    if (existing) {
      return res.status(200).json({ success: true, duplicate: true, lift: publicLift(existing) });
    }

    // Daily cap (anti-abuse §8) — athletes don't PR 10 times a day.
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const today = await Lift.countDocuments({ user: req.user._id, createdAt: { $gte: dayStart } });
    if (today >= DAILY_SUBMISSION_CAP)
      return bad(res, 429, `Daily submission limit reached (${DAILY_SUBMISSION_CAP}/day)`);

    const weightClass = classForBodyweight(v.bodyweightKg, identity.sex);
    const seasons = await Season.find({ status: { $in: ['active', 'grace'] } }).lean();
    const scopeKeys = scopeKeysForLiftDate(v.liftDate, seasons);

    // The ONLY pre-rank gate: absolute plausibility cap.
    const held = crossesPlausibilityCap(v.weightKg, v.liftType, identity.sex, weightClass);
    // Badge-not-hold (§5 rev 3): mature-board top-3 ranks instantly, wears
    // the pending marker, jumps the review queue.
    const pending = !held && (await entersMatureTop(v.liftType, v.weightKg, identity.sex, weightClass, scopeKeys));

    const liftDoc = {
      user: req.user._id,
      liftType: v.liftType,
      weightKg: v.weightKg,
      bodyweightKg: v.bodyweightKg,
      liftDate: v.liftDate,
      videoUrl: v.videoUrl,
      status: held ? 'held' : 'live',
      pendingReview: pending,
      idemKey: v.idemKey,
    };

    // Minimal transaction: lift + own entries + outbox + audit. Requires a
    // replica set (Atlas default); a standalone dev Mongo falls back to
    // sequential writes with a warning — same operations, no atomicity.
    let lift;
    const writeAll = async (session) => {
      const created = await Lift.create(session ? [{ ...liftDoc }] : { ...liftDoc }, session ? { session } : undefined);
      lift = Array.isArray(created) ? created[0] : created;
      if (!held) {
        const partitions = [];
        for (const scopeKey of scopeKeys) {
          const window = scopeKey === 'alltime' ? null : seasons.find((s) => s.key === scopeKey);
          const touched = await recomputeAthlete(req.user, scopeKey, window, session);
          for (const wc of touched) partitions.push({ scopeKey, sex: identity.sex, weightClass: wc });
        }
        await OutboxEvent.create(
          session ? [{ type: 'renumber', partitions, lift: lift._id }] : { type: 'renumber', partitions, lift: lift._id },
          session ? { session } : undefined
        );
      }
      await AuditLog.create(
        session
          ? [{ actor: req.user._id, action: 'lift.submit', subject: lift._id, meta: { held, pending, weightClass, scopeKeys } }]
          : { actor: req.user._id, action: 'lift.submit', subject: lift._id, meta: { held, pending, weightClass, scopeKeys } },
        session ? { session } : undefined
      );
    };

    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(() => writeAll(session));
      } finally {
        session.endSession();
      }
    } catch (err) {
      if (/replica set|Transaction numbers/i.test(err.message)) {
        console.warn('lifts: transactions unavailable (standalone Mongo?) — sequential fallback');
        await writeAll(null);
      } else if (err.code === 11000) {
        // Concurrent duplicate submit raced the earlier check.
        const dup = await Lift.findOne({ user: req.user._id, idemKey: v.idemKey }).lean();
        return res.status(200).json({ success: true, duplicate: true, lift: publicLift(dup) });
      } else {
        throw err;
      }
    }

    // The instant reward: rank on the class board for this lift's own
    // metric + the total board, live-counted (never the materialized rank —
    // the submit response must never disagree with a refresh, §5).
    let ranks = null;
    if (!held) {
      const m = METRIC_FOR_TYPE[v.liftType];
      const scopeKey = scopeKeys.find((k) => k !== 'alltime') || 'alltime';
      const entry = await BoardEntry.findOne({
        user: req.user._id,
        scopeKey,
        weightClass,
      }).lean();
      if (entry && entry[m.field]) {
        const base = { scopeKey, sex: identity.sex, weightClass, provisional: false };
        ranks = { scopeKey, weightClass, lift: await rankOnBoard(base, m, entry[m.field], entry[m.tie], entry.user) };
        // Total rank lives wherever the athlete's combined entry is.
        const totalEntry = await BoardEntry.findOne({
          user: req.user._id,
          scopeKey,
          totalKg: { $gt: 0 },
        }).lean();
        if (totalEntry) {
          ranks.total = await rankOnBoard(
            { scopeKey, sex: identity.sex, weightClass: totalEntry.weightClass, provisional: false },
            { field: 'totalKg', tie: 'totalAchievedAt' },
            totalEntry.totalKg,
            totalEntry.totalAchievedAt,
            totalEntry.user
          );
          ranks.totalWeightClass = totalEntry.weightClass;
        }
      }
    }

    return res.status(201).json({
      success: true,
      lift: publicLift(lift.toObject ? lift.toObject() : lift),
      held,
      pendingReview: pending,
      ranks, // null when held — "under review" in the app
    });
  } catch (err) {
    console.error('submitLift error:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit lift' });
  }
}

function publicLift(l) {
  return {
    id: l._id,
    liftType: l.liftType,
    weightKg: l.weightKg,
    bodyweightKg: l.bodyweightKg,
    liftDate: l.liftDate,
    videoUrl: l.videoUrl,
    status: l.status,
    pendingReview: l.pendingReview,
    review: l.review && l.review.reason ? { reason: l.review.reason, at: l.review.at } : undefined,
    createdAt: l.createdAt,
  };
}

// ---------------------------------------------------------------------------
// GET /api/lifts/me — own submission history with statuses + removal reasons
// ---------------------------------------------------------------------------
async function getMyLifts(req, res) {
  try {
    const lifts = await Lift.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ success: true, lifts: lifts.map(publicLift) });
  } catch (err) {
    console.error('getMyLifts error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load lifts' });
  }
}

// ---------------------------------------------------------------------------
// POST /api/lifts/:id/flag — queue-only in phase 2 (no board effect)
// ---------------------------------------------------------------------------
async function flagLift(req, res) {
  try {
    const reason = ['fake_weight', 'wrong_bodyweight', 'wrong_lift', 'not_athlete', 'other'].includes(
      (req.body || {}).reason
    )
      ? req.body.reason
      : null;
    if (!reason) return bad(res, 400, 'reason must be one of fake_weight, wrong_bodyweight, wrong_lift, not_athlete, other');
    const note = typeof (req.body || {}).note === 'string' ? req.body.note.slice(0, 500) : undefined;

    const lift = await Lift.findById(req.params.id);
    if (!lift || lift.status === 'removed') return bad(res, 404, 'Lift not found');
    if (String(lift.user) === String(req.user._id)) return bad(res, 400, 'You cannot flag your own lift');

    try {
      await Flag.create({ lift: lift._id, user: req.user._id, reason, note });
    } catch (err) {
      if (err.code === 11000) return bad(res, 409, 'You already flagged this lift');
      throw err;
    }
    // Flags queue for review — the lift STAYS on the boards (auto-suspend
    // ships disabled, §5). pendingReview puts it in the queue.
    lift.flagCount += 1;
    lift.pendingReview = true;
    await lift.save();
    await AuditLog.create({ actor: req.user._id, action: 'lift.flag', subject: lift._id, meta: { reason } });

    return res.status(201).json({ success: true, message: 'Flag recorded — the lift will be reviewed' });
  } catch (err) {
    console.error('flagLift error:', err);
    return res.status(500).json({ success: false, message: 'Failed to flag lift' });
  }
}

module.exports = {
  submitLift,
  getMyLifts,
  flagLift,
  // exported for DB-free checks
  parseSubmission,
  publicLift,
  DAILY_SUBMISSION_CAP,
  TOP_N_BADGE,
  MATURE_BOARD_MIN,
};
