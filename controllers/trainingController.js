const WeeklyTraining = require('../models/WeeklyTraining');
const { generateTrainingResponse } = require('../services/openaiService');
const { normalizeWorkoutTabData } = require('../utils/workoutTabSchema');

/**
 * POST /api/training/generate
 * Body: { request: string, feedback?: string, response_format?: 'workout_tab' }
 * When response_format is 'workout_tab', returns structured data for app screens (coach_note, key_cues, todays_training, etc.).
 */
async function generate(req, res, next) {
  try {
    const { request, feedback, response_format } = req.body;
    if (!request || typeof request !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Request body must include "request" (string). Optional: "feedback" (string), "response_format" ("workout_tab" for app screen JSON).',
      });
    }
    const trimmedRequest = request.trim();
    if (!trimmedRequest) {
      return res.status(400).json({
        success: false,
        message: '"request" cannot be empty.',
      });
    }

    const profile = req.user?.profile || null;
    const result = await generateTrainingResponse({
      profile,
      request: trimmedRequest,
      feedback: typeof feedback === 'string' ? feedback.trim() : undefined,
      responseFormat: response_format === 'workout_tab' ? 'workout_tab' : undefined,
    });

    const isWorkoutTab = response_format === 'workout_tab';
    if (isWorkoutTab) {
      let data = null;
      try {
        data = JSON.parse(result.content);
      } catch {
        data = null;
      }
      const normalized = normalizeWorkoutTabData(data);
      return res.status(200).json({
        success: true,
        data: normalized,
        usage: result.usage,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        output: result.content,
        usage: result.usage,
      },
    });
  } catch (err) {
    if (err.message && err.message.includes('OPENAI_API_KEY')) {
      return res.status(503).json({
        success: false,
        message: 'Training AI is not configured. OPENAI_API_KEY is missing.',
      });
    }
    next(err);
  }
}

/**
 * GET /api/training/week – Current user's stored week (monday..sunday with training or rest).
 * Returns the latest week for the user (avoids date/timezone exact-match issues).
 */
async function getWeek(req, res, next) {
  try {
    const userId = req.user._id;
    const doc = await WeeklyTraining.findOne({ user: userId })
      .sort({ week_start: -1 })
      .lean();

    if (!doc) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No training week yet. Complete onboarding to generate your first week, or it may still be generating.',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        week_start: doc.week_start,
        days: doc.days,
        is_first_week: doc.is_first_week,
        profile_snapshot: doc.profile_snapshot,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { generate, getWeek };
