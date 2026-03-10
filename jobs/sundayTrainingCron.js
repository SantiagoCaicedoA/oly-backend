/**
 * Sunday cron: pre-generate next week's training for all users who have onboarding complete.
 * Run at midnight Sunday (0 0 * * 0). Change takes effect from next week; current week stays as-is.
 */

const User = require('../models/User');
const WeeklyTraining = require('../models/WeeklyTraining');
const { generateNextWeekForUser, canGenerateWeek } = require('../services/generateTrainingWeek');
const { getNextWeekStart } = require('../services/trainingWeekService');

async function runSundayCron() {
  console.log('=== SUNDAY CRON: Starting AI Training Week Generation ===');
  const now = new Date();
  const nextWeekStart = getNextWeekStart(now);
  console.log(`Current time: ${now.toISOString()}`);
  console.log(`Generating training for week starting: ${nextWeekStart.toISOString()}`);

  const users = await User.find({
    'profile.availability.training_days_per_week': { $exists: true, $gte: 1 },
  }).lean();

  console.log(`Found ${users.length} users with completed onboarding`);

  const results = await Promise.allSettled(
    users.map(async (u) => {
      console.log(`Processing user: ${u._id} (${u.name || u.email})`);

      const existing = await WeeklyTraining.findOne({
        user: u._id,
        week_start: nextWeekStart,
      });
      if (existing) {
        console.log(`User ${u._id}: Week already exists, skipping`);
        return { userId: u._id, skipped: true, reason: 'Week already exists' };
      }

      const userDoc = await User.findById(u._id);
      if (!userDoc || !canGenerateWeek(userDoc.profile)) {
        console.log(`User ${u._id}: Cannot generate week - incomplete profile`);
        return { userId: u._id, skipped: true, reason: 'Incomplete profile' };
      }

      console.log(`User ${u._id}: Generating AI training week...`);
      const generatedWeek = await generateNextWeekForUser(userDoc);

      // Log the generated training data
      console.log(`=== AI GENERATED TRAINING DATA FOR USER ${u._id} ===`);
      console.log(`Week Start: ${generatedWeek.week_start}`);
      console.log(`Is First Week: ${generatedWeek.is_first_week}`);
      console.log(`Profile Snapshot:`, generatedWeek.profile_snapshot);

      Object.keys(generatedWeek.days || {}).forEach(day => {
        const dayData = generatedWeek.days[day];
        console.log(`\n--- ${day.toUpperCase()} ---`);
        console.log(`Type: ${dayData.type}`);

        if (dayData.type === 'training' && dayData.exercises) {
          console.log(`Exercises: ${dayData.exercises.length}`);
          dayData.exercises.forEach((exercise, idx) => {
            console.log(`  ${idx + 1}. ${exercise.exercise_name} (${exercise.no_of_set} sets)`);
            if (exercise.sets) {
              exercise.sets.forEach((set, setIdx) => {
                console.log(`     Set ${set.set_number}: ${set.weight}kg x ${set.reps} reps ${set.isComplete ? '(completed)' : '(pending)'}`);
              });
            }
          });
        } else {
          console.log('Rest day');
        }
      });

      console.log(`=== END TRAINING DATA FOR USER ${u._id} ===\n`);

      return { userId: u._id, ok: true, weekStart: generatedWeek.week_start, daysGenerated: Object.keys(generatedWeek.days).length };
    })
  );

  const successful = results.filter(r => r.status === 'fulfilled' && r.value.ok);
  const skipped = results.filter(r => r.status === 'fulfilled' && r.value.skipped);
  const failed = results.filter((r) => r.status === 'rejected');

  console.log(`=== SUNDAY CRON SUMMARY ===`);
  console.log(`Total users: ${users.length}`);
  console.log(`Successfully generated: ${successful.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\n=== SUCCESSFUL GENERATIONS ===');
    successful.forEach(r => {
      const result = r.value;
      console.log(`User ${result.userId}: Week ${result.weekStart}, ${result.daysGenerated} days generated`);
    });
  }

  if (skipped.length > 0) {
    console.log('\n=== SKIPPED USERS ===');
    skipped.forEach(r => {
      const result = r.value;
      console.log(`User ${result.userId}: ${result.reason}`);
    });
  }

  if (failed.length) {
    console.error('\n=== FAILED USERS ===');
    console.error('Sunday cron: some users failed', failed.map((f) => f.reason));
  }

  return { total: users.length, successful: successful.length, skipped: skipped.length, failed: failed.length };
}

module.exports = { runSundayCron };
