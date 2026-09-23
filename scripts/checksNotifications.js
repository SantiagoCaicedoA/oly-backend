/**
 * Notification rules that would fail quietly.
 *
 * Nothing here throws when it breaks. A muted category that reads as muted
 * for everyone, a quiet-hours window computed in the wrong zone, a backoff
 * that burns five attempts in five seconds — each of those just means
 * somebody stops getting notified, or gets buzzed at 3am and turns them off
 * for good. Push permission is granted once and never again.
 *
 * Run: node scripts/checksNotifications.js
 */
const assert = require('assert');
const { TYPES, TYPE_NAMES, isType, typeConfig } = require('../utils/notificationTypes');
const { deliverableAt, localHour } = require('../utils/quietHours');
const { CATEGORY } = require('../services/notifications');
const { DEFAULTS } = require('../controllers/notificationController');
const worker = require('../jobs/notificationWorker');
const Notification = require('../models/Notification');
const Device = require('../models/Device');
const User = require('../models/User');

let passed = 0;
function step(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok  ', name);
  } catch (err) {
    console.error('  FAIL', name, '\n       ', err.message);
    process.exitCode = 1;
  }
}

console.log('=== the registry ===\n');

step('every type has a category, or it can never be muted', () => {
  for (const t of TYPE_NAMES) {
    assert.ok(CATEGORY[t], `${t} belongs to no preference category`);
    assert.ok(
      ['muteSocial', 'muteLifts', 'muteRank'].includes(CATEGORY[t]),
      `${t} maps to an unknown category`
    );
  }
  for (const t of Object.keys(CATEGORY)) {
    assert.ok(isType(t), `${t} has a category but is not a real type`);
  }
});

step('every type renders a title and a body, singular and collapsed', () => {
  const payload = {
    actor: { name: 'Gina' },
    postId: 'p1',
    liftLabel: 'clean & jerk',
    weightKg: 150,
    weightClass: 'M 94',
    rank: 3,
    places: 2,
    gapKg: 2,
    text: 'strong',
    reason: 'video too dark',
  };
  for (const t of TYPE_NAMES) {
    for (const count of [1, 2, 20]) {
      const r = typeConfig(t).render({ ...payload, count });
      assert.ok(r && r.title && r.body, `${t} rendered nothing at count ${count}`);
      assert.ok(r.body.length < 180, `${t} body is too long for a push payload`);
      assert.ok(!/undefined|NaN|\[object/.test(r.body), `${t} body has a hole: ${r.body}`);
      assert.ok(!/undefined|NaN/.test(r.title), `${t} title has a hole: ${r.title}`);
    }
  }
});

step('a burst collapses into one notification that says how many', () => {
  const twenty = TYPES.like.render({ actor: { name: 'Gina' }, count: 20 });
  assert.ok(/19 others/.test(twenty.body), `twenty likes should read as a group: ${twenty.body}`);
  const one = TYPES.like.render({ actor: { name: 'Gina' }, count: 1 });
  assert.ok(!/others/.test(one.body), `one like should not: ${one.body}`);
});

step('a missing actor name never renders as "undefined liked your lift"', () => {
  for (const actor of [null, undefined, {}, { name: '' }]) {
    const r = TYPES.like.render({ actor, count: 1 });
    assert.ok(/Someone/.test(r.body), `bad actor rendered as: ${r.body}`);
  }
});

step('the two types that must not wait, do not wait', () => {
  // A verified lift is the payoff for the highest-effort thing in the app.
  assert.strictEqual(TYPES.lift_verified.delayMs, 0);
  assert.strictEqual(TYPES.lift_verified.quiet, false);
  assert.strictEqual(TYPES.lift_verified.groupKey, null, 'a verified lift must never be collapsed');
});

step('everything social is batched, or one popular lift is twenty buzzes', () => {
  for (const t of ['like', 'comment', 'follow']) {
    assert.ok(typeConfig(t).groupKey, `${t} has no group key`);
    assert.ok(typeConfig(t).delayMs > 0, `${t} sends immediately`);
    assert.strictEqual(typeConfig(t).quiet, true, `${t} can wake somebody at 3am`);
  }
  // Likes group per post, follows per person.
  assert.strictEqual(TYPES.like.groupKey({ postId: 'p1' }), 'like:p1');
  assert.notStrictEqual(TYPES.like.groupKey({ postId: 'p1' }), TYPES.like.groupKey({ postId: 'p2' }));
  assert.strictEqual(TYPES.follow.groupKey({}), 'follow');
});

step('proximity has a cooldown, because it fires on every lift in the class', () => {
  assert.ok(TYPES.proximity.cooldownMs >= 24 * 60 * 60 * 1000, 'cooldown is too short to matter');
});

console.log('\n=== quiet hours ===\n');

step('10pm to 8am is 10pm where the ATHLETE is', () => {
  // Calgary and Cali are three hours apart and both have Oly users.
  const night = new Date('2026-09-24T05:00:00Z'); // 11pm in Edmonton
  assert.strictEqual(localHour(night, 'America/Edmonton'), 23);
  const held = deliverableAt(night, 'America/Edmonton');
  assert.ok(held > night, 'a notification at 11pm was sent immediately');
  assert.strictEqual(localHour(held, 'America/Edmonton'), 8, 'not released at 8am local');

  // The same instant is 12am in Bogota, also quiet.
  assert.strictEqual(localHour(night, 'America/Bogota'), 0);
  assert.strictEqual(localHour(deliverableAt(night, 'America/Bogota'), 'America/Bogota'), 8);
});

step('daytime is not delayed', () => {
  const noon = new Date('2026-09-23T18:00:00Z'); // 12pm Edmonton
  assert.strictEqual(deliverableAt(noon, 'America/Edmonton').getTime(), noon.getTime());
});

step('the boundary hours are right', () => {
  const at = (h, tz) => {
    // Build an instant that is exactly hour h local.
    const probe = new Date('2026-09-24T12:00:00Z');
    const { instantForLocalHour } = require('../utils/quietHours');
    return instantForLocalHour(probe, tz, h);
  };
  const tz = 'America/Edmonton';
  assert.notStrictEqual(deliverableAt(at(22, tz), tz).getTime(), at(22, tz).getTime(), '10pm should be quiet');
  assert.strictEqual(deliverableAt(at(8, tz), tz).getTime(), at(8, tz).getTime(), '8am should be open');
  assert.strictEqual(deliverableAt(at(21, tz), tz).getTime(), at(21, tz).getTime(), '9pm should be open');
});

step('quiet hours survive a DST change', () => {
  // The night the clocks go back in Edmonton. A naive fixed-offset
  // calculation releases an hour early or an hour late here.
  const tz = 'America/Edmonton';
  const night = new Date('2026-11-01T06:00:00Z');
  const out = deliverableAt(night, tz);
  assert.strictEqual(localHour(out, tz), 8, `released at ${localHour(out, tz)} local, not 8`);
});

step('an unknown or junk timezone sends rather than holding forever', () => {
  const night = new Date('2026-09-24T05:00:00Z');
  assert.strictEqual(deliverableAt(night, null).getTime(), night.getTime());
  assert.strictEqual(deliverableAt(night, '').getTime(), night.getTime());
  assert.strictEqual(deliverableAt(night, 'Not/AZone').getTime(), night.getTime());
});

step('quiet hours can be turned off', () => {
  const night = new Date('2026-09-24T05:00:00Z');
  const out = deliverableAt(night, 'America/Edmonton', { enabled: false });
  assert.strictEqual(out.getTime(), night.getTime());
});

console.log('\n=== preferences and delivery ===\n');

step('an athlete with NO notifications subdocument is not muted', () => {
  // The privacy block got this backwards once. Absent must mean permissive,
  // or everyone who never opens settings silently stops being notified.
  const legacy = new User({ name: 'Old', email: 'a@b.c', password: 'x' });
  const prefs = legacy.notifications || {};
  for (const k of ['muteSocial', 'muteLifts', 'muteRank']) {
    assert.strictEqual(prefs[k] === true, false, `${k} reads as muted for a legacy user`);
  }
  assert.strictEqual(prefs.quietHoursOff === true, false, 'legacy user loses quiet-hours protection');
});

step('preference fields are phrased so that false is the kind option', () => {
  const paths = Object.keys(User.schema.paths).filter((k) => k.startsWith('notifications.'));
  assert.ok(paths.length >= 4, 'preferences missing from the User schema');
  for (const p of paths) {
    const key = p.split('.')[1];
    assert.ok(/^(mute|quietHoursOff)/.test(key), `${key} should be phrased as an opt-out`);
    assert.strictEqual(User.schema.paths[p].defaultValue, false, `${key} must default to false`);
  }
  assert.deepStrictEqual(DEFAULTS, {
    muteSocial: false, muteLifts: false, muteRank: false, quietHoursOff: false,
  });
});

step('retries back off, so a two-second blip does not exhaust them', () => {
  const s = [1, 2, 3, 4, 5].map((a) => worker.backoffMs(a));
  for (let i = 1; i < s.length; i += 1) assert.ok(s[i] > s[i - 1], 'backoff does not grow');
  assert.ok(s[0] >= 30 * 1000, 'first retry is too eager');
  assert.ok(s[s.length - 1] <= 60 * 60 * 1000, 'backoff is unbounded');
  // Five attempts must span well over a minute, or a short outage is fatal.
  assert.ok(s.reduce((a, b) => a + b, 0) > 10 * 60 * 1000, 'all attempts burn inside ten minutes');
});

step('the worker can find what is due, and the bell can be counted', () => {
  const keys = Notification.schema.indexes().map((i) => JSON.stringify(i[0]));
  assert.ok(keys.includes('{"status":1,"availableAt":1}'), 'the worker query has no index');
  assert.ok(keys.includes('{"user":1,"createdAt":-1}'), 'the notification list has no index');
  assert.ok(keys.includes('{"user":1,"readAt":1}'), 'the unread badge has no index');
  assert.ok(
    keys.some((k) => k.includes('"groupKey":1')),
    'collapsing has no index, so every like scans the collection'
  );
});

step('a push token is unique, so it cannot buzz two accounts', () => {
  // Reinstalling and signing in as someone else hands out the SAME token.
  assert.strictEqual(Device.schema.paths.token.options.unique, true);
  const keys = Device.schema.indexes().map((i) => JSON.stringify(i[0]));
  assert.ok(keys.includes('{"user":1,"disabledAt":1}'), 'the send path has no index');
});

step('a suppressed notification is still a notification', () => {
  // Muting means "do not interrupt me", not "keep me in the dark".
  assert.ok(Notification.schema.paths.status.enumValues.includes('suppressed'));
  assert.ok(Notification.schema.paths.readAt, 'no read state, so the bell cannot work');
});

console.log('\n=== the triggers ===\n');

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

step('every trigger is wired, and to the right recipient', () => {
  // Greps rather than runtime, because these are one-line calls inside
  // controllers that need a database to reach. A missing one is silent: the
  // feature simply never fires and nobody reports a bug.
  const posts = read('controllers/postController.js');
  assert.ok(/notify\(post\.user, 'like'/.test(posts), 'likes notify nobody');
  assert.ok(/const recipient = parent \? parent\.user : post\.user/.test(posts),
    'a reply notifies the post author instead of the person replied to');

  const follows = read('controllers/followController.js');
  assert.ok(/'follow_request' : 'follow'/.test(follows), 'follows notify nobody');
  assert.ok(/if \(created\)/.test(follows),
    'a repeat follow tap would notify again');

  const review = read('controllers/reviewController.js');
  assert.ok(/'lift_verified' : 'lift_rejected'/.test(review), 'review decisions notify nobody');

  const renumber = read('services/renumber.js');
  assert.ok(/announceRankChanges/.test(renumber), 'rank changes notify nobody');
});

step('rank changes are announced from the DRAIN, never from a rebuild', () => {
  // rebuildBoards calls renumberPartition too. If it announced, a rebuild
  // would tell every athlete in the sport that they moved.
  const renumber = read('services/renumber.js');
  const { renumberPartition } = require('../services/renumber');
  assert.ok(!/renumberPartition[\s\S]{0,800}await notify\(/.test(renumber),
    'renumberPartition notifies directly, so a rebuild would spam everyone');
  assert.ok(/const \{ changes \} = await renumberPartition/.test(renumber),
    'the drain does not read the changes');
  assert.strictEqual(typeof renumberPartition, 'function');
});

step('a notification is only sent after the board write has committed', () => {
  const renumber = read('services/renumber.js');
  const save = renumber.indexOf('await event.save();\n      drained++;');
  const announce = renumber.indexOf('await announceRankChanges');
  assert.ok(save > 0 && announce > save,
    'rank changes are announced before the event is marked done, so a retry re-announces');

  const review = read('controllers/reviewController.js');
  const tx = review.indexOf('await runBoardTransaction');
  const n = review.indexOf("notify(lift.user,");
  assert.ok(tx > 0 && n > tx,
    'a lift decision is announced inside the transaction, so a rollback still buzzes the phone');
});

step('the board notification is one per change, not six', () => {
  // Three metrics times two scopes would mean six notifications for one
  // lift, which is how a useful trigger becomes a muted one.
  const renumber = read('services/renumber.js');
  assert.ok(/key === 'total' && scopeKey === 'alltime'/.test(renumber),
    'rank notifications are not narrowed to one metric and one scope');
});

console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
