const mongoose = require('mongoose');
const Report = require('../models/Report');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));

const REASONS = ['harassment', 'hate', 'spam', 'sexual', 'impersonation', 'violence', 'other'];
// Object.create(null) so 'constructor', 'toString' and friends are not
// truthy members of the allowlist. As a plain literal, targetType:
// "constructor" passed validation and then 500'd on Object.exists.
const TARGETS = Object.assign(Object.create(null), { user: User, post: Post, comment: Comment });

/**
 * POST /api/reports
 * body: { targetType, targetId, reason, note? }
 *
 * Reporting conduct. Disputing whether a LIFT is accurate is a different
 * thing with different reviewers and lives on /api/lifts/:id/flag.
 */
async function createReport(req, res, next) {
  try {
    const { targetType, targetId, reason, note } = req.body || {};

    if (typeof targetType !== 'string' || !TARGETS[targetType]) {
      return res.status(400).json({
        success: false,
        message: `targetType must be one of: ${Object.keys(TARGETS).join(', ')}`,
      });
    }
    if (!isValidObjectId(targetId)) {
      return res.status(400).json({ success: false, message: 'Invalid targetId.' });
    }
    if (!REASONS.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: `reason must be one of: ${REASONS.join(', ')}`,
      });
    }
    if (targetType === 'user' && String(targetId) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot report yourself.' });
    }

    const exists = await TARGETS[targetType].exists({ _id: targetId });
    if (!exists) {
      return res.status(404).json({ success: false, message: 'That content no longer exists.' });
    }

    try {
      await Report.create({
        reporter: req.user._id,
        targetType,
        targetId,
        reason,
        note: typeof note === 'string' ? note.slice(0, 1000) : undefined,
      });
    } catch (err) {
      // The unique index is partial on status 'open', so this only fires when
      // the reporter already has an OPEN report on this target. Reporting the
      // same thing twice before anyone has looked at it is a no-op, not an
      // error the person should have to understand.
      if (err && err.code === 11000) {
        return res.status(200).json({
          success: true,
          message: 'Thanks, we already have your report and it is being reviewed.',
        });
      }
      throw err;
    }

    // Deliberately says nothing about what happens next. Telling a reporter
    // that the account was actioned tells them things about someone else's
    // account, and telling them it was dismissed invites an argument.
    res.status(201).json({
      success: true,
      message: 'Thanks. Our team will review this.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { createReport };
