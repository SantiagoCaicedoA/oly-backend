const Block = require('../models/Block');
const Follow = require('../models/Follow');
const { runBoardTransaction } = require('./boardWrite');

/**
 * Blocking, in one place.
 *
 * A Block row is stored one-directional so "who did this" stays answerable,
 * but it takes effect both ways. That asymmetry is the whole reason this file
 * exists: eight call sites each hand-rolling the two-way $or is eight chances
 * to forget one, and a forgotten one is an invisible leak.
 *
 * Blocking also DELETES both follow edges. That is not a nicety. The friends
 * feed, the friends board, follower counts and the athlete card are all
 * driven by Follow, so removing the edges makes every one of them respect the
 * block with no block-awareness of their own. It is the difference between
 * enforcing this in one place and enforcing it in nine. The visible
 * consequence, the same one Instagram has, is that unblocking does not
 * restore the follow: you have to follow again.
 */

/** Is there a block between these two, in either direction? */
async function areBlocked(a, b) {
  if (!a || !b || String(a) === String(b)) return false;
  const hit = await Block.exists({
    $or: [
      { blocker: a, blocked: b },
      { blocker: b, blocked: a },
    ],
  });
  return !!hit;
}

/**
 * Every user id this viewer cannot see, in either direction, as strings.
 * Used to filter feeds that are not follow-driven (discovery, feed=all).
 *
 * Capped deliberately. This becomes a $nin on a hot path, and an unbounded
 * $nin degrades badly; the friends board already caps at 1000 for the same
 * reason. Past the cap the block is still enforced everywhere that matters,
 * because the follow edges are gone.
 */
const BLOCK_CAP = 1000;

async function blockedIdSet(userId) {
  if (!userId) return new Set();
  // TWO queries with independent caps, not one $or with a shared cap.
  // With a shared cap, blocking 1000 throwaway accounts could fill the set
  // and push the "who blocked ME" rows out of it, which would turn OTHER
  // people's blocks off. That direction is the one protecting everyone else,
  // so it gets its own budget.
  const [iBlocked, blockedMe] = await Promise.all([
    Block.find({ blocker: userId }).select('blocked').limit(BLOCK_CAP).lean(),
    Block.find({ blocked: userId }).select('blocker').limit(BLOCK_CAP).lean(),
  ]);

  const out = new Set();
  for (const r of iBlocked) out.add(String(r.blocked));
  for (const r of blockedMe) out.add(String(r.blocker));
  return out;
}

/**
 * Block `target` on behalf of `actor`, and sever the relationship.
 * Idempotent: blocking someone already blocked is a no-op, not an error.
 */
async function blockUser(actor, target) {
  if (String(actor) === String(target)) {
    return { ok: false, reason: 'self' };
  }

  try {
    await runBoardTransaction(async (session) => {
      const opts = session ? { session } : {};
      // Edges FIRST. On the non-transactional dev fallback a failure after
      // the Block row would leave a recorded block with both follows alive,
      // and every follow-driven surface would keep showing the blocked
      // person with nothing to repair it. accountAnonymize orders its writes
      // the same way and for the same reason.
      await Follow.deleteMany(
        {
          $or: [
            { follower: actor, following: target },
            { follower: target, following: actor },
          ],
        },
        opts
      );
      await Block.updateOne(
        { blocker: actor, blocked: target },
        { $setOnInsert: { blocker: actor, blocked: target } },
        { upsert: true, ...opts }
      );
    });
  } catch (err) {
    // Two concurrent upserts race on the unique index. E11000 is not a
    // transient transaction error, so withTransaction does not retry it and
    // a double-tap returned a 500. The row exists either way.
    if (!err || err.code !== 11000) throw err;
  }

  return { ok: true };
}

/** Remove a block. Does NOT restore the deleted follow edges. */
async function unblockUser(actor, target) {
  const res = await Block.deleteOne({ blocker: actor, blocked: target });
  return { ok: true, removed: res.deletedCount > 0 };
}

/**
 * May `viewer` see `target`'s profile and social graph?
 *
 * False when either has blocked the other, or when the target is private and
 * the viewer is not an accepted follower. A PENDING request is not access:
 * the whole point of approval is that asking does not grant anything.
 */
async function canViewProfileOf(viewer, target) {
  if (!viewer || !target) return false;
  if (String(viewer) === String(target)) return true;
  if (await areBlocked(viewer, target)) return false;

  const User = require('../models/User');
  const user = await User.findById(target).select('privacy').lean();
  // `=== true`: an account created before privacy existed is public.
  if (!user || !user.privacy || user.privacy.accountPrivate !== true) return true;

  const Follow = require('../models/Follow');
  return !!(await Follow.exists({ follower: viewer, following: target, status: 'accepted' }));
}

module.exports = {
  areBlocked,
  blockedIdSet,
  blockUser,
  unblockUser,
  canViewProfileOf,
  BLOCK_CAP,
};
