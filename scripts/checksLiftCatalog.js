/**
 * The lift catalogue and the post fields that hang off it.
 *
 * These rules fail silently by nature: a lift that resolves to the wrong id
 * produces a wrong badge, not an error, and a lift that resolves to null
 * produces a missing badge. Neither throws, so neither shows up without a
 * check like this one.
 *
 * Run: node scripts/checksLiftCatalog.js
 */
const assert = require('assert');
const { LIFTS, resolveLiftId, isLiftId, displayName, ranksAs } = require('../utils/liftCatalog');
const Post = require('../models/Post');

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

console.log('=== lift catalogue ===\n');

step('the catalogue is exactly the twelve lifts, with unique ids', () => {
  assert.strictEqual(LIFTS.length, 12, 'the catalogue changed size');
  const ids = LIFTS.map((l) => l.id);
  assert.strictEqual(new Set(ids).size, 12, 'duplicate id');
  assert.deepStrictEqual(
    ids.slice(0, 2),
    ['snatch', 'clean_jerk'],
    'the two ranking lifts must stay first and keep their ids'
  );
});

step('THE BUG THIS EXISTS FOR: every spelling of one lift resolves to one id', () => {
  for (const t of ['Clean & Jerk', 'Clean and Jerk', 'clean and jerk', 'CLEAN & JERK',
                   'clean_jerk', 'cleanjerk', 'C&J', 'c & j', 'Clean + Jerk']) {
    assert.strictEqual(resolveLiftId(t), 'clean_jerk', `"${t}" did not resolve`);
  }
  for (const t of ['Snatch', 'snatch', ' SNATCH ', 'Squat Snatch', 'Full Snatch']) {
    assert.strictEqual(resolveLiftId(t), 'snatch', `"${t}" did not resolve`);
  }
});

step('it refuses to guess rather than corrupting a record', () => {
  // Every one of these CONTAINS the text of a real lift. A fuzzy matcher
  // would map them and put a wrong best-lift on somebody's profile.
  for (const t of ['snatch grip deadlift', 'deadlift', 'clean pull', 'snatch pull',
                   'bench press', 'thruster', 'random text', '', null, undefined, 42]) {
    assert.strictEqual(resolveLiftId(t), null, `"${t}" was wrongly matched`);
  }
});

step('every lift resolves from its own id and its own display name', () => {
  for (const l of LIFTS) {
    assert.strictEqual(resolveLiftId(l.id), l.id, `${l.id} does not resolve from its id`);
    assert.strictEqual(resolveLiftId(l.name), l.id, `${l.name} does not resolve from its name`);
    assert.strictEqual(displayName(l.id), l.name);
    assert.ok(isLiftId(l.id));
  }
});

step('press aliases do not collide', () => {
  assert.strictEqual(resolveLiftId('Strict Press'), 'strict_press');
  assert.strictEqual(resolveLiftId('Push Press'), 'push_press');
  assert.strictEqual(resolveLiftId('military press'), 'strict_press');
  assert.notStrictEqual(resolveLiftId('push press'), 'strict_press');
});

step('squat aliases do not collide', () => {
  assert.strictEqual(resolveLiftId('Back Squat'), 'back_squat');
  assert.strictEqual(resolveLiftId('Front Squat'), 'front_squat');
  assert.strictEqual(resolveLiftId('Overhead Squat'), 'overhead_squat');
  assert.strictEqual(resolveLiftId('Squat Clean'), 'clean', 'squat clean is a clean, not a squat');
  assert.strictEqual(resolveLiftId('Squat Snatch'), 'snatch', 'squat snatch is a snatch');
});

step('only snatch and clean & jerk rank, and clean_jerk maps to the board spelling', () => {
  assert.strictEqual(ranksAs('snatch'), 'snatch');
  // The ranking model has said 'cleanjerk' since the boards were built and
  // that value is in every partition key. The mapping lives in ONE file.
  assert.strictEqual(ranksAs('clean_jerk'), 'cleanjerk');
  const ranking = LIFTS.filter((l) => l.ranksAs);
  assert.strictEqual(ranking.length, 2, 'something new claims to rank');
  const Lift = require('../models/Lift');
  const enumValues = Lift.schema.paths.liftType.enumValues;
  for (const l of ranking) {
    assert.ok(
      enumValues.includes(l.ranksAs),
      `${l.id} ranks as "${l.ranksAs}", which Lift.liftType does not accept`
    );
  }
});

console.log('\n=== post fields ===\n');

step('lift_id is indexed, defaults to null, and lift_name is untouched', () => {
  const p = Post.schema.paths.lift_id;
  assert.ok(p, 'Post.lift_id missing');
  assert.strictEqual(p.defaultValue, null, 'unresolved must be null, not empty string');
  const keys = Post.schema.indexes().map((i) => JSON.stringify(i[0]));
  assert.ok(
    keys.some((k) => k.includes('"lift_id":1')),
    'lift_id is not indexed, so every badge query is a collection scan'
  );
  assert.ok(Post.schema.paths.lift_name, 'lift_name was removed; it is still the display text');
});

step('bodyweight_recorded_at exists and is a date', () => {
  const p = Post.schema.paths.bodyweight_recorded_at;
  assert.ok(p, 'Post.bodyweight_recorded_at missing');
  assert.strictEqual(p.instance, 'Date');
  assert.strictEqual(p.defaultValue, null);
});

step('a new post carries both fields through the model', () => {
  const doc = new Post({
    user: '6aa3588e9ba24fb2ea3ad9ad',
    lift_name: 'Clean and Jerk',
    lift_id: resolveLiftId('Clean and Jerk'),
    bodyweight_recorded_at: new Date('2026-09-20T10:00:00Z'),
  });
  assert.strictEqual(doc.lift_id, 'clean_jerk');
  assert.strictEqual(doc.bodyweight_recorded_at.toISOString(), '2026-09-20T10:00:00.000Z');
});

console.log('\n=== the payload normaliser ===\n');

// The REAL function, imported, not a copy pulled out with a regex and run
// with stubs. The stub version passed while three of these bugs were live:
// it never reached Mongoose's casting, which is where an empty string became
// a null and destroyed a stored date.
const { normalizePostBody, postToFrontendFormat } = require('../controllers/postController').__test;

const stored = (body) => {
  const post = new Post({
    user: '6aa3588e9ba24fb2ea3ad9ad',
    lift_id: 'clean_jerk',
    lift_name: 'Clean & Jerk',
    bodyweight_recorded_at: new Date('2026-09-01T00:00:00Z'),
  });
  // Exactly what updatePost does.
  Object.assign(post, normalizePostBody({ ...body }));
  return post;
};

step('THE ONE THAT LOSES DATA: no edit shape may wipe a stored lift', () => {
  // Every one of these reached the resolver and assigned null. `lift_id: ''`
  // is what any client that serialises an unset field to an empty string
  // sends on an ordinary caption edit, and PUT /posts/:id has no validation
  // in front of it.
  for (const body of [
    { opinion: 'felt heavy' },
    { lift_id: '' },
    { lift_id: null },
    { lift_id: 'deadlift' },
    { lift_id: 42 },
    { lift_id: {} },
    { lift_id: [] },
    { lift_id: true },
  ]) {
    const p = stored(body);
    assert.strictEqual(p.lift_id, 'clean_jerk', `wiped by ${JSON.stringify(body)}`);
    assert.strictEqual(p.lift_name, 'Clean & Jerk', `name changed by ${JSON.stringify(body)}`);
  }
});

step('THE OTHER ONE: no edit shape may wipe a stored weigh-in', () => {
  // '' shadowed a real date in session_detail because ?? only falls through
  // on null and undefined, and Mongoose then cast '' to null.
  const keep = '2026-09-01T00:00:00.000Z';
  for (const body of [
    { opinion: 'x' },
    { bodyweight_recorded_at: '' },
    { bodyweight_recorded_at: null },
    { bodyweight_recorded_at: 0 },
    { bodyweight_recorded_at: 'nonsense' },
    { bodyweight_recorded_at: '2099-01-01' },
  ]) {
    const p = stored(body);
    assert.ok(p.bodyweight_recorded_at, `wiped by ${JSON.stringify(body)}`);
    assert.strictEqual(p.bodyweight_recorded_at.toISOString(), keep, `changed by ${JSON.stringify(body)}`);
  }
});

step('an empty top-level date does not shadow a real one in session_detail', () => {
  const p = stored({
    bodyweight_recorded_at: '',
    session_detail: { bodyweight_recorded_at: '2026-09-20T00:00:00Z' },
  });
  assert.strictEqual(p.bodyweight_recorded_at.toISOString(), '2026-09-20T00:00:00.000Z');
});

step('a real weigh-in is stored, from either place', () => {
  assert.strictEqual(
    stored({ bodyweight_recorded_at: '2026-09-20T00:00:00Z' }).bodyweight_recorded_at.toISOString(),
    '2026-09-20T00:00:00.000Z'
  );
  assert.strictEqual(
    stored({ session_detail: { bodyweight_recorded_at: '2026-09-18T00:00:00Z' } })
      .bodyweight_recorded_at.toISOString(),
    '2026-09-18T00:00:00.000Z'
  );
});

step('malformed session_detail JSON does not throw', () => {
  // The old stub for parseSessionDetail threw here where the real one
  // returns null, so this case was never actually exercised.
  assert.doesNotThrow(() => stored({ session_detail: '{not json' }));
  assert.doesNotThrow(() => stored({ session_detail: 'plain string' }));
  assert.doesNotThrow(() => stored({ session_detail: 42 }));
});

step('an unrecognised name DOES clear the id, because the caller said so', () => {
  const p = stored({ lift_name: 'bench press' });
  assert.strictEqual(p.lift_id, null, 'an explicit unknown lift should clear the id');
});

step('an id the server does not recognise falls back to the name', () => {
  assert.strictEqual(stored({ lift_id: 'deadlift', lift_name: 'Snatch' }).lift_id, 'snatch');
});

step('an id-only edit does not rewrite the athlete\'s own wording', () => {
  // "Hang Snatch @ 92%" is the athlete's note. Replacing it with a bare
  // "Snatch" loses what they wrote.
  const p = stored({ lift_id: 'snatch' });
  assert.strictEqual(p.lift_id, 'snatch');
  assert.strictEqual(p.lift_name, 'Clean & Jerk', 'the stored name was overwritten');
});

step('the API returns both new fields', () => {
  const out = postToFrontendFormat(stored({ lift_name: 'Snatch' }));
  assert.ok('lift_id' in out, 'lift_id missing from the post payload');
  assert.ok('bodyweight_recorded_at' in out, 'bodyweight_recorded_at missing from the post payload');
  assert.strictEqual(out.lift_id, 'snatch');
});

console.log('\n=== cross-model agreement ===\n');

step('the catalogue and strength_stats describe the same twelve lifts', () => {
  // Two independent literals, and strength_stats keys are baked into
  // production User documents. Adding a lift to one and not the other breaks
  // the profile-to-post correspondence with no error anywhere.
  const { STRENGTH_SECTIONS } = require('../utils/normalizeProfileEnums');
  // Not `|| {}`. An unexported constant would make this check pass while
  // asserting nothing, which is the failure this whole suite exists to stop.
  assert.ok(STRENGTH_SECTIONS, 'STRENGTH_SECTIONS is not exported, so this check tests nothing');
  const fromProfile = new Set(Object.values(STRENGTH_SECTIONS).flat().map(String));
  assert.ok(fromProfile.size > 0, 'strength_stats sections are empty');
  for (const l of LIFTS) {
    assert.ok(fromProfile.has(l.id), `${l.id} is in the catalogue but not in strength_stats`);
  }
  for (const k of fromProfile) {
    assert.ok(isLiftId(k), `strength_stats has "${k}", which is not a catalogue lift id`);
  }
  assert.strictEqual(fromProfile.size, LIFTS.length, 'the two lists have drifted in size');
});

step('the two id namespaces cannot silently half-match', () => {
  // 'snatch' is byte-identical in both, 'clean_jerk' is not. A query
  // comparing a lift_id against Lift.liftType therefore WORKS for snatch and
  // returns nothing for clean & jerk, so a developer testing with a snatch
  // sees it pass. Half-working is the failure mode that ships.
  const Lift = require('../models/Lift');
  const boardValues = Lift.schema.paths.liftType.enumValues;
  const ranking = LIFTS.filter((l) => l.ranksAs);
  const mismatched = ranking.filter((l) => l.id !== l.ranksAs).map((l) => l.id);
  assert.deepStrictEqual(
    mismatched,
    ['clean_jerk'],
    'the set of ids that differ from their board spelling changed; update the mapping comment'
  );
  for (const l of ranking) {
    assert.ok(boardValues.includes(l.ranksAs), `${l.id} ranks as a value the board rejects`);
  }
  // And nothing may claim to rank as a value that is also a catalogue id,
  // which is what would make a cross-namespace comparison look correct.
  for (const l of ranking) {
    if (l.id === l.ranksAs) continue;
    assert.ok(!LIFTS.some((x) => x.id === l.ranksAs), `${l.ranksAs} is both a board value and a lift id`);
  }
});

console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
