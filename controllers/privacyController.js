const User = require('../models/User');
const BoardEntry = require('../models/BoardEntry');
const Post = require('../models/Post');
const Follow = require('../models/Follow');
const { runBoardTransaction } = require('../services/boardWrite');

const BOOLS = ['accountPrivate', 'hideBodyweight', 'hideClub'];
const MESSAGE_OPTIONS = ['everyone', 'people-i-follow', 'nobody'];

// What a user with no privacy subdocument effectively has. Every value here
// is the permissive one, which is also what the schema defaults to, so an
// account created before privacy existed behaves exactly like a new one.
const DEFAULTS = {
  accountPrivate: false,
  allowMessagesFrom: 'everyone',
  hideBodyweight: false,
  hideClub: false,
};

/** GET /api/privacy */
async function getPrivacy(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('privacy').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    // Spread over DEFAULTS rather than returning user.privacy directly: a
    // .lean() read of a legacy document has no privacy key at all, and the
    // settings screen would render every toggle as off.
    res.status(200).json({ success: true, data: { ...DEFAULTS, ...(user.privacy || {}) } });
  } catch (error) {
    next(error);
  }
}

/** PUT /api/privacy — partial update, only the keys sent are changed. */
async function updatePrivacy(req, res, next) {
  try {
    const body = req.body || {};
    const $set = {};

    for (const key of BOOLS) {
      if (body[key] === undefined) continue;
      if (typeof body[key] !== 'boolean') {
        return res.status(400).json({ success: false, message: `${key} must be true or false.` });
      }
      $set[`privacy.${key}`] = body[key];
    }
    if (body.allowMessagesFrom !== undefined) {
      if (!MESSAGE_OPTIONS.includes(body.allowMessagesFrom)) {
        return res.status(400).json({
          success: false,
          message: `allowMessagesFrom must be one of: ${MESSAGE_OPTIONS.join(', ')}`,
        });
      }
      $set['privacy.allowMessagesFrom'] = body.allowMessagesFrom;
    }
    if (!Object.keys($set).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }

    const current = await User.findById(req.user._id).select('privacy profile.club');
    if (!current) return res.status(404).json({ success: false, message: 'User not found.' });
    const club = (current.profile && current.profile.club) || null;

    // The leaderboard stores club denormalised, written at lift-submit time.
    // Without this sweep a hidden club stays visible on the board until the
    // athlete's next verified lift, which could be months. Same shape as the
    // sweep account deletion already does.
    const sweep = {};
    if ($set['privacy.hideClub'] !== undefined) {
      sweep.club = $set['privacy.hideClub'] ? null : club;
    }
    if ($set['privacy.hideBodyweight'] !== undefined) {
      sweep.hideBodyweight = $set['privacy.hideBodyweight'];
    }

    // One transaction for all of it. The setting used to be saved on its own
    // and the copies swept afterwards, so a failure in between left
    // hideClub: true durably stored while the club stayed on the public
    // leaderboard, with no repair path and a 500 telling the athlete it had
    // not saved.
    await runBoardTransaction(async (session) => {
      const opts = session ? { session } : {};
      await User.updateOne({ _id: req.user._id }, { $set }, { runValidators: true, ...opts });
      if (Object.keys(sweep).length) {
        await BoardEntry.updateMany({ user: req.user._id }, { $set: sweep }, opts);
      }
      // Posts carry a denormalised copy of accountPrivate so the feed does
      // not read the author per post. Without this sweep, going private
      // leaves every existing post on the public feed.
      if ($set['privacy.accountPrivate'] !== undefined) {
        await Post.updateMany(
          { user: req.user._id },
          { $set: { authorPrivate: $set['privacy.accountPrivate'] } },
          opts
        );
      }
      // Going public clears the approval queue: nobody should be stuck
      // "Requested" against an account that no longer requires approval.
      if ($set['privacy.accountPrivate'] === false) {
        await Follow.updateMany(
          { following: req.user._id, status: 'pending' },
          { $set: { status: 'accepted' } },
          opts
        );
      }
    });

    const user = await User.findById(req.user._id).select('privacy').lean();

    res.status(200).json({
      success: true,
      data: { ...DEFAULTS, ...((user && user.privacy) || {}) },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getPrivacy, updatePrivacy, DEFAULTS };
