const mongoose = require('mongoose');
const Block = require('../models/Block');
const User = require('../models/User');
const { blockUser, unblockUser } = require('../services/blocks');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));
const USER_PUBLIC_FIELDS = 'name username profile.display_name profile.profile_image_url';

/** POST /api/blocks/:userId */
async function block(req, res, next) {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }
    const target = await User.findById(userId).select('_id anonymizedAt');
    if (!target || target.anonymizedAt) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const result = await blockUser(req.user._id, userId);
    if (!result.ok && result.reason === 'self') {
      return res.status(400).json({ success: false, message: 'You cannot block yourself.' });
    }

    // Says "blocked" either way: whether the row already existed is not the
    // caller's business, and a retry after a dropped connection should look
    // like success rather than an error.
    res.status(200).json({ success: true, blocked: true });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/blocks/:userId */
async function unblock(req, res, next) {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }
    await unblockUser(req.user._id, userId);
    // Deliberately not silent about this: the follow edges were deleted by the
    // block and unblocking does not bring them back.
    res.status(200).json({
      success: true,
      blocked: false,
      message: 'Unblocked. You are no longer following each other.',
    });
  } catch (error) {
    next(error);
  }
}

/** GET /api/blocks — people I have blocked (not people who blocked me). */
async function listBlocks(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const [rows, total] = await Promise.all([
      Block.find({ blocker: req.user._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('blocked', USER_PUBLIC_FIELDS)
        .lean(),
      Block.countDocuments({ blocker: req.user._id }),
    ]);

    res.status(200).json({
      success: true,
      count: rows.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: rows.filter((r) => r.blocked).map((r) => ({ user: r.blocked, blockedAt: r.createdAt })),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { block, unblock, listBlocks };
