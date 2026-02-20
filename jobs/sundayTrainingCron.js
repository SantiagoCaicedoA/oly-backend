/**
 * Sunday cron: pre-generate next week's training for all users who have onboarding complete.
 * Run at midnight Sunday (0 0 * * 0). Change takes effect from next week; current week stays as-is.
 */

const User = require('../models/User');
const WeeklyTraining = require('../models/WeeklyTraining');
const { generateNextWeekForUser, canGenerateWeek } = require('../services/generateTrainingWeek');
const { getNextWeekStart } = require('../services/trainingWeekService');

async function runSundayCron() {
  const now = new Date();
  const nextWeekStart = getNextWeekStart(now);

  const users = await User.find({
    'profile.availability.training_days_per_week': { $exists: true, $gte: 1 },
  }).lean();

  const results = await Promise.allSettled(
    users.map(async (u) => {
      const existing = await WeeklyTraining.findOne({
        user: u._id,
        week_start: nextWeekStart,
      });
      if (existing) return { userId: u._id, skipped: true };
      const userDoc = await User.findById(u._id);
      if (!userDoc || !canGenerateWeek(userDoc.profile)) return { userId: u._id, skipped: true };
      await generateNextWeekForUser(userDoc);
      return { userId: u._id, ok: true };
    })
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) console.error('Sunday cron: some users failed', failed.map((f) => f.reason));
  return { total: users.length, failed: failed.length };
}

module.exports = { runSundayCron };
