/* Smoke test for the follow system + friends feed (dev only, like test_generation.js).
 * Run: MONGODB_URI=mongodb://localhost:27017/oly-smoke node smoke_follow.js
 *   (uses a throwaway DB it wipes at the start; falls back to mongodb-memory-server
 *    if MONGODB_URI is unset and the package is installed) */
const mongoose = require('mongoose');

const User = require('./models/User');
const Post = require('./models/Post');
const Follow = require('./models/Follow');
const fc = require('./controllers/followController');
const pc = require('./controllers/postController');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const next = (e) => { if (e) { console.error('NEXT ERROR:', e); process.exit(1); } };
let failures = 0;
function expect(label, cond, extra) {
  if (cond) console.log('  ✓', label);
  else { failures++; console.error('  ✗', label, extra || ''); }
}

(async () => {
  let mem = null;
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase(); // throwaway smoke DB
  } else {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
  }

  const [ana, bo, cy] = await User.create([
    { name: 'Ana', email: 'ana@x.com', password: 'secret123' },
    { name: 'Bo', email: 'bo@x.com', password: 'secret123' },
    { name: 'Cy', email: 'cy@x.com', password: 'secret123' },
  ]);

  console.log('follow:');
  let res = mockRes();
  await fc.followUser({ user: { _id: ana._id }, params: { userId: String(bo._id) } }, res, next);
  expect('ana follows bo -> 201', res.statusCode === 201, res.body);

  res = mockRes();
  await fc.followUser({ user: { _id: ana._id }, params: { userId: String(bo._id) } }, res, next);
  expect('duplicate follow idempotent -> 200', res.statusCode === 200 && res.body.success, res.body);

  res = mockRes();
  await fc.followUser({ user: { _id: ana._id }, params: { userId: String(ana._id) } }, res, next);
  expect('self-follow rejected -> 400', res.statusCode === 400, res.body);

  res = mockRes();
  await fc.followUser({ user: { _id: ana._id }, params: { userId: 'not-an-id' } }, res, next);
  expect('bad id rejected -> 400', res.statusCode === 400, res.body);

  res = mockRes();
  await fc.followUser({ user: { _id: ana._id }, params: { userId: String(new mongoose.Types.ObjectId()) } }, res, next);
  expect('unknown user -> 404', res.statusCode === 404, res.body);

  console.log('status/lists:');
  await fc.followUser({ user: { _id: cy._id }, params: { userId: String(bo._id) } }, mockRes(), next);
  await fc.followUser({ user: { _id: bo._id }, params: { userId: String(ana._id) } }, mockRes(), next);

  res = mockRes();
  await fc.getFollowStatus({ user: { _id: ana._id }, params: { userId: String(bo._id) } }, res, next);
  const st = res.body.data;
  expect('status: ana->bo isFollowing', st.isFollowing === true, st);
  expect('status: bo->ana isFollowedBy', st.isFollowedBy === true, st);
  expect('status: bo has 2 followers', st.followers_count === 2, st);
  expect('status: bo follows 1', st.following_count === 1, st);

  res = mockRes();
  await fc.getFollowers({ user: { _id: ana._id }, query: { userId: String(bo._id) } }, res, next);
  expect('bo followers list has 2', res.body.total === 2 && res.body.data.length === 2, res.body);
  expect('followers list has user fields', !!res.body.data[0].user.name, res.body.data[0]);

  res = mockRes();
  await fc.getFollowing({ user: { _id: ana._id }, query: {} }, res, next);
  expect('my following defaults to me (ana follows bo)', res.body.total === 1 && String(res.body.data[0].user._id) === String(bo._id), res.body);

  console.log('feed:');
  await Post.create([
    { user: bo._id, lift_name: 'Snatch', visibility: ['SHARED_WITH_FRIENDS'], status: 'PUBLISHED', video_url: 'v1' },
    { user: cy._id, lift_name: 'Clean & Jerk', visibility: ['SHARED_WITH_FRIENDS'], status: 'PUBLISHED', video_url: 'v2' },
    { user: ana._id, lift_name: 'Front Squat', visibility: ['SHARED_WITH_FRIENDS'], status: 'PUBLISHED', video_url: 'v3' },
    { user: cy._id, lift_name: 'Secret', visibility: ['PRIVATE'], status: 'PUBLISHED', video_url: 'v4' },
  ]);

  res = mockRes();
  await pc.getPosts({ user: { _id: ana._id }, query: {} }, res, next);
  expect('feed=all shows all shared posts (3)', res.body.total === 3, res.body.total);

  res = mockRes();
  await pc.getPosts({ user: { _id: ana._id }, query: { feed: 'friends' } }, res, next);
  const names = res.body.data.filter((p) => !p.is_suggested).map((p) => p.lift_name).sort();
  expect('feed=friends = bo + me only (2)', res.body.total === 2, res.body.total);
  expect('feed=friends contents correct', JSON.stringify(names) === JSON.stringify(['Front Squat', 'Snatch']), names);

  res = mockRes();
  await pc.getPosts({ user: { _id: ana._id }, query: { feed: 'mine' } }, res, next);
  expect('feed=mine = my post only (1)', res.body.total === 1 && res.body.data[0].lift_name === 'Front Squat', res.body.total);

  console.log('discovery fallback:');
  const dee = await User.create({ name: 'Dee', email: 'dee@x.com', password: 'secret123' });
  res = mockRes();
  await pc.getPosts({ user: { _id: dee._id }, query: { feed: 'friends' } }, res, next);
  expect('new user (0 follows) still gets a feed', res.body.data.length === 3, res.body.data.length);
  expect('fallback posts flagged is_suggested', res.body.data.every((p) => p.is_suggested === true), res.body.data.map((p) => p.is_suggested));

  res = mockRes();
  await pc.getPosts({ user: { _id: ana._id }, query: { feed: 'friends' } }, res, next);
  const own = res.body.data.filter((p) => !p.is_suggested);
  const sugg = res.body.data.filter((p) => p.is_suggested);
  expect('ana: followed posts not flagged, backfill flagged', own.length === 2 && sugg.length === 1, { own: own.length, sugg: sugg.length });

  console.log('unfollow:');
  res = mockRes();
  await fc.unfollowUser({ user: { _id: ana._id }, params: { userId: String(bo._id) } }, res, next);
  expect('unfollow ok', res.statusCode === 200 && res.body.data.following === false, res.body);

  res = mockRes();
  await pc.getPosts({ user: { _id: ana._id }, query: { feed: 'friends' } }, res, next);
  expect('feed=friends after unfollow = just me (1)', res.body.total === 1, res.body.total);

  res = mockRes();
  await fc.unfollowUser({ user: { _id: ana._id }, params: { userId: String(bo._id) } }, res, next);
  expect('double unfollow idempotent', res.statusCode === 200, res.body);

  await mongoose.disconnect();
  if (mem) await mem.stop();
  console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})();
