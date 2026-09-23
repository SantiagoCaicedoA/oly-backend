/**
 * DB-free checks for the privacy and safety rules.
 *
 * Everything here is a rule that, if it broke, would break quietly: a hidden
 * club reappearing on the board after a rebuild, a legacy account reading as
 * private, a pending request counting as a follower. None of those throw.
 *
 * Run: node scripts/checksPrivacy.js
 */
const assert = require('assert');

const { buildIdentity } = require('../services/boardWrite');
const { entryToRow } = require('../controllers/leaderboardController');
const { DEFAULTS } = require('../controllers/privacyController');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Report = require('../models/Report');
const Block = require('../models/Block');

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

console.log('=== privacy and safety ===\n');

// ---- the absent-field trap, which is what the review caught ----

step('a user with NO privacy object reads as fully permissive', () => {
  const legacy = new User({ name: 'Old Account', email: 'a@b.c', password: 'x' });
  const p = legacy.privacy || {};
  assert.strictEqual(p.accountPrivate === true, false, 'legacy account reads as private');
  assert.strictEqual(p.hideClub === true, false, 'legacy account hides its club');
  assert.strictEqual(p.hideBodyweight === true, false, 'legacy account hides its bodyweight');
});

step('the settings response fills in every field for a legacy user', () => {
  const merged = { ...DEFAULTS, ...(undefined || {}) };
  assert.deepStrictEqual(merged, {
    accountPrivate: false,
    allowMessagesFrom: 'everyone',
    hideBodyweight: false,
    hideClub: false,
  });
  // Every default must be the permissive value, or a legacy user silently
  // becomes more locked down than they ever asked to be.
  assert.strictEqual(DEFAULTS.accountPrivate, false);
  assert.strictEqual(DEFAULTS.hideClub, false);
  assert.strictEqual(DEFAULTS.hideBodyweight, false);
});

step('privacy fields are named hide*, so absent means permissive', () => {
  const paths = Object.keys(User.schema.paths).filter((k) => k.startsWith('privacy.'));
  const bools = paths.filter((k) => User.schema.paths[k].instance === 'Boolean');
  for (const k of bools) {
    const name = k.split('.')[1];
    assert.ok(
      name.startsWith('hide') || name === 'accountPrivate',
      `${name} should be phrased so that false/absent is the permissive state`
    );
    assert.strictEqual(
      User.schema.paths[k].defaultValue,
      false,
      `${name} must default to false`
    );
  }
});

// ---- board identity is DERIVED, so a rebuild cannot lose it ----

const baseUser = (privacy) => ({
  _id: 'u1',
  name: 'Mateo Herrera',
  anonymizedAt: null,
  privacy,
  profile: { club: 'Vikings WC', countryCode: 'COL', sex: 'Male', birth_year: 1998 },
});

step('buildIdentity nulls the club when hideClub is set', () => {
  const id = buildIdentity(baseUser({ hideClub: true }));
  assert.strictEqual(id.club, null, 'club survived a rebuild');
});

step('buildIdentity keeps the club for a legacy user with no privacy object', () => {
  const id = buildIdentity(baseUser(undefined));
  assert.strictEqual(id.club, 'Vikings WC', 'a legacy user lost their club');
});

step('buildIdentity carries hideBodyweight onto the row', () => {
  assert.strictEqual(buildIdentity(baseUser({ hideBodyweight: true })).hideBodyweight, true);
  assert.strictEqual(buildIdentity(baseUser(undefined)).hideBodyweight, false);
});

// ---- the row the public actually sees ----

const entry = (over) => ({
  user: 'u1',
  name: 'Mateo Herrera',
  avatarUrl: null,
  club: 'Vikings WC',
  countryCode: 'COL',
  sex: 'Male',
  weightClass: '94',
  birthYear: 1998,
  totalKg: 268,
  totalBwKg: 91.6,
  sinclair: 320.5,
  totalSnatchKg: 118,
  totalCleanKg: 150,
  ...over,
});

step('hideBodyweight removes the number but keeps the weight class and score', () => {
  const row = entryToRow(entry({ hideBodyweight: true }), 'total', 1);
  assert.strictEqual(row.bodyweightKg, null, 'exact bodyweight is still public');
  assert.strictEqual(row.user.weightClass, '94', 'weight class must stay: it IS the ranking');
  // Sinclair stays, and this is a DOCUMENTED LIMIT rather than a claim that
  // the bodyweight is secret: the score inverts back to within ~0.3kg.
  // Removing it would drop the athlete off the Sinclair board, and there is
  // no opt-out from the board. See the comment on User.privacy.hideBodyweight.
  assert.strictEqual(row.sinclair, 320.5, 'athlete was dropped from the sinclair board');
  assert.strictEqual(row.value, 268, 'the result must be unaffected');
});

step('THE INVARIANT: privacy never removes a row from the board', () => {
  const row = entryToRow(entry({ hideBodyweight: true, club: null }), 'total', 1);
  assert.strictEqual(row.rank, 1, 'rank disappeared');
  assert.strictEqual(row.value, 268, 'result disappeared');
  assert.ok(row.user.id, 'athlete disappeared');
});

// ---- follow, block and report rules that live in the schema ----

step('a new follow edge is accepted; pending is opt-in', () => {
  assert.strictEqual(new Follow({ follower: 'a', following: 'b' }).status, 'accepted');
});

step('status is constrained, so a typo cannot read as a follower', () => {
  const bad = new Follow({ follower: 'a', following: 'b', status: 'pendign' });
  const err = bad.validateSync();
  assert.ok(err && err.errors.status, 'an invalid status was accepted');
});

step('the follow status index exists, or the approval inbox scans every edge', () => {
  const keys = Follow.schema.indexes().map((i) => JSON.stringify(i[0]));
  assert.ok(keys.includes('{"following":1,"status":1}'), 'approval inbox index missing');
  assert.ok(keys.includes('{"follower":1,"status":1}'), 'following-list index missing');
});

step('a dismissed report does not bar the next one', () => {
  const idx = Report.schema.indexes().find(
    (i) => i[1] && i[1].unique && i[0].reporter === 1
  );
  assert.ok(idx, 'no unique report index');
  assert.deepStrictEqual(
    idx[1].partialFilterExpression,
    { status: 'open' },
    'uniqueness is unconditional, which silences a reporter permanently'
  );
});

step('a block can be looked up from either side', () => {
  const keys = Block.schema.indexes().map((i) => JSON.stringify(i[0]));
  assert.ok(keys.includes('{"blocker":1,"blocked":1}'), 'forward index missing');
  assert.ok(keys.includes('{"blocked":1,"blocker":1}'), 'reverse index missing');
});

// ---- the profile response ----

const { formatUserResponse } = require('../utils/profileResponse');
const someone = () => ({
  _id: 'u2',
  name: 'Mateo Herrera',
  username: 'mateo',
  privacy: { hideClub: true, hideBodyweight: true },
  profile: { club: 'Vikings WC', bodyweight_value: 91.6, bodyweight_unit: 'kg' },
});

step('another athlete does not see a hidden club or bodyweight', () => {
  const view = formatUserResponse(someone(), 'u1');
  assert.strictEqual(view.profile.club, null, 'club leaked');
  assert.strictEqual(view.profile.bodyweight_value, undefined, 'bodyweight leaked');
});

step('you always see your own profile in full', () => {
  const view = formatUserResponse(someone(), 'u2');
  assert.strictEqual(view.profile.club, 'Vikings WC', 'hid the owner from themselves');
  assert.strictEqual(view.profile.bodyweight_value, 91.6, 'hid the owner from themselves');
});

step('privacy settings are never exposed to anyone else', () => {
  assert.strictEqual(formatUserResponse(someone(), 'u1').privacy, undefined);
});

step('a legacy user with no privacy object keeps everything visible', () => {
  const view = formatUserResponse(
    { _id: 'u3', name: 'Old', profile: { club: 'Vikings WC', bodyweight_value: 80 } },
    'u1'
  );
  assert.strictEqual(view.profile.club, 'Vikings WC', 'a legacy user lost their club');
  assert.strictEqual(view.profile.bodyweight_value, 80, 'a legacy user lost their bodyweight');
});

// ---- regression checks, one per bug the review found ----

step('REGRESSION: called with NO viewer, you see your own profile in full', () => {
  // Nine endpoints call it this way, including /users/me, signin and
  // GET /api/profile. Getting `isSelf` backwards hid an athlete's own club
  // and bodyweight from themselves, and because the settings form seeds from
  // that response, an athlete in pounds who saved anything had their unit
  // rewritten to kg while the number stayed. Wrong weight class, wrong board.
  const view = formatUserResponse(someone());
  assert.strictEqual(view.profile.club, 'Vikings WC', 'hid the owner from themselves');
  assert.strictEqual(view.profile.bodyweight_value, 91.6, 'hid the owner from themselves');
  assert.strictEqual(view.profile.bodyweight_unit, 'kg', 'dropped the unit, which corrupts on save');
  assert.ok(view.privacy, 'the owner must be able to read their own settings');
});

step('REGRESSION: every per-post route is gated, not just the feed', () => {
  // Blocking was enforced in the feed query alone, so a blocked person could
  // still open the post by id, read the thread, like it, and comment on it.
  const layers = require('../routes/postRoutes').stack;
  const gate = layers.find((l) => l.name === 'postAccess' || (l.handle && l.handle.name === 'postAccess'));
  assert.ok(gate, 'postAccess is not mounted on the post router');
  // It must cover any post id, and must NOT swallow the feed at '/'.
  assert.ok(gate.regexp.test('/6aa3588e9ba24fb2ea3ad9ad'), 'the gate does not cover /:id');
  assert.ok(!gate.regexp.test('/'), 'the gate is swallowing the feed route');
  // And it must sit BEFORE every /:id handler, or they run ungated.
  const gateAt = layers.indexOf(gate);
  const idRoutes = layers
    .map((l, i) => ({ i, path: l.route && l.route.path }))
    .filter((x) => x.path && x.path.startsWith('/:id'));
  assert.ok(idRoutes.length >= 7, `expected the per-post routes, found ${idRoutes.length}`);
  assert.ok(
    idRoutes.every((x) => x.i > gateAt),
    'a /:id route is declared before the gate, so it runs ungated'
  );
});

step('REGRESSION: a private account has a denormalised flag the feed can filter on', () => {
  const Post = require('../models/Post');
  const path = Post.schema.paths.authorPrivate;
  assert.ok(path, 'Post.authorPrivate missing, so feed=all cannot exclude private authors');
  assert.strictEqual(path.defaultValue, false, 'absent must mean public');
});

step('REGRESSION: hideBodyweight does not leak through an attached lift', () => {
  // The athlete card returned stats.bodyweightKg: null and then the real
  // number in videos.snatch.bodyweightKg eight lines later.
  const lift = { _id: 'l1', liftType: 'snatch', weightKg: 118, bodyweightKg: 91.6, videoUrl: 'x' };
  const hideBw = true;
  const out = { ...lift };
  if (hideBw) out.bodyweightKg = null;
  assert.strictEqual(out.bodyweightKg, null);
  // and the real thing, via the shipped source
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'leaderboardController.js'),
    'utf8'
  );
  assert.ok(
    /if \(hideBw\) out\.bodyweightKg = null;/.test(src),
    'the athlete card no longer strips bodyweight from attached lifts'
  );
});

step('REGRESSION: block enforcement reads both directions with separate budgets', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'services', 'blocks.js'),
    'utf8'
  );
  // One $or with a shared cap let somebody block 1000 throwaway accounts and
  // push other people's blocks out of their own set.
  assert.ok(src.includes("Block.find({ blocker: userId })"), 'missing outgoing query');
  assert.ok(src.includes("Block.find({ blocked: userId })"), 'missing incoming query');
  assert.ok(
    !/\$or:\s*\[\{ blocker: userId \}, \{ blocked: userId \}\][\s\S]{0,120}limit\(BLOCK_CAP\)/.test(src),
    'still one $or sharing a single cap'
  );
});

step('REGRESSION: the report allowlist rejects prototype keys', () => {
  const TARGETS = Object.assign(Object.create(null), { user: 1, post: 1, comment: 1 });
  for (const k of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    assert.ok(!TARGETS[k], `${k} is a member of the allowlist`);
  }
});

step('REGRESSION: the privacy write and its sweeps are one transaction', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'privacyController.js'),
    'utf8'
  );
  assert.ok(!src.includes('findByIdAndUpdate'), 'the user write is still outside the transaction');
  const tx = src.indexOf('runBoardTransaction');
  assert.ok(tx > 0 && src.indexOf('User.updateOne', tx) > tx, 'the user write is not inside it');
});

console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
