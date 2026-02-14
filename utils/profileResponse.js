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

module.exports = { profileWithMediaUrls };
