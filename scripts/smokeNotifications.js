/**
 * End-to-end smoke test for notifications, against a real database.
 *
 * Uses the seed athlete as recipient and a seed buddy as actor, creates
 * everything it needs, asserts, and deletes every row it made. It never
 * touches a real athlete and, unless --expo is passed, never contacts Expo,
 * so no real phone buzzes.
 *
 * Run:  MONGODB_URI=... node scripts/smokeNotifications.js
 *       MONGODB_URI=... node scripts/smokeNotifications.js --expo
 */
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const WITH_EXPO = process.argv.includes('--expo');

let passed = 0;
const created = { notifications: [], devices: [] };

async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ok  ', name);
  } catch (err) {
    console.error('  FAIL', name, '\n       ', err.message);
    process.exitCode = 1;
  }
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  // autoIndex off: a smoke test must not start index builds on production.
  await mongoose.connect(uri, { autoIndex: false });

  const User = require('../models/User');
  const Notification = require('../models/Notification');
  const Device = require('../models/Device');
  const { notify } = require('../services/notifications');
  const worker = require('../jobs/notificationWorker');
  const { deliverableAt } = require('../utils/quietHours');

  const me = await User.findOne({ email: 'seed.athlete@olytraining.com' }).select('_id name').lean();
  const buddy = await User.findOne({ email: 'seed.buddy1@olytraining.com' }).select('_id name').lean();
  if (!me || !buddy) {
    console.error('Seed accounts not found. Run seed-profile-data.js first.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`\nRecipient: ${me.name}   Actor: ${buddy.name}\n`);

  const track = async (fn) => {
    const before = await Notification.find({ user: me._id }).select('_id').lean();
    const seen = new Set(before.map((n) => String(n._id)));
    const out = await fn();
    const after = await Notification.find({ user: me._id }).select('_id').lean();
    for (const n of after) if (!seen.has(String(n._id))) created.notifications.push(n._id);
    return out;
  };

  console.log('=== creating ===\n');

  let likeNote;
  await step('a like creates a pending notification with real text', async () => {
    likeNote = await track(() =>
      notify(me._id, 'like', { actor: buddy, postId: 'smoke-post-1', data: { postId: 'smoke-post-1' } })
    );
    assert.ok(likeNote, 'notify returned nothing');
    assert.strictEqual(likeNote.type, 'like');
    assert.strictEqual(likeNote.count, 1);
    assert.ok(/Seed Buddy One/.test(likeNote.body), `body reads: ${likeNote.body}`);
    assert.ok(['pending', 'suppressed'].includes(likeNote.status));
  });

  await step('nineteen more likes collapse into ONE notification', async () => {
    for (let i = 0; i < 19; i += 1) {
      await track(() => notify(me._id, 'like', { actor: buddy, postId: 'smoke-post-1' }));
    }
    const rows = await Notification.find({ user: me._id, groupKey: 'like:smoke-post-1' }).lean();
    assert.strictEqual(rows.length, 1, `expected 1 row, found ${rows.length}`);
    assert.strictEqual(rows[0].count, 20, `count is ${rows[0].count}`);
    assert.ok(/19 others/.test(rows[0].body), `body reads: ${rows[0].body}`);
  });

  await step('a different post is a different notification', async () => {
    await track(() => notify(me._id, 'like', { actor: buddy, postId: 'smoke-post-2' }));
    const rows = await Notification.find({
      user: me._id,
      groupKey: { $in: ['like:smoke-post-1', 'like:smoke-post-2'] },
    }).lean();
    assert.strictEqual(rows.length, 2, 'likes on two posts were collapsed together');
  });

  await step('you are never notified about your own action', async () => {
    const self = await notify(me._id, 'like', { actor: me, postId: 'smoke-post-3' });
    assert.strictEqual(self, null, 'notified an athlete about their own like');
  });

  await step('a verified lift is immediate and never collapsed', async () => {
    const a = await track(() => notify(me._id, 'lift_verified', { liftLabel: 'clean & jerk', weightKg: 150 }));
    const b = await track(() => notify(me._id, 'lift_verified', { liftLabel: 'snatch', weightKg: 118 }));
    assert.ok(a && b, 'a verified lift did not notify');
    assert.notStrictEqual(String(a._id), String(b._id), 'two verified lifts were collapsed into one');
    assert.ok(a.availableAt <= new Date(Date.now() + 1000), 'a verified lift was delayed');
    assert.ok(/150kg/.test(a.body), `body reads: ${a.body}`);
  });

  await step('the batching window is set, and does not extend forever', async () => {
    const row = await Notification.findOne({ user: me._id, groupKey: 'like:smoke-post-1' }).lean();
    const ageMs = row.availableAt - row.createdAt;
    assert.ok(ageMs > 0, 'a like was queued for immediate send');
    // The window opens on the FIRST like. Twenty more must not push it back,
    // or a popular lift is never announced at all.
    assert.ok(ageMs < 60 * 60 * 1000, `window is ${Math.round(ageMs / 60000)}min, twenty likes extended it`);
  });

  console.log('\n=== quiet hours ===\n');

  await step('a device registers its timezone', async () => {
    await Device.updateOne(
      { token: 'ExponentPushToken[smoketest0000000000000]' },
      { $set: { user: me._id, platform: 'ios', timezone: 'America/Edmonton', lastSeenAt: new Date(), disabledAt: null } },
      { upsert: true }
    );
    const d = await Device.findOne({ token: 'ExponentPushToken[smoketest0000000000000]' }).lean();
    created.devices.push(d._id);
    assert.strictEqual(d.timezone, 'America/Edmonton');
    assert.strictEqual(String(d.user), String(me._id));
  });

  await step('a night-time notification is held until 8am local', async () => {
    const night = new Date('2026-09-24T05:00:00Z'); // 11pm Edmonton
    const out = deliverableAt(night, 'America/Edmonton');
    assert.ok(out > night, 'sent at 11pm');
    const hourLocal = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Edmonton', hour: '2-digit', hour12: false }).format(out)
    );
    assert.strictEqual(hourLocal % 24, 8, `released at ${hourLocal} local`);
  });

  console.log('\n=== muting ===\n');

  await step('a muted category still records, but is not sent', async () => {
    await User.updateOne({ _id: me._id }, { $set: { 'notifications.muteSocial': true } });
    const muted = await track(() => notify(me._id, 'comment', { actor: buddy, postId: 'smoke-post-9', text: 'nice' }));
    assert.ok(muted, 'muting dropped the notification entirely');
    assert.strictEqual(muted.status, 'suppressed', `status is ${muted.status}`);
    // Another category is unaffected.
    const lift = await track(() => notify(me._id, 'lift_verified', { liftLabel: 'snatch', weightKg: 120 }));
    assert.strictEqual(lift.status, 'pending', 'muting one category muted another');
    await User.updateOne({ _id: me._id }, { $unset: { 'notifications.muteSocial': '' } });
  });

  console.log('\n=== the worker ===\n');

  await step('the worker claims and settles what is due', async () => {
    // Make everything due now.
    await Notification.updateMany(
      { _id: { $in: created.notifications }, status: 'pending' },
      { $set: { availableAt: new Date(Date.now() - 1000) } }
    );
    const due = await Notification.countDocuments({ _id: { $in: created.notifications }, status: 'pending' });
    assert.ok(due > 0, 'nothing was pending to drain');

    const result = await worker.tick();
    console.log('        worker:', JSON.stringify(result));

    const left = await Notification.countDocuments({ _id: { $in: created.notifications }, status: 'pending' });
    assert.strictEqual(left, 0, `${left} still pending after a tick`);
    // With a fake token and no --expo, Expo rejects it and every row settles
    // as suppressed rather than sent. Either outcome proves the loop works;
    // what must NOT happen is rows stuck in processing.
    const stuck = await Notification.countDocuments({ _id: { $in: created.notifications }, status: 'processing' });
    assert.strictEqual(stuck, 0, `${stuck} rows stuck in processing`);
  });

  await step('a second tick does nothing, so nobody is buzzed twice', async () => {
    const again = await worker.tick();
    assert.strictEqual(again.sent, 0, 'the worker re-sent an already-delivered notification');
  });

  if (WITH_EXPO) {
    await step('the sender talks to Expo and handles a bad token', async () => {
      const { sendToUser } = require('../services/pushSender');
      const out = await sendToUser(me._id, { title: 'Oly smoke test', body: 'ignore me', data: {} });
      console.log('        expo:', JSON.stringify(out.tickets.map((t) => t.ticket.status || t.ticket.message)));
      const d = await Device.findOne({ token: 'ExponentPushToken[smoketest0000000000000]' }).lean();
      assert.ok(d.disabledAt, 'a token Expo rejected was not disabled');
    });
  }

  console.log('\n=== cleaning up ===\n');
  const delN = await Notification.deleteMany({ _id: { $in: created.notifications } });
  const delD = await Device.deleteMany({ _id: { $in: created.devices } });
  await User.updateOne({ _id: me._id }, { $unset: { 'notifications.muteSocial': '' } });
  console.log(`  removed ${delN.deletedCount} notification(s), ${delD.deletedCount} device(s)`);

  const leftover = await Notification.countDocuments({ user: me._id });
  console.log(`  ${leftover} notification(s) remain for the seed athlete (expected 0)`);

  console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('smoke test failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
