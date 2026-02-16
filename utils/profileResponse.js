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
function formatUserResponse(user) {
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

  return userObj;
}

module.exports = { profileWithMediaUrls, formatUserResponse };
