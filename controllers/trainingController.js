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

/**
 * PATCH /api/training/log
 * Body: { day: string, exercises: Array }
 * Updates the exercises for a specific day in the latest weekly training document.
 */
async function logActivity(req, res, next) {
  try {
    const userId = req.user._id;
    const { day, exercises } = req.body;

    console.log('Request body:', req.body);
    console.log('Day:', day);
    console.log('Exercises:', exercises);

    if (!day || !Array.isArray(exercises)) {
      console.log('Validation failed: day or exercises missing/invalid');
      return res.status(400).json({
        success: false,
        message: 'Missing "day" (string) or "exercises" (array) in request body.',
      });
    }

    const doc = await WeeklyTraining.findOne({ user: userId }).sort({ week_start: -1 });
    console.log('Found doc:', doc ? 'Yes' : 'No');

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'No weekly training document found for this user.',
      });
    }

    console.log('Day data:', doc.days[day]);
    console.log('Day type:', doc.days[day]?.type);

    if (!doc.days[day] || doc.days[day].type === 'rest') {
      console.log('Day validation failed');
      return res.status(400).json({
        success: false,
        message: `Day "${day}" is not a training day or does not exist in the current plan.`,
      });
    }

    // Update the specific exercise for the specified day
    // Find and update only the exercise that matches exercise_name
    const updatedExercises = doc.days[day].exercises.map((existingEx) => {
      const incomingExercise = exercises.find((ex) => ex.exercise_name === existingEx.exercise_name);
      if (incomingExercise) {
        // Update this exercise with new data, preserving existing coach_note
        const updatedSets = existingEx.sets.map((existingSet) => {
          const incomingSet = incomingExercise.sets.find((s) => s.set_number === existingSet.set_number);
          if (incomingSet) {
            // Update this specific set, preserving existing coach_prescription and key_cues
            return {
              set_number: existingSet.set_number,
              weight: incomingSet.weight,
              reps: incomingSet.reps,
              rpm_percent: incomingSet.rpm_percent,
              coach_prescription: incomingSet.coach_prescription || existingSet.coach_prescription,
              key_cues: incomingSet.key_cues || existingSet.key_cues,
              bar_speed: incomingSet.bar_speed || '',
              position_quality: incomingSet.position_quality || '',
              was_it_a_miss: incomingSet.was_it_a_miss || false,
              where_did_it_fail: incomingSet.where_did_it_fail || '',
              missed_where: incomingSet.missed_where || '',
              any_pain_or_discomfort: incomingSet.any_pain_or_discomfort || false,
              pain_level: incomingSet.pain_level || '',
              pain_where: Array.isArray(incomingSet.pain_where) ? incomingSet.pain_where : existingSet.pain_where,
            };
          }
          // Keep existing set if no update for this set
          return existingSet;
        });

        // Add any new sets that weren't in existing exercise
        const newSets = incomingExercise.sets.filter((incomingSet) =>
          !existingEx.sets.some((existingSet) => existingSet.set_number === incomingSet.set_number)
        ).map((s) => ({
          set_number: s.set_number,
          weight: s.weight,
          reps: s.reps,
          rpm_percent: s.rpm_percent,
          coach_prescription: s.coach_prescription || '',
          key_cues: Array.isArray(s.key_cues) ? s.key_cues : [],
          bar_speed: s.bar_speed || '',
          position_quality: s.position_quality || '',
          was_it_a_miss: s.was_it_a_miss || false,
          where_did_it_fail: s.where_did_it_fail || '',
          missed_where: s.missed_where || '',
          any_pain_or_discomfort: s.any_pain_or_discomfort || false,
          pain_level: s.pain_level || '',
          pain_where: Array.isArray(s.pain_where) ? s.pain_where : [],
        }));

        return {
          exercise_name: existingEx.exercise_name,
          time: incomingExercise.time || existingEx.time,
          no_of_set: incomingExercise.no_of_set || existingEx.no_of_set,
          coach_note: existingEx.coach_note, // Preserve existing coach_note
          sets: [...updatedSets, ...newSets],
        };
      }
      // Return existing exercise if no update for this one
      return existingEx;
    });

    doc.days[day].exercises = updatedExercises;

    // Mark as modified since it's a Mixed type or Nested object
    doc.markModified(`days.${day}.exercises`);
    await doc.save();

    res.status(200).json({
      success: true,
      message: `Activity logged for ${day} successfully.`,
      data: doc.days[day],
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { generate, getWeek, logActivity };
