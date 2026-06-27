const User = require('../models/User');
const WeeklyTraining = require('../models/WeeklyTraining');
const { deepMerge } = require('../utils/mergeProfile');
const { normalizeProfilePayload } = require('../utils/normalizeProfileEnums');
const { formatUserResponse } = require('../utils/profileResponse');
const { uploadProfileImage, uploadProfileVideo } = require('../services/s3Service');
const { generateFirstWeek, canGenerateWeek } = require('../services/generateTrainingWeek');

const INITIAL_PROFILE_FIELDS = ['display_name', 'country', 'age'];

function hasProfileData(profile) {
  if (!profile || typeof profile !== 'object') return false;
  return Object.keys(profile).length > 0;
}


class ProfileController {
  /**
   * GET /api/profile – Get current user's profile (from same User document)
   */
  async getProfile(req, res, next) {
    try {
      const profile = req.user.profile;

      if (!hasProfileData(profile)) {
        return res.status(200).json({
          success: true,
          data: formatUserResponse(req.user),
          message: 'No profile found. Create profile with POST /api/profile first.',
        });
      }

      res.status(200).json({
        success: true,
        data: formatUserResponse(req.user),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/profile – Create profile (call once after signup).
   * Optional body: display_name, country, age.
   */
  async createProfile(req, res, next) {
    try {
      if (hasProfileData(req.user.profile)) {
        return res.status(400).json({
          success: false,
          message: 'Profile already exists. Use PUT /api/profile with full onboarding data.',
        });
      }

      const payload = {};
      for (const key of INITIAL_PROFILE_FIELDS) {
        if (req.body[key] !== undefined) payload[key] = req.body[key];
      }
      normalizeProfilePayload(payload);

      req.user.profile = payload;
      await req.user.save();

      res.status(201).json({
        success: true,
        data: formatUserResponse(req.user),
        message: 'Profile created. Complete onboarding and send all data in one PUT /api/profile.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/profile/upload-image – Upload image to S3, save URL to athlete profile.
   * Expects multipart form field "image". Returns URL and updated profile.
   */
  async uploadProfileImage(req, res, next) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided. Send multipart form with field "image".',
        });
      }

      const url = await uploadProfileImage(
        req.file.buffer,
        req.file.mimetype,
        String(req.user._id)
      );

      const current =
        req.user.profile && typeof req.user.profile.toObject === 'function'
          ? req.user.profile.toObject()
          : req.user.profile
            ? { ...req.user.profile }
            : {};
      req.user.profile = { ...current, profile_image_url: url };
      await req.user.save();

      res.status(200).json({
        success: true,
        url,
        data: formatUserResponse(req.user),
        message: 'Profile image uploaded and saved.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/profile/upload-video – Upload profile video to S3, save URL to athlete profile.
   * Expects multipart form field "video". Returns URL and updated profile (with video_url in data).
   */
  async uploadProfileVideo(req, res, next) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          success: false,
          message: 'No video file provided. Send multipart form with field "video".',
        });
      }

      let url;
      try {
        url = await uploadProfileVideo(
          req.file.buffer,
          req.file.mimetype,
          String(req.user._id)
        );
      } catch (s3Err) {
        const msg = s3Err.message || 'Video upload failed';
        const isNetwork = /network|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg);
        return res.status(isNetwork ? 503 : 400).json({
          success: false,
          message: isNetwork ? 'Video upload failed (network/connection). Check internet and try again.' : msg,
        });
      }

      const current =
        req.user.profile && typeof req.user.profile.toObject === 'function'
          ? req.user.profile.toObject()
          : req.user.profile
            ? { ...req.user.profile }
            : {};
      const existingUrls = Array.isArray(current.profile_video_urls) ? [...current.profile_video_urls] : [];
      if (current.profile_video_url && !existingUrls.includes(current.profile_video_url)) {
        existingUrls.push(current.profile_video_url);
      }
      existingUrls.push(url);
      req.user.profile = {
        ...current,
        profile_video_url: url,
        profile_video_urls: existingUrls,
      };
      await req.user.save();

      return res.status(200).json({
        success: true,
        url,
        video_urls: existingUrls,
        data: formatUserResponse(req.user),
        message: 'Profile video uploaded and saved.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/profile – Update profile with full onboarding data in one hit.
   * Call once on 9th onboarding screen with all 9 screens' data.
   */
  async updateProfile(req, res, next) {
    try {
      const body = { ...req.body };
      delete body.user;

      // The @handle is a top-level User field, NOT part of the embedded profile.
      // Onboarding sends it as user_name (or username); persist it on the user so
      // it is not silently dropped by the strict profile schema.
      const incomingUsername = body.user_name ?? body.username;
      if (incomingUsername != null && String(incomingUsername).trim() !== '') {
        req.user.username = String(incomingUsername).trim();
      }
      delete body.user_name;
      delete body.username;

      normalizeProfilePayload(body);

      const current =
        req.user.profile && typeof req.user.profile.toObject === 'function'
          ? req.user.profile.toObject()
          : req.user.profile
            ? { ...req.user.profile }
            : {};
      const merged = deepMerge(current, body);
      req.user.profile = merged;
      await req.user.save();

      let message = 'Profile updated successfully';
      if (body.availability && (body.availability.training_days_per_week != null || (body.availability.preferred_rest_days && body.availability.preferred_rest_days.length))) {
        const n = merged.availability?.training_days_per_week;
        if (typeof n === 'number') message = `Profile updated. Your next training week will have ${n} session${n !== 1 ? 's' : ''}.`;
      }

      if (canGenerateWeek(req.user.profile)) {
        const existing = await WeeklyTraining.findOne({ user: req.user._id });
        if (!existing) {
          try {
            await generateFirstWeek(req.user);
            message = 'Profile updated and training plan generated successfully.';
          } catch (err) {
            console.error('Generate first week failed', err);
            message = 'Profile updated, but there was an issue generating your training plan. We will retry shortly.';
          }
        }
      }

      res.status(200).json({
        success: true,
        data: formatUserResponse(req.user),
        message,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProfileController();
