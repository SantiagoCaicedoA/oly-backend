const WeeklyTraining = require('../models/WeeklyTraining');
const { generateDailyAdjustment } = require('../services/openaiService');

/**
 * POST /api/daily/check-in
 * Body: { day: string, daily_check_in: { sleep_quality, stress_level, mental_readiness } }
 * Updates daily check-in and triggers AI adjustment if data is abnormal
 */
async function submitDailyCheckIn(req, res, next) {
  try {
    const userId = req.user._id;
    const { day, daily_check_in } = req.body;

    console.log('Daily check-in request:', { day, daily_check_in });

    // Validation
    if (!day || !daily_check_in) {
      return res.status(400).json({
        success: false,
        message: 'Missing "day" or "daily_check_in" in request body.',
      });
    }

    const {
      sleep_quality,
      stress_level,
      mental_readiness,
      motivation,
      muscle_soreness,
      sore_areas,
      intensity
    } = daily_check_in;

    // Validate required check-in values (only first 3 are required for abnormality check)
    if (typeof sleep_quality !== 'number' || sleep_quality < 1 || sleep_quality > 10 ||
      typeof stress_level !== 'number' || stress_level < 1 || stress_level > 10 ||
      typeof mental_readiness !== 'number' || mental_readiness < 1 || mental_readiness > 10) {
      return res.status(400).json({
        success: false,
        message: 'sleep_quality, stress_level, and mental_readiness must be numbers between 1 and 10.',
      });
    }

    // Get current week's training
    const doc = await WeeklyTraining.findOne({ user: userId }).sort({ week_start: -1 });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'No training week found for this user.',
      });
    }

    if (!doc.days[day]) {
      return res.status(400).json({
        success: false,
        message: `Day "${day}" does not exist in the current plan.`,
      });
    }

    // Update the daily check-in for the specific day with ALL fields
    doc.days[day].daily_check_in = {
      sleep_quality,
      stress_level,
      mental_readiness,
      motivation: motivation || 'Neutral',
      muscle_soreness: muscle_soreness || 0,
      sore_areas: Array.isArray(sore_areas) ? sore_areas : [],
      intensity: intensity || 0,
    };

    // Check for abnormal conditions using ONLY the original 3 fields
    const abnormalities = checkAbnormalConditions({ sleep_quality, stress_level, mental_readiness }, doc);

    let aiAdjustment = null;
    if (abnormalities.length > 0) {
      console.log('Abnormal conditions detected:', abnormalities);

      // Trigger AI adjustment for this specific day only
      try {
        aiAdjustment = await generateDailyAdjustment(day, { sleep_quality, stress_level, mental_readiness }, abnormalities, doc.days[day]);

        if (aiAdjustment && aiAdjustment.exercises) {
          // Update only this specific day with AI-generated exercises
          doc.days[day].exercises = aiAdjustment.exercises;
          doc.days[day].coach_note = aiAdjustment.coach_note || 'AI-adjusted based on your check-in';
          doc.days[day].key_cues = aiAdjustment.key_cues || [];
        }
      } catch (aiError) {
        console.error('AI adjustment failed:', aiError);
        // Continue without AI adjustment - still save check-in
      }
    }

    // Mark as modified and save
    doc.markModified(`days.${day}.daily_check_in`);
    if (aiAdjustment) {
      doc.markModified(`days.${day}.exercises`);
      doc.markModified(`days.${day}.coach_note`);
      doc.markModified(`days.${day}.key_cues`);
    }

    await doc.save();

    res.status(200).json({
      success: true,
      message: abnormalities.length > 0
        ? `Check-in submitted for ${day}. AI adjustments applied due to: ${abnormalities.join(', ')}`
        : `Check-in submitted for ${day}`,
      data: {
        day,
        daily_check_in: doc.days[day].daily_check_in,
        abnormalities_detected: abnormalities.length > 0,
        abnormalities,
        ai_adjustment_applied: !!aiAdjustment,
        updated_exercises: aiAdjustment ? doc.days[day].exercises : null,
      },
    });
  } catch (error) {
    console.error('Daily check-in error:', error);
    next(error);
  }
}

/**
 * Check for abnormal conditions that trigger AI adjustment
 */
function checkAbnormalConditions(checkIn, weeklyDoc) {
  const { sleep_quality, stress_level, mental_readiness } = checkIn;
  const abnormalities = [];

  // Critical: Sharp pain (would be reported as pain_level: "Sharp" in exercise logging)
  // This is handled separately in exercise logging

  // Critical: Recovery ≤ 3/10 + Mental ≥ 8/10 (absolute shit day)
  if (sleep_quality <= 3 && mental_readiness >= 8) {
    abnormalities.push('Low recovery with high mental readiness - potential overtraining risk');
  }

  // Check for 3+ consecutive bad sleep nights
  const consecutiveBadSleep = checkConsecutiveBadSleep(weeklyDoc, checkIn);
  if (consecutiveBadSleep >= 3) {
    abnormalities.push(`${consecutiveBadSleep} consecutive nights of poor sleep`);
  }

  // Check for 3+ days of high stress
  const consecutiveHighStress = checkConsecutiveHighStress(weeklyDoc, checkIn);
  if (consecutiveHighStress >= 3) {
    abnormalities.push(`${consecutiveHighStress} consecutive days of high stress`);
  }

  // Individual abnormal values
  if (sleep_quality <= 3) {
    abnormalities.push('Very poor sleep quality');
  }

  if (stress_level >= 8) {
    abnormalities.push('Very high stress level');
  }

  if (mental_readiness <= 3) {
    abnormalities.push('Very low mental readiness');
  }

  return abnormalities;
}

/**
 * Check consecutive bad sleep nights
 */
function checkConsecutiveBadSleep(weeklyDoc, currentCheckIn) {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let consecutiveCount = 0;

  // Start from current day and go backwards
  const today = new Date().getDay(); // 0 = Sunday, 6 = Saturday
  const todayName = dayNames[today];

  // Check current day
  if (currentCheckIn.sleep_quality <= 4) {
    consecutiveCount++;
  } else {
    return 0; // Reset if today is good
  }

  // Check previous days (simplified - in production, you'd check actual dates)
  for (let i = 1; i <= 6; i++) {
    const prevDayIndex = (today - i + 7) % 7;
    const prevDayName = dayNames[prevDayIndex];

    if (weeklyDoc.days[prevDayName]?.daily_check_in?.sleep_quality <= 4) {
      consecutiveCount++;
    } else {
      break; // Stop counting when we hit a good day
    }
  }

  return consecutiveCount;
}

/**
 * Check consecutive high stress days
 */
function checkConsecutiveHighStress(weeklyDoc, currentCheckIn) {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let consecutiveCount = 0;

  // Start from current day and go backwards
  const today = new Date().getDay();
  const todayName = dayNames[today];

  // Check current day
  if (currentCheckIn.stress_level >= 7) {
    consecutiveCount++;
  } else {
    return 0; // Reset if today is good
  }

  // Check previous days
  for (let i = 1; i <= 6; i++) {
    const prevDayIndex = (today - i + 7) % 7;
    const prevDayName = dayNames[prevDayIndex];

    if (weeklyDoc.days[prevDayName]?.daily_check_in?.stress_level >= 7) {
      consecutiveCount++;
    } else {
      break; // Stop counting when we hit a good day
    }
  }

  return consecutiveCount;
}

module.exports = { submitDailyCheckIn };
