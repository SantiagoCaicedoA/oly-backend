const { strengthStatsToSectioned } = require('./normalizeProfileEnums');

/**
 * Shape profile for API response: image_url, video_urls (all videos, no "latest" field).
 * strength_stats in sectioned format (classic, variation, squat, press).
 */
function profileWithMediaUrls(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const p = typeof profile.toObject === 'function' ? profile.toObject() : { ...profile };

  const imageUrl = (p.profile_image_url != null && String(p.profile_image_url).trim() !== '')
    ? String(p.profile_image_url)
    : '';
  const urls = Array.isArray(p.profile_video_urls) ? p.profile_video_urls.filter((u) => u && String(u).trim()) : [];
  const legacyUrl = (p.profile_video_url != null && String(p.profile_video_url).trim() !== '') ? String(p.profile_video_url) : '';
  const videoUrls = urls.length > 0 ? urls : (legacyUrl ? [legacyUrl] : []);

  if (p.strength_stats != null) {
    p.strength_stats = strengthStatsToSectioned(p.strength_stats);
  }

  const { profile_image_url: _pi, profile_video_url: _pv, profile_video_urls: _pvs, ...rest } = p;
  return {
    image_url: imageUrl,
    video_urls: videoUrls,
    ...rest,
  };
}

/**
 * Formats a user object for API response, including formatted profile fields.
 * Ensures consistent username selection and removes sensitive data.
 * @param {Object} user - Mongoose user document or plain object.
 * @returns {Object|null}
 */
function formatUserResponse(user, viewerId = null) {
  if (!user) return null;
  const userObj = typeof user.toObject === 'function' ? user.toObject() : { ...user };

  delete userObj.password;

  // Consistent username logic: fallback to name if username is missing/empty
  userObj.username = (userObj.username != null && String(userObj.username).trim() !== '')
    ? String(userObj.username).trim()
    : (userObj.name || '');

  if (userObj.profile) {
    userObj.profile = profileWithMediaUrls(userObj.profile);
  }

  // Privacy applies to OTHER people's view, never your own. Called without a
  // viewer it returns the full object, which is what /me and signin want; the
  // viewer argument is what makes it safe for someone else's profile.
  // `!viewerId` first, not `viewerId &&`. Getting this backwards meant a call
  // with no viewer treated the OWNER as a stranger: nine endpoints including
  // /users/me, signin and GET /api/profile hid an athlete's own club and
  // bodyweight from themselves. Worse, the settings form seeds from that
  // response, so an athlete in pounds who opened Edit Info and saved anything
  // wrote bodyweight_unit back as kg while keeping the lbs number, which
  // silently moved them to the wrong weight class.
  const isSelf = !viewerId || String(viewerId) === String(userObj._id);
  if (!isSelf && userObj.privacy) {
    if (userObj.privacy.hideBodyweight === true && userObj.profile) {
      // The weight class stays. It is what the athlete is ranked in, and the
      // profile is meaningless without it.
      delete userObj.profile.bodyweight_value;
      delete userObj.profile.bodyweight_unit;
    }
    if (userObj.privacy.hideClub === true && userObj.profile) {
      userObj.profile.club = null;
    }
  }
  // Nobody else's settings are anyone else's business.
  if (!isSelf) delete userObj.privacy;

  return userObj;
}

module.exports = { profileWithMediaUrls, formatUserResponse };
