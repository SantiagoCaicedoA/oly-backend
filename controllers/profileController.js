const User = require('../models/User');
const { deepMerge } = require('../utils/mergeProfile');
const { normalizeProfilePayload } = require('../utils/normalizeProfileEnums');

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
          data: null,
          message: 'No profile found. Create profile with POST /api/profile first.',
        });
      }

      res.status(200).json({
        success: true,
        data: profile,
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
        data: req.user.profile,
        message: 'Profile created. Complete onboarding and send all data in one PUT /api/profile.',
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

      res.status(200).json({
        success: true,
        data: req.user.profile,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProfileController();
