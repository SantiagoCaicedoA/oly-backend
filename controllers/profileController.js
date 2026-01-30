const AthleteProfile = require('../models/AthleteProfile');
const { deepMerge } = require('../utils/mergeProfile');

// Optional initial profile fields on POST (create after signup). Signup itself is name, email, password on User.
const INITIAL_PROFILE_FIELDS = ['display_name', 'country', 'age'];

class ProfileController {
  /**
   * GET /api/profile – Get current user's profile
   */
  async getProfile(req, res, next) {
    try {
      const profile = await AthleteProfile.findOne({ user: req.user._id });

      if (!profile) {
        return res.status(200).json({
          success: true,
          data: null,
          message: 'No profile found. Create profile with POST /api/profile first.'
        });
      }

      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/profile – Create profile (call once after user signup).
   * Optional body: display_name, country, age. Signup is name, email, password on POST /api/users.
   */
  async createProfile(req, res, next) {
    try {
      const userId = req.user._id;

      const existingProfile = await AthleteProfile.findOne({ user: userId });
      if (existingProfile) {
        return res.status(400).json({
          success: false,
          message: 'Profile already exists. Use PUT /api/profile with full onboarding data.'
        });
      }

      const payload = {};
      for (const key of INITIAL_PROFILE_FIELDS) {
        if (req.body[key] !== undefined) payload[key] = req.body[key];
      }

      const profile = new AthleteProfile({
        user: userId,
        ...payload
      });
      await profile.save();

      res.status(201).json({
        success: true,
        data: profile,
        message: 'Profile created. Complete onboarding and send all data in one PUT /api/profile.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/profile – Update profile with full onboarding data in one hit.
   * Call once when user completes the 9th onboarding screen; send all 9 screens'
   * data in one request. Accepts full profile payload (merge into existing).
   * If no profile exists, one is created.
   */
  async updateProfile(req, res, next) {
    try {
      const userId = req.user._id;
      const body = { ...req.body };
      delete body.user; // never allow changing owner

      let profile = await AthleteProfile.findOne({ user: userId });

      if (profile) {
        const merged = deepMerge(profile.toObject(), body);
        delete merged._id;
        delete merged.__v;
        delete merged.user;
        delete merged.createdAt;
        delete merged.updatedAt;
        profile.set(merged);
        await profile.save();
      } else {
        profile = new AthleteProfile({
          user: userId,
          ...body
        });
        await profile.save();
      }

      res.status(200).json({
        success: true,
        data: profile,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProfileController();
