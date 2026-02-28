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
 * GET /api/training/week
 * Returns the latest weekly training data for the authenticated user.
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
              intent: incomingSet.intent || existingSet.intent || '',
              context: incomingSet.context || existingSet.context || '',
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
          intent: s.intent || '',
          context: s.context || '',
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
          time: existingEx.time, // Preserve existing time, don't update from payload
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

module.exports = { generate, getWeek, logActivity, addCustomSet, deleteCustomSet };

/**
 * POST /api/training/week/custom-set
 * Body: { day: string, exercise_index: number }
 * Duplicates the last AI set and adds it to the main sets array.
 */
async function addCustomSet(req, res, next) {
  try {
    const userId = req.user._id;
    const { day, exercise_index } = req.body;

    if (!day || typeof day !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing "day" (string) in request body.',
      });
    }

    if (typeof exercise_index !== 'number' || exercise_index < 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid "exercise_index" (number) in request body.',
      });
    }

    const doc = await WeeklyTraining.findOne({ user: userId }).sort({ week_start: -1 });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'No weekly training document found for this user.',
      });
    }

    if (!doc.days[day] || !doc.days[day].exercises) {
      return res.status(400).json({
        success: false,
        message: `Day "${day}" does not exist or has no exercises.`,
      });
    }

    const exercises = doc.days[day].exercises;
    if (exercise_index >= exercises.length) {
      return res.status(404).json({
        success: false,
        message: `Exercise at index ${exercise_index} not found.`,
      });
    }

    // Get the exercise
    const exercise = exercises[exercise_index];

    // Initialize sets array if not exists
    if (!exercise.sets) {
      exercise.sets = [];
    }

    // Get the last set to duplicate
    const sets = exercise.sets;
    if (sets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No existing sets found to duplicate.',
      });
    }

    // Duplicate the last set with DEEP COPY to prevent shared references
    const lastSet = sets[sets.length - 1];
    const newSet = JSON.parse(JSON.stringify(lastSet.toObject()));
    delete newSet._id; // Let MongoDB generate new _id
    newSet.set_number = sets.length + 1;

    // Add to main sets array
    sets.push(newSet);

    // Update no_of_set count
    exercise.no_of_set = sets.length;

    // Mark as modified
    doc.markModified(`days.${day}.exercises.${exercise_index}.sets`);
    doc.markModified(`days.${day}.exercises.${exercise_index}.no_of_set`);
    await doc.save();

    res.status(201).json({
      success: true,
      message: `Set duplicated and added successfully.`,
      data: {
        set: newSet,
        total_sets: sets.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/training/week/custom-set
 * Body: { day: string, exercise_index: number, set_index: number }
 * Deletes a set from the main sets array (deletes the last set if set_index not provided).
 */
async function deleteCustomSet(req, res, next) {
  try {
    const userId = req.user._id;
    const { day, exercise_index, set_index } = req.body;

    if (!day || typeof day !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing "day" (string) in request body.',
      });
    }

    if (typeof exercise_index !== 'number' || exercise_index < 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid "exercise_index" (number) in request body.',
      });
    }

    const doc = await WeeklyTraining.findOne({ user: userId }).sort({ week_start: -1 });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'No weekly training document found for this user.',
      });
    }

    if (!doc.days[day] || !doc.days[day].exercises) {
      return res.status(404).json({
        success: false,
        message: `Day "${day}" does not exist or has no exercises.`,
      });
    }

    const exercises = doc.days[day].exercises;
    if (exercise_index >= exercises.length) {
      return res.status(404).json({
        success: false,
        message: `Exercise at index ${exercise_index} not found.`,
      });
    }

    const exercise = exercises[exercise_index];
    const sets = exercise.sets || [];

    if (sets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No sets found to delete.',
      });
    }

    // Determine which set to delete (default to last set if not specified)
    const indexToDelete = typeof set_index === 'number' && set_index >= 0 && set_index < sets.length
      ? set_index
      : sets.length - 1;

    if (indexToDelete < 0 || indexToDelete >= sets.length) {
      return res.status(404).json({
        success: false,
        message: `Set at index ${indexToDelete} not found.`,
      });
    }

    // Remove the set at the specified index
    const deletedSet = sets.splice(indexToDelete, 1)[0];

    // Renumber remaining sets
    sets.forEach((set, idx) => {
      set.set_number = idx + 1;
    });

    // Update no_of_set count
    exercise.no_of_set = sets.length;

    // Mark as modified
    doc.markModified(`days.${day}.exercises.${exercise_index}.sets`);
    doc.markModified(`days.${day}.exercises.${exercise_index}.no_of_set`);
    await doc.save();

    res.status(200).json({
      success: true,
      message: `Set deleted successfully.`,
      data: {
        deleted_set: deletedSet,
        total_sets: sets.length,
      },
    });
  } catch (error) {
    next(error);
  }
}
