const Post = require('../models/Post');
const User = require('../models/User');
const Follow = require('../models/Follow');
const { areBlocked } = require('../services/blocks');

/**
 * Gate every per-post endpoint on the author's relationship to the viewer.
 *
 * This is route middleware, not a call inside each handler, because the first
 * version enforced blocking only in the feed query. Post detail, comments and
 * likes are reached by post id and are not follow-driven, so they inherited
 * nothing: a blocked harasser could still open the post, read the thread,
 * like it, and leave comments the blocker would see on their own post. That
 * is the single thing a block exists to stop.
 *
 * Mounted on the router, it applies to every current and future /:id route,
 * which is the property that matters. Seven handlers each remembering to call
 * a helper is seven chances to forget.
 *
 * 404 rather than 403 everywhere: "you are blocked" is information, and it
 * matches the 404 followUser already returns for the same reason.
 */
function postAccess(req, res, next) {
  (async () => {
    const postId = req.params.id;
    const viewer = req.user && req.user._id;
    if (!postId || !viewer) return next();

    const post = await Post.findById(postId).select('user').lean();
    // Let the handler produce its own 404 for a missing post, so this
    // middleware never changes behaviour for content that does not exist.
    if (!post || !post.user) return next();
    if (String(post.user) === String(viewer)) return next(); // your own post

    if (await areBlocked(viewer, post.user)) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const author = await User.findById(post.user).select('privacy').lean();
    // `=== true` so an account created before privacy existed stays public.
    if (author && author.privacy && author.privacy.accountPrivate === true) {
      const edge = await Follow.exists({
        follower: viewer,
        following: post.user,
        status: 'accepted',
      });
      if (!edge) {
        return res.status(404).json({ success: false, message: 'Post not found.' });
      }
    }
    return next();
  })().catch(next);
}

module.exports = postAccess;
