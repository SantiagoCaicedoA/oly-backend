const mongoose = require('mongoose');
const Follow = require('../models/Follow');
const User = require('../models/User');

const USER_PUBLIC_FIELDS = 'name username profile_image_url profile.country';

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parsePaging(query) {
  const pageNum = Math.max(1, parseInt(query.page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(query.limit) || 20));
  return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
}

/**
 * POST /api/follow/:userId
 * Follow a user. Idempotent — following someone you already follow returns success.
 */
async function followUser(req, res, next) {
  try {
    const { userId } = req.params;
    const me = req.user._id;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }
    if (String(userId) === String(me)) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself.' });
    }

    const target = await User.findById(userId).select('_id');
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Upsert so a duplicate follow is a no-op instead of a duplicate-key error.
    const result = await Follow.updateOne(
      { follower: me, following: userId },
      { $setOnInsert: { follower: me, following: userId } },
      { upsert: true }
    );

    const alreadyFollowing = !result.upsertedCount;
    res.status(alreadyFollowing ? 200 : 201).json({
      success: true,
      message: alreadyFollowing ? 'Already following this user.' : 'Now following this user.',
      data: { following: true, user_id: userId },
    });
  } catch (error) {
    // Race between the exists-check and upsert can still surface a duplicate-key error — treat as success.
    if (error && error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: 'Already following this user.',
        data: { following: true, user_id: req.params.userId },
      });
    }
    next(error);
  }
}

/**
 * DELETE /api/follow/:userId
 * Unfollow a user. Idempotent — unfollowing someone you don't follow returns success.
 */
async function unfollowUser(req, res, next) {
  try {
    const { userId } = req.params;
    const me = req.user._id;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }

    const result = await Follow.deleteOne({ follower: me, following: userId });
    res.status(200).json({
      success: true,
      message: result.deletedCount ? 'Unfollowed this user.' : 'You were not following this user.',
      data: { following: false, user_id: userId },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/follow/followers?userId=&page=&limit=
 * List a user's followers (defaults to the authenticated user).
 * Each entry includes isFollowing: whether *I* follow that person back.
 */
async function getFollowers(req, res, next) {
  try {
    const targetId = req.query.userId || req.user._id;
    if (!isValidObjectId(targetId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }
    const { pageNum, limitNum, skip } = parsePaging(req.query);

    const [edges, total] = await Promise.all([
      Follow.find({ following: targetId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('follower', USER_PUBLIC_FIELDS)
        .lean(),
      Follow.countDocuments({ following: targetId }),
    ]);

    // Which of these people do I follow? (so the app can render Follow/Following buttons)
    const ids = edges.map((e) => e.follower && e.follower._id).filter(Boolean);
    const myEdges = await Follow.find({ follower: req.user._id, following: { $in: ids } })
      .select('following')
      .lean();
    const iFollow = new Set(myEdges.map((e) => String(e.following)));

    const totalPages = Math.ceil(total / limitNum);
    res.status(200).json({
      success: true,
      count: edges.length,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      data: edges
        .filter((e) => e.follower)
        .map((e) => ({
          user: e.follower,
          followed_at: e.createdAt,
          isFollowing: iFollow.has(String(e.follower._id)),
        })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/follow/following?userId=&page=&limit=
 * List who a user follows (defaults to the authenticated user).
 */
async function getFollowing(req, res, next) {
  try {
    const targetId = req.query.userId || req.user._id;
    if (!isValidObjectId(targetId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }
    const { pageNum, limitNum, skip } = parsePaging(req.query);

    const [edges, total] = await Promise.all([
      Follow.find({ follower: targetId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('following', USER_PUBLIC_FIELDS)
        .lean(),
      Follow.countDocuments({ follower: targetId }),
    ]);

    const ids = edges.map((e) => e.following && e.following._id).filter(Boolean);
    const myEdges = await Follow.find({ follower: req.user._id, following: { $in: ids } })
      .select('following')
      .lean();
    const iFollow = new Set(myEdges.map((e) => String(e.following)));

    const totalPages = Math.ceil(total / limitNum);
    res.status(200).json({
      success: true,
      count: edges.length,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      data: edges
        .filter((e) => e.following)
        .map((e) => ({
          user: e.following,
          followed_at: e.createdAt,
          isFollowing: iFollow.has(String(e.following._id)),
        })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/follow/status/:userId
 * Relationship between me and a user + their public counts.
 * Use on profile screens: isFollowing drives the button, counts drive the header.
 */
async function getFollowStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const me = req.user._id;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }

    const [isFollowing, isFollowedBy, followers, following] = await Promise.all([
      Follow.exists({ follower: me, following: userId }),
      Follow.exists({ follower: userId, following: me }),
      Follow.countDocuments({ following: userId }),
      Follow.countDocuments({ follower: userId }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        user_id: userId,
        isFollowing: !!isFollowing,
        isFollowedBy: !!isFollowedBy,
        followers_count: followers,
        following_count: following,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowStatus,
};
