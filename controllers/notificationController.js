const Notification = require('../models/Notification');
const Device = require('../models/Device');
const User = require('../models/User');
const { isExpoPushToken } = require('../services/pushSender');

const PREFS = ['muteSocial', 'muteLifts', 'muteRank', 'quietHoursOff'];
// What an athlete with no notifications subdocument effectively has. Every
// value is the permissive one, which is also the schema default.
const DEFAULTS = { muteSocial: false, muteLifts: false, muteRank: false, quietHoursOff: false };

/**
 * POST /api/notifications/devices
 * body: { token, platform, timezone }
 *
 * Called on every launch, not just the first. The upsert reassigns a token to
 * whoever is signed in now, because reinstalling and signing in as someone
 * else hands out the SAME Expo token, and without the reassign one athlete's
 * notifications arrive on another's lock screen.
 */
async function registerDevice(req, res, next) {
  try {
    const { token, platform, timezone } = req.body || {};
    if (!isExpoPushToken(token)) {
      return res.status(400).json({ success: false, message: 'That is not an Expo push token.' });
    }
    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'platform must be ios or android.' });
    }
    // Validate the zone here rather than discovering it is junk at 3am when
    // quiet hours silently stops working for this athlete.
    let zone = null;
    if (typeof timezone === 'string' && timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        zone = timezone;
      } catch (err) {
        zone = null;
      }
    }

    await Device.updateOne(
      { token },
      {
        $set: {
          user: req.user._id,
          platform,
          timezone: zone,
          lastSeenAt: new Date(),
          // A returning install revives the row rather than staying dead.
          disabledAt: null,
        },
      },
      { upsert: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/notifications/devices/:token — sign-out, or push turned off. */
async function unregisterDevice(req, res, next) {
  try {
    await Device.deleteOne({ token: req.params.token, user: req.user._id });
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
}

/** GET /api/notifications?page=&limit=&unread=true */
async function listNotifications(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const filter = { user: req.user._id };
    if (req.query.unread === 'true') filter.readAt = null;

    const [rows, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actor', 'name username profile.display_name profile.profile_image_url')
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.user._id, readAt: null }),
    ]);

    res.status(200).json({
      success: true,
      count: rows.length,
      total,
      unread,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      // Delivery state is the server's business. The app needs the content,
      // whether it has been read, and where tapping it goes.
      data: rows.map((n) => ({
        _id: n._id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data || null,
        count: n.count,
        actor: n.actor || null,
        read: !!n.readAt,
        createdAt: n.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/notifications/unread-count — for the badge. */
async function unreadCount(req, res, next) {
  try {
    const unread = await Notification.countDocuments({ user: req.user._id, readAt: null });
    res.status(200).json({ success: true, unread });
  } catch (error) {
    next(error);
  }
}

/** POST /api/notifications/read — body { ids } or nothing for all. */
async function markRead(req, res, next) {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : null;
    const filter = { user: req.user._id, readAt: null };
    if (ids) filter._id = { $in: ids };
    const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    const unread = await Notification.countDocuments({ user: req.user._id, readAt: null });
    res.status(200).json({ success: true, updated: result.modifiedCount || 0, unread });
  } catch (error) {
    next(error);
  }
}

/** GET /api/notifications/preferences */
async function getPreferences(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('notifications').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    // Spread over DEFAULTS: a lean read of a legacy document has no
    // notifications key at all, and the settings screen would render every
    // switch as muted.
    res.status(200).json({ success: true, data: { ...DEFAULTS, ...(user.notifications || {}) } });
  } catch (error) {
    next(error);
  }
}

/** PUT /api/notifications/preferences — partial. */
async function updatePreferences(req, res, next) {
  try {
    const body = req.body || {};
    const $set = {};
    for (const key of PREFS) {
      if (body[key] === undefined) continue;
      if (typeof body[key] !== 'boolean') {
        return res.status(400).json({ success: false, message: `${key} must be true or false.` });
      }
      $set[`notifications.${key}`] = body[key];
    }
    if (!Object.keys($set).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set }, { new: true })
      .select('notifications')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.status(200).json({ success: true, data: { ...DEFAULTS, ...(user.notifications || {}) } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerDevice,
  unregisterDevice,
  listNotifications,
  unreadCount,
  markRead,
  getPreferences,
  updatePreferences,
  DEFAULTS,
};
