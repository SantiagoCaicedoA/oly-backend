/**
 * Account deletion — anonymize, don't erase (design doc §8, rev 5).
 *
 * Deletion scrubs IDENTITY everywhere the user reference appears — the
 * user record, their BoardEntries, and (phase 3) SeasonResult display
 * fields — while the lift log and placements survive anonymized: history
 * stays consistent, the person stops being identifiable, and results other
 * athletes earned AGAINST them remain true.
 *
 * Wired into DELETE /api/users/me and DELETE /api/users/:id.
 *
 * NOTE: media is NOT yet removed from S3 — s3Service has no delete path.
 * Until it does, the athlete card must not expose video for an anonymized
 * athlete, or "Former athlete" still ships with their face on video.
 */

const User = require('../models/User');
const BoardEntry = require('../models/BoardEntry');
const AuditLog = require('../models/AuditLog');
const { runBoardTransaction } = require('./boardWrite');

const ANON_NAME = 'Former athlete';

async function anonymizeUser(userId, actorId = null) {
  const user = await User.findById(userId);
  if (!user) return { ok: false, reason: 'not-found' };
  if (user.anonymizedAt) return { ok: true, alreadyAnonymized: true };

  // Both writes in one transaction. Ordering still matters for the dev
  // fallback: board identity goes first so a partial failure leaves the
  // PUBLIC surface anonymized rather than still showing the real name.
  await runBoardTransaction(async (session) => {
    const opts = session ? { session } : {};

    await BoardEntry.updateMany(
      { user: user._id },
      { $set: { name: ANON_NAME, avatarUrl: null, club: null, anonymized: true } },
      opts
    );

    user.anonymizedAt = new Date();
    user.name = ANON_NAME;
    user.username = undefined;
    user.email = `deleted+${user._id}@oly.invalid`;
    if (user.profile) {
      user.profile.display_name = ANON_NAME;
      user.profile.profile_image_url = undefined;
      user.profile.profile_video_url = undefined;
      user.profile.profile_video_urls = [];
      user.profile.club = undefined;
      // countryCode / sex / birth_year REMAIN: they are board facts, not
      // identity — an anonymized 79kg M COL entry stays a truthful result.
    }
    await user.save(opts);
  });

  // Append-only and non-critical: a failed audit write must not report a
  // completed deletion as a 500.
  try {
    await AuditLog.create({
      actor: actorId || user._id,
      action: 'account.anonymize',
      subject: user._id,
      meta: {},
    });
  } catch (err) {
    console.error('accountAnonymize: audit log write failed', err);
  }

  return { ok: true };
}

module.exports = { anonymizeUser, ANON_NAME };
