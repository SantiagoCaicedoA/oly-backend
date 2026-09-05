/**
 * Account deletion — anonymize, don't erase (design doc §8, rev 5).
 *
 * Deletion scrubs IDENTITY everywhere the user reference appears — the
 * user record, their BoardEntries, and (phase 3) SeasonResult display
 * fields — while the lift log and placements survive anonymized: history
 * stays consistent, the person stops being identifiable, and results other
 * athletes earned AGAINST them remain true. Videos are deleted from S3 by
 * the caller (media lifecycle is the video pipeline's job).
 *
 * Wire this into the account-deletion endpoint when it lands; callable
 * standalone for support-driven deletions.
 */

const User = require('../models/User');
const BoardEntry = require('../models/BoardEntry');
const AuditLog = require('../models/AuditLog');

const ANON_NAME = 'Former athlete';

async function anonymizeUser(userId, actorId = null) {
  const user = await User.findById(userId);
  if (!user) return { ok: false, reason: 'not-found' };

  // Scrub the user document's identity while keeping the account row (the
  // Lift log references it). Email is replaced with a tombstone so the
  // unique index stays satisfied and the address is freed for reuse.
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
  await user.save();

  // Rewrite denormalized identity on every board entry (identity only —
  // results untouched).
  await BoardEntry.updateMany(
    { user: user._id },
    { $set: { name: ANON_NAME, avatarUrl: null, club: null } }
  );

  await AuditLog.create({
    actor: actorId || user._id,
    action: 'account.anonymize',
    subject: user._id,
    meta: {},
  });
  return { ok: true };
}

module.exports = { anonymizeUser, ANON_NAME };
