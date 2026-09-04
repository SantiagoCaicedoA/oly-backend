const mongoose = require('mongoose');
const Lift = require('../models/Lift');
const Flag = require('../models/Flag');
const Season = require('../models/Season');
const OutboxEvent = require('../models/OutboxEvent');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { buildIdentity, recomputeAthlete, scopeKeysForLiftDate } = require('../services/boardWrite');
const { classForBodyweight } = require('../utils/leaderboard/classTable');

/**
 * Review queue (design doc §5): holds pending-badged lifts (priority),
 * held, flagged and suspended lifts. All actions are idempotent and
 * audited; the affected athlete's entries are recomputed from their
 * remaining live lifts — a bounded single-user operation, so removal is as
 * cheap as approval and no global recompute is ever needed.
 *
 * approve — held → live (ranks through the same write path) and/or the
 *           pending badge clears. Approving an already-clean lift is a
 *           no-op success.
 * remove  — status → removed with a reason the athlete sees; entries
 *           recomputed without it. Removing twice is a no-op success.
 */

// ---------------------------------------------------------------------------
// GET /api/review/queue
// ---------------------------------------------------------------------------
async function getQueue(req, res) {
  try {
    const [priority, rest] = await Promise.all([
      // Pending-badged live lifts first — the athletes driving the
      // competitive loop wait at the FRONT of the queue.
      Lift.find({ status: 'live', pendingReview: true }).sort({ createdAt: 1 }).limit(50).lean(),
      Lift.find({ status: { $in: ['held', 'suspended'] } }).sort({ createdAt: 1 }).limit(50).lean(),
    ]);
    const liftIds = [...priority, ...rest].map((l) => l._id);
    const flags = await Flag.find({ lift: { $in: liftIds } }).lean();
    const flagsByLift = {};
    for (const f of flags) {
      (flagsByLift[String(f.lift)] = flagsByLift[String(f.lift)] || []).push({
        reason: f.reason,
        note: f.note,
        at: f.createdAt,
      });
    }
    const users = await User.find({ _id: { $in: [...new Set([...priority, ...rest].map((l) => String(l.user)))] } })
      .select('name profile.display_name profile.countryCode')
      .lean();
    const nameOf = Object.fromEntries(
      users.map((u) => [String(u._id), (u.profile && u.profile.display_name) || u.name])
    );

    const row = (l, bucket) => ({
      id: l._id,
      bucket, // 'pending-badge' | 'held-or-suspended'
      athlete: { id: l.user, name: nameOf[String(l.user)] || 'Unknown' },
      liftType: l.liftType,
      weightKg: l.weightKg,
      bodyweightKg: l.bodyweightKg,
      liftDate: l.liftDate,
      videoUrl: l.videoUrl,
      status: l.status,
      pendingReview: l.pendingReview,
      flagCount: l.flagCount,
      flags: flagsByLift[String(l._id)] || [],
      submittedAt: l.createdAt,
    });

    return res.json({
      success: true,
      queue: [...priority.map((l) => row(l, 'pending-badge')), ...rest.map((l) => row(l, 'held-or-suspended'))],
    });
  } catch (err) {
    console.error('getQueue error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load review queue' });
  }
}

// ---------------------------------------------------------------------------
// POST /api/review/:liftId  { action: "approve" | "remove", reason? }
// ---------------------------------------------------------------------------
async function reviewLift(req, res) {
  try {
    const action = (req.body || {}).action;
    if (action !== 'approve' && action !== 'remove')
      return res.status(400).json({ success: false, message: 'action must be "approve" or "remove"' });
    const reason = typeof (req.body || {}).reason === 'string' ? req.body.reason.slice(0, 300) : null;
    if (action === 'remove' && !reason)
      return res.status(400).json({ success: false, message: 'remove requires a reason — the athlete sees it' });

    const lift = await Lift.findById(req.params.liftId);
    if (!lift) return res.status(404).json({ success: false, message: 'Lift not found' });

    const user = await User.findById(lift.user);
    if (!user) return res.status(404).json({ success: false, message: 'Athlete no longer exists' });
    const identity = buildIdentity(user);
    const weightClass = classForBodyweight(lift.bodyweightKg, identity.sex);

    // Idempotent state transitions.
    if (action === 'approve') {
      if (lift.status === 'removed')
        return res.status(409).json({ success: false, message: 'Lift was removed — submit a new one to re-rank' });
      lift.status = 'live';
      lift.pendingReview = false;
      lift.review = { by: req.user._id, at: new Date() };
    } else {
      lift.status = 'removed';
      lift.pendingReview = false;
      lift.review = { by: req.user._id, at: new Date(), reason };
    }
    await lift.save();

    // Recompute the athlete in every scope the lift touches; enqueue
    // renumber for the partitions that changed.
    const seasons = await Season.find({ status: { $in: ['active', 'grace'] } }).lean();
    const scopeKeys = scopeKeysForLiftDate(lift.liftDate, seasons);
    const partitions = [];
    for (const scopeKey of scopeKeys) {
      const window = scopeKey === 'alltime' ? null : seasons.find((s) => s.key === scopeKey);
      const touched = await recomputeAthlete(user, scopeKey, window);
      for (const wc of new Set([...touched, weightClass]))
        partitions.push({ scopeKey, sex: identity.sex, weightClass: wc });
    }
    await OutboxEvent.create({ type: 'renumber', partitions, lift: lift._id });
    await AuditLog.create({
      actor: req.user._id,
      action: action === 'approve' ? 'review.approve' : 'review.remove',
      subject: lift._id,
      meta: { reason, scopeKeys },
    });

    return res.json({ success: true, lift: { id: lift._id, status: lift.status, pendingReview: lift.pendingReview } });
  } catch (err) {
    console.error('reviewLift error:', err);
    return res.status(500).json({ success: false, message: 'Failed to review lift' });
  }
}

module.exports = { getQueue, reviewLift };
