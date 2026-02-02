/**
 * One-time migration: copy AthleteProfile data into User.profile for each user.
 * Run once after switching to embedded profile: node scripts/migrate-profile-to-user.js
 * Requires: MONGODB_URI in .env
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oly-backend';

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const athleteprofiles = db.collection('athleteprofiles');

  const cursor = athleteprofiles.find({});
  let count = 0;
  for await (const doc of cursor) {
    const userId = doc.user;
    if (!userId) continue;
    const { user, _id, __v, createdAt, updatedAt, ...profileData } = doc;
    await users.updateOne(
      { _id: userId },
      { $set: { profile: profileData } }
    );
    count++;
    console.log('Migrated profile for user', userId);
  }
  console.log('Done. Migrated', count, 'profiles.');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
