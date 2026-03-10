/**
 * Daily 4 AM cron: Marks training days as complete if at least one set was logged.
 * Runs every day at 4 AM (0 4 * * *).
 */

const WeeklyTraining = require('../models/WeeklyTraining');
const SetLog = require('../models/SetLog');

async function runDailyCompletionCron() {
  try {
    const yesterday = new Date();
    // For 4 AM run, "yesterday" is indeed the previous calendar day
    yesterday.setDate(yesterday.getDate() - 1);
    const dayName = yesterday.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    console.log(`Running daily completion cron for ${dayName}, looking for completed sets.`);

    // 1. Find all WeeklyTraining docs that might be active (recent ones)
    // We look for docs from the last 2 weeks to be safe, but usually it's the latest one per user.
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const docs = await WeeklyTraining.find({
      week_start: { $gte: twoWeeksAgo }
    });

    console.log(`Checking ${docs.length} weekly training documents for ${dayName} completion.`);

    let updatedCount = 0;
    const results = [];

    for (const doc of docs) {
      const dayData = doc.days[dayName];
      if (!dayData || dayData.type !== 'training' || !dayData.exercises) continue;

      // Check if any set in any exercise is complete
      let anySetComplete = false;
      let totalCompletedSets = 0;

      for (const exercise of dayData.exercises) {
        if (!exercise.sets) continue;
        for (const set of exercise.sets) {
          if (set.isComplete === true) {
            anySetComplete = true;
            totalCompletedSets++;
          }
        }
      }

      if (anySetComplete) {
        // Mark the day as complete
        if (!doc.days[dayName].completion) {
          doc.days[dayName].completion = { isComplete: false };
        }

        doc.days[dayName].completion.isComplete = true;
        doc.days[dayName].completion.completed_at = new Date();
        doc.days[dayName].completion.sets_logged = totalCompletedSets;

        doc.markModified(`days.${dayName}.completion`);
        await doc.save();

        updatedCount++;
        results.push({ userId: doc.user, day: dayName, sets: totalCompletedSets });
      }
    }

    console.log(`Daily completion cron done. Updated ${updatedCount} users.`);
    return {
      success: true,
      updated: updatedCount,
      details: results
    };

  } catch (error) {
    console.error('Daily completion cron error:', error);
    throw error;
  }
}

module.exports = { runDailyCompletionCron };
