const { strengthStatsToSectioned } = require('./normalizeProfileEnums');

/**
 * Shape profile for API response: always include image_url and video_url (mapped from profile_image_url, profile_video_url).
 * Both keys are always present so the frontend can rely on them.
 * strength_stats is always returned in sectioned format (classic, variation, squat, press).
 */
function profileWithMediaUrls(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const p = typeof profile.toObject === 'function' ? profile.toObject() : { ...profile };

  const imageUrl = (p.profile_image_url != null && String(p.profile_image_url).trim() !== '')
    ? String(p.profile_image_url)
    : '';
  const videoUrl = (p.profile_video_url != null && String(p.profile_video_url).trim() !== '')
    ? String(p.profile_video_url)
    : '';

  if (p.strength_stats != null) {
    p.strength_stats = strengthStatsToSectioned(p.strength_stats);
  }

  // Return with image_url and video_url first so they are always present in the response
  return {
    image_url: imageUrl,
    video_url: videoUrl,
    ...p,
  };
}

module.exports = { profileWithMediaUrls };
