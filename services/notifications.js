const Notification = require('../models/Notification');
const Device = require('../models/Device');
const User = require('../models/User');
const { typeConfig, isType } = require('../utils/notificationTypes');
const { deliverableAt } = require('../utils/quietHours');

/**
 * Creating notifications. One entry point: notify().
 *
 * Three things happen here and nowhere else, because each of them is a way
 * to lose a user permanently if it is got wrong in one place out of nine.
 *
 *   MUTING      an athlete who turned a category off still gets the row, so
 *               the bell is complete, but nothing is sent.
 *   COLLAPSING  twenty likes on one lift become one notification saying
 *               twenty. Without this the app is an uninstall.
 *   TIMING      the batching window and quiet hours are the same mechanism,
 *               a future availableAt, so the worker needs to know neither.
 */

// Which preference switch covers which type.
const CATEGORY = {
  like: 'muteSocial',
  comment: 'muteSocial',
  follow: 'muteSocial',
  follow_request: 'muteSocial',
  lift_verified: 'muteLifts',
  lift_rejected: 'muteLifts',
  rank_up: 'muteRank',
  rank_down: 'muteRank',
  proximity: 'muteRank',
};

/** The zone from the athlete's most recently seen live device. */
async function timezoneFor(userId) {
  const device = await Device.findOne({ user: userId, disabledAt: null })
    .sort({ lastSeenAt: -1 })
    .select('timezone')
    .lean();
  return (device && device.timezone) || null;
}

/**
 * Create a notification, collapsing into a pending one where that is what
 * the type asks for.
 *
 * Never throws at the caller. A like that fails to notify is still a like,
 * and taking down the like endpoint because the push queue hiccuped would be
 * a far worse trade.
 *
 * @returns {Promise<Notification|null>}
 */
async function notify(userId, type, payload = {}) {
  try {
    if (!userId || !isType(type)) return null;
    // Nobody is notified about their own actions.
    if (payload.actor && String(payload.actor._id || payload.actor) === String(userId)) return null;

    const cfg = typeConfig(type);
    const user = await User.findById(userId).select('notifications anonymizedAt').lean();
    if (!user || user.anonymizedAt) return null;

    const prefs = user.notifications || {};
    // `=== true`, so a user with no notifications subdocument is not muted.
    const muted = prefs[CATEGORY[type]] === true;

    const actorId = payload.actor ? payload.actor._id || payload.actor : null;
    const groupKey = cfg.groupKey ? cfg.groupKey(payload) : null;

    // A cooldown is per type per group, and it counts notifications that were
    // actually SENT. Counting suppressed ones would mean a muted athlete who
    // unmutes hears nothing for a week.
    if (cfg.cooldownMs) {
      const since = new Date(Date.now() - cfg.cooldownMs);
      const recent = await Notification.findOne({
        user: userId,
        type,
        groupKey,
        status: 'sent',
        sentAt: { $gte: since },
      })
        .select('_id')
        .lean();
      if (recent) return null;
    }

    // Collapse into one that has not gone out yet. Scoped to pending on
    // purpose: once something is on a lock screen, editing its row would
    // change history that the athlete has already read.
    if (groupKey) {
      const existing = await Notification.findOne({
        user: userId,
        groupKey,
        status: 'pending',
      });
      if (existing) {
        existing.count += 1;
        existing.actor = actorId || existing.actor;
        const rendered = cfg.render({ ...payload, count: existing.count });
        existing.title = rendered.title;
        existing.body = rendered.body;
        // availableAt is NOT extended. The window opens on the first event,
        // or a lift that keeps collecting likes is never announced at all.
        await existing.save();
        return existing;
      }
    }

    const rendered = cfg.render({ ...payload, count: 1 });
    const base = new Date(Date.now() + (cfg.delayMs || 0));
    const tz = muted ? null : await timezoneFor(userId);
    const availableAt = cfg.quiet
      ? deliverableAt(base, tz, { enabled: prefs.quietHoursOff !== true })
      : base;

    return await Notification.create({
      user: userId,
      type,
      actor: actorId,
      title: rendered.title,
      body: rendered.body,
      data: payload.data || null,
      groupKey,
      count: 1,
      // Suppressed still means visible in the app. The athlete asked not to
      // be interrupted, not to be kept in the dark.
      status: muted ? 'suppressed' : 'pending',
      availableAt,
    });
  } catch (err) {
    console.error('notify failed', type, err);
    return null;
  }
}

module.exports = { notify, CATEGORY, timezoneFor };
