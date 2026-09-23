const mongoose = require('mongoose');
const Follow = require('../models/Follow');
const User = require('../models/User');

const USER_PUBLIC_FIELDS = 'name username profile_image_url profile.country';

const { areBlocked, canViewProfileOf } = require('../services/blocks');

// Every list and count filters on this. Spelled as a constant so a future
// status ('rejected', say) cannot quietly start counting as a follower.
const ACCEPTED = 'accepted';

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

    // `privacy` is selected now, before enforcement needs it. An inclusive
    // projection that omits it does NOT apply schema defaults, so the
    // subdocument comes back undefined and `target.privacy.accountPrivate`
    // throws rather than defaulting. Selecting it here means the approval
    // branch can be added without a latent 500 waiting behind it.
    const target = await User.findById(userId).select('_id privacy');
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (await areBlocked(me, userId)) {
      // Same message in both directions on purpose. "You are blocked by this
      // person" tells someone something they can act on.
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // `=== true`, not truthy: a user created before privacy shipped has no
    // privacy subdocument, and undefined must mean public.
    const isPrivate = target.privacy && target.privacy.accountPrivate === true;
    const status = isPrivate ? 'pending' : 'accepted';

    // Upsert so a duplicate follow is a no-op instead of a duplicate-key error.
    // $setOnInsert only — re-following must never flip an existing accepted
    // edge back to pending, which would silently un-approve someone.
    const result = await Follow.updateOne(
      { follower: me, following: userId },
      { $setOnInsert: { follower: me, following: userId, status } },
      { upsert: true }
    );

    const created = !!result.upsertedCount;
    const state = created
      ? status
      : ((await Follow.findOne({ follower: me, following: userId }).select('status').lean()) || {})
          .status || 'accepted';

    res.status(created ? 201 : 200).json({
      success: true,
      message: state === 'pending'
        ? (created ? 'Follow request sent.' : 'Follow request already sent.')
        : (created ? 'Now following this user.' : 'Already following this user.'),
      data: {
        // Tri-state. The app needs to tell "Following" from "Requested",
        // otherwise a pending request renders as "Follow" and tapping it does
        // nothing for ever.
        follow_state: state === 'pending' ? 'requested' : 'following',
        following: state === 'accepted',
        requested: state === 'pending',
        user_id: userId,
      },
    });
  } catch (error) {
    // Race between the exists-check and upsert can still surface a duplicate-key error — treat as success.
    if (error && error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: 'Already following this user.',
        data: {
          follow_state: 'following',
          following: true,
          requested: false,
          user_id: req.params.userId,
        },
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

    // Deliberately unqualified by status: this is both "unfollow" and
    // "cancel my pending request", which is what the same button does.
    const result = await Follow.deleteOne({ follower: me, following: userId });
    res.status(200).json({
      success: true,
      message: result.deletedCount ? 'Unfollowed this user.' : 'You were not following this user.',
      data: {
        follow_state: 'none',
        following: false,
        requested: false,
        user_id: userId,
      },
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
    // A private account's follower and following lists are part of the
    // account, not public data attached to it.
    if (!(await canViewProfileOf(req.user._id, targetId))) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const { pageNum, limitNum, skip } = parsePaging(req.query);

    const [edges, total] = await Promise.all([
      Follow.find({ following: targetId, status: ACCEPTED })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('follower', USER_PUBLIC_FIELDS)
        .lean(),
      Follow.countDocuments({ following: targetId, status: ACCEPTED }),
    ]);

    // Which of these people do I follow? (so the app can render Follow/Following buttons)
    const ids = edges.map((e) => e.follower && e.follower._id).filter(Boolean);
    // Status, not a filter. Filtering pending away makes a requested row
    // render as "Follow", and tapping it re-upserts nothing, so the request
    // can never be completed or cancelled.
    const myEdges = await Follow.find({
      follower: req.user._id,
      following: { $in: ids },
    })
      .select('following status')
      .lean();
    const iFollow = new Set(
      myEdges.filter((e) => e.status === ACCEPTED).map((e) => String(e.following))
    );
    const iRequested = new Set(
      myEdges.filter((e) => e.status === 'pending').map((e) => String(e.following))
    );
    const stateFor = (id) =>
      iFollow.has(String(id)) ? 'following' : iRequested.has(String(id)) ? 'requested' : 'none';

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
          follow_state: stateFor(e.follower._id),
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
    // A private account's follower and following lists are part of the
    // account, not public data attached to it.
    if (!(await canViewProfileOf(req.user._id, targetId))) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const { pageNum, limitNum, skip } = parsePaging(req.query);

    const [edges, total] = await Promise.all([
      Follow.find({ follower: targetId, status: ACCEPTED })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('following', USER_PUBLIC_FIELDS)
        .lean(),
      Follow.countDocuments({ follower: targetId, status: ACCEPTED }),
    ]);

    const ids = edges.map((e) => e.following && e.following._id).filter(Boolean);
    // Status, not a filter. Filtering pending away makes a requested row
    // render as "Follow", and tapping it re-upserts nothing, so the request
    // can never be completed or cancelled.
    const myEdges = await Follow.find({
      follower: req.user._id,
      following: { $in: ids },
    })
      .select('following status')
      .lean();
    const iFollow = new Set(
      myEdges.filter((e) => e.status === ACCEPTED).map((e) => String(e.following))
    );
    const iRequested = new Set(
      myEdges.filter((e) => e.status === 'pending').map((e) => String(e.following))
    );
    const stateFor = (id) =>
      iFollow.has(String(id)) ? 'following' : iRequested.has(String(id)) ? 'requested' : 'none';

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
          follow_state: stateFor(e.following._id),
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

    // Reads the edge rather than testing existence, because the button has
    // three states and `exists` collapses two of them.
    const [mine, theirs, followers, following] = await Promise.all([
      Follow.findOne({ follower: me, following: userId }).select('status').lean(),
      Follow.findOne({ follower: userId, following: me }).select('status').lean(),
      Follow.countDocuments({ following: userId, status: ACCEPTED }),
      Follow.countDocuments({ follower: userId, status: ACCEPTED }),
    ]);

    const myState = !mine ? 'none' : mine.status === 'pending' ? 'requested' : 'following';

    res.status(200).json({
      success: true,
      data: {
        user_id: userId,
        follow_state: myState,
        isFollowing: myState === 'following',
        requested: myState === 'requested',
        isFollowedBy: !!theirs && theirs.status === ACCEPTED,
        followers_count: followers,
        following_count: following,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/follow/requests
 * People waiting for me to approve them. Only meaningful for a private
 * account, but it answers honestly for anyone, because an account that was
 * private and went public can still have pending rows.
 */
async function getFollowRequests(req, res, next) {
  try {
    const { pageNum, limitNum, skip } = parsePaging(req.query);
    const q = { following: req.user._id, status: 'pending' };

    const [edges, total] = await Promise.all([
      Follow.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('follower', USER_PUBLIC_FIELDS)
        .lean(),
      Follow.countDocuments(q),
    ]);

    res.status(200).json({
      success: true,
      count: edges.length,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      data: edges
        .filter((e) => e.follower)
        .map((e) => ({ user: e.follower, requestedAt: e.createdAt })),
    });
  } catch (error) {
    next(error);
  }
}

/** POST /api/follow/requests/:userId/approve */
async function approveFollowRequest(req, res, next) {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }
    // Scoped to pending so approving twice cannot resurrect an edge the
    // requester cancelled in between.
    const result = await Follow.updateOne(
      { follower: userId, following: req.user._id, status: 'pending' },
      { $set: { status: ACCEPTED } }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ success: false, message: 'No pending request from that user.' });
    }
    res.status(200).json({ success: true, message: 'Request approved.' });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/follow/requests/:userId
 * Decline a request. The row is deleted rather than marked rejected: keeping
 * a tombstone would let the requester see they were declined, and it would
 * block them from ever asking again.
 */
async function declineFollowRequest(req, res, next) {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }
    const result = await Follow.deleteOne({
      follower: userId,
      following: req.user._id,
      status: 'pending',
    });
    if (!result.deletedCount) {
      return res.status(404).json({ success: false, message: 'No pending request from that user.' });
    }
    res.status(200).json({ success: true, message: 'Request declined.' });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/follow/followers/:userId
 * Remove a follower without blocking them. The soft option: they are not
 * told, and they can follow again (or request again, if you are private).
 */
async function removeFollower(req, res, next) {
  try {
    const { userId } = req.params;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }
    const result = await Follow.deleteOne({ follower: userId, following: req.user._id });
    res.status(200).json({
      success: true,
      message: result.deletedCount ? 'Follower removed.' : 'That user was not following you.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  followUser,
  getFollowRequests,
  approveFollowRequest,
  declineFollowRequest,
  removeFollower,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowStatus,
};
