const crypto = require('crypto');
const BoardEntry = require('../models/BoardEntry');
const Season = require('../models/Season');
const Follow = require('../models/Follow');
const { categoriesForBirthYear, birthYearPredicate } = require('../utils/leaderboard/ageCategories');
const { classLabels } = require('../utils/leaderboard/classTable');
const {
  encodeCursor,
  decodeCursor,
  cursorPredicate,
  betterThanPredicate,
} = require('../utils/leaderboard/cursor');
const { getCached, setCached } = require('../utils/leaderboard/boardCache');

/**
 * Leaderboard read path (design doc §6, rev 5).
 *
 * GET /leaderboard          — viewer-independent, cacheable, ETag'd
 * GET /leaderboard/me       — viewer's row; rank ALWAYS computed by covered
 *                             count (never the materialized value) so the
 *                             submit response can never disagree with a
 *                             refresh (§5)
 * GET /leaderboard/friends  — follow-graph board, per-viewer, never cached
 */

// Board metric plumbing: which field sorts the board, which date breaks ties.
const METRICS = {
  total: { field: 'totalKg', tie: 'totalAchievedAt' },
  snatch: { field: 'bestSnatchKg', tie: 'snatchAchievedAt' },
  cleanjerk: { field: 'bestCleanKg', tie: 'cleanAchievedAt' },
  sinclair: { field: 'sinclair', tie: 'totalAchievedAt' },
};

const MAX_LIMIT = 50;

/** Parse + validate the shared board filter params. Returns null on bad input. */
function parseBoardParams(query) {
  const lift = ['total', 'snatch', 'cleanjerk', 'sinclair'].includes(query.lift)
    ? query.lift
    : 'total';
  const scope = query.scope === 'alltime' ? 'alltime' : 'season';
  const sex = query.sex === 'F' ? 'F' : 'M';
  const age = ['junior', 'masters'].includes(query.age) ? query.age : 'open';
  const country =
    typeof query.country === 'string' && /^[A-Z]{3}$/.test(query.country) ? query.country : null; // null = world
  let weightClass = null;
  if (lift !== 'sinclair') {
    const valid = classLabels(sex);
    weightClass = valid.includes(query.class) ? query.class : valid[4]; // sensible default mid-table
  }
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), MAX_LIMIT);
  return { lift, scope, sex, age, country, weightClass, limit };
}

/**
 * Resolve scope param to a scopeKey ("S1" | "alltime").
 *
 * The active season changes ~4 times a YEAR, so it is cached in-process for
 * 60s instead of being a per-request query — on the hot path this removes
 * one DB round-trip from every single board/me/card call. Worst case after
 * a season transition: 60s of the old answer, which the 7-day grace period
 * makes harmless.
 */
let seasonCache = { value: null, expiresAt: 0 };
async function resolveScopeKey(scope) {
  if (scope === 'alltime') return { scopeKey: 'alltime', season: null };
  if (seasonCache.expiresAt > Date.now()) {
    const season = seasonCache.value;
    return { scopeKey: season ? season.key : 'alltime', season };
  }
  const now = new Date();
  // A season serves the board through its grace period (until snapshotAt).
  const season = await Season.findOne({
    startsAt: { $lte: now },
    snapshotAt: { $gt: now },
  })
    .sort({ startsAt: -1 })
    .lean();
  seasonCache = { value: season, expiresAt: Date.now() + 60 * 1000 };
  return { scopeKey: season ? season.key : 'alltime', season };
}

/**
 * The base Mongo filter for a board shape. Every query carries
 * provisional: false (matches the partial indexes) and the metric
 * existence predicate; the Sinclair shape's `sinclair: { $gt: 0 }` is
 * REQUIRED for partial-index selection (§4.2) — do not remove it.
 */
function boardFilter({ lift, scopeKey, sex, weightClass, age, country }) {
  const m = METRICS[lift];
  const filter = {
    scopeKey,
    provisional: false,
    sex,
    [m.field]: { $gt: 0 },
    ...birthYearPredicate(age),
  };
  if (lift !== 'sinclair') filter.weightClass = weightClass;
  if (country) filter.countryCode = country;
  return filter;
}

function entryToRow(entry, lift, rank) {
  const m = METRICS[lift];
  // bodyweightKg = the bodyweight the DISPLAYED score actually used (§4.5):
  // the lift's own for single-lift boards, the heavier contributing one for
  // total and Sinclair — so the number and the score always reconcile.
  let bodyweightKg = null;
  if (lift === 'snatch') bodyweightKg = entry.snatchBwKg;
  else if (lift === 'cleanjerk') bodyweightKg = entry.cleanBwKg;
  else bodyweightKg = entry.totalBwKg;

  return {
    rank,
    user: {
      id: entry.user,
      name: entry.name,
      avatarUrl: entry.avatarUrl,
      club: entry.club,
      countryCode: entry.countryCode,
      sex: entry.sex,
      weightClass: entry.weightClass,
      // Raw birthYear never leaves the API (privacy, rev 3).
      ageCategories: categoriesForBirthYear(entry.birthYear),
    },
    value: entry[m.field],
    snatchKg: lift === 'total' || lift === 'sinclair' ? entry.totalSnatchKg : entry.bestSnatchKg,
    cleanKg: lift === 'total' || lift === 'sinclair' ? entry.totalCleanKg : entry.bestCleanKg,
    bodyweightKg,
    sinclair: entry.sinclair,
    achievedAt: entry[m.tie],
  };
}

function seasonMeta(season) {
  if (!season) return null;
  return { key: season.key, label: season.label, endsAt: season.endsAt, status: season.status };
}

// ---------------------------------------------------------------------------
// GET /api/leaderboard
// ---------------------------------------------------------------------------
async function getLeaderboard(req, res) {
  try {
    const params = parseBoardParams(req.query);
    const { scopeKey, season } = await resolveScopeKey(params.scope);
    const m = METRICS[params.lift];
    const filter = boardFilter({ ...params, scopeKey });

    const cur = req.query.cursor ? decodeCursor(req.query.cursor) : null;
    const cacheKey =
      !cur &&
      ['lb', scopeKey, params.lift, params.sex, params.weightClass, params.age, params.country, params.limit].join('|');

    if (cacheKey) {
      const cached = await getCached(cacheKey);
      if (cached) return sendWithEtag(req, res, cached);
    }

    const query = { ...filter, ...(cur ? cursorPredicate(m.field, m.tie, cur) : {}) };
    const sort = { [m.field]: -1, [m.tie]: 1, user: 1 };

    const entries = await BoardEntry.find(query).sort(sort).limit(params.limit).lean();

    // Rank of the first row under THESE filters: one covered count, then
    // increment down the page. Works identically for filtered boards, where
    // materialized ranks don't apply.
    let startRank = 1;
    if (entries.length > 0) {
      const first = entries[0];
      const better = await BoardEntry.countDocuments({
        ...filter,
        ...betterThanPredicate(m.field, m.tie, first[m.field], first[m.tie], first.user),
      });
      startRank = better + 1;
    }

    const rows = entries.map((e, i) => entryToRow(e, params.lift, startRank + i));
    const last = entries[entries.length - 1];
    const body = {
      season: seasonMeta(season),
      scope: params.scope,
      entries: rows,
      nextCursor:
        entries.length === params.limit && last
          ? encodeCursor(last[m.field], new Date(last[m.tie]).getTime(), last.user)
          : null,
    };

    if (cacheKey) await setCached(cacheKey, body);
    return sendWithEtag(req, res, body);
  } catch (err) {
    console.error('getLeaderboard error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load leaderboard' });
  }
}

/** ETag on the viewer-independent board body: refetch-on-focus is a 304. */
function sendWithEtag(req, res, body) {
  const json = JSON.stringify(body);
  const etag = '"' + crypto.createHash('md5').update(json).digest('hex') + '"';
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.set('ETag', etag);
  res.set('Cache-Control', 'private, max-age=30');
  return res.type('application/json').send(json);
}

// ---------------------------------------------------------------------------
// GET /api/leaderboard/me
// ---------------------------------------------------------------------------
async function getMyRank(req, res) {
  try {
    const params = parseBoardParams(req.query);
    const { scopeKey, season } = await resolveScopeKey(params.scope);
    const m = METRICS[params.lift];

    // Resolve MY entry for this board shape (§4.5): class pinned -> that
    // class's entry; class-less (Sinclair) -> the entry carrying sinclair.
    const own = { user: req.user._id, scopeKey };
    let entry;
    if (params.lift === 'sinclair') {
      entry = await BoardEntry.findOne({ ...own, sinclair: { $gt: 0 } }).lean();
      if (!entry) entry = await BoardEntry.findOne({ ...own, provisional: true }).lean();
    } else {
      entry = await BoardEntry.findOne({ ...own, weightClass: params.weightClass }).lean();
    }

    if (!entry || !entry[m.field]) {
      return res.json({ season: seasonMeta(season), me: null });
    }

    const filter = boardFilter({ ...params, scopeKey });
    // Provisional entries are excluded from `filter` by design; a
    // provisional viewer gets a would-be rank against the live board.
    const better = await BoardEntry.countDocuments({
      ...filter,
      ...betterThanPredicate(m.field, m.tie, entry[m.field], entry[m.tie], entry.user),
    });

    return res.json({
      season: seasonMeta(season),
      me: {
        rank: better + 1,
        provisional: !!entry.provisional, // "you'd be #N — post a video to claim it"
        value: entry[m.field],
        snatchKg:
          params.lift === 'total' || params.lift === 'sinclair'
            ? entry.totalSnatchKg
            : entry.bestSnatchKg,
        cleanKg:
          params.lift === 'total' || params.lift === 'sinclair'
            ? entry.totalCleanKg
            : entry.bestCleanKg,
        sinclair: entry.sinclair,
        weightClass: entry.weightClass,
      },
    });
  } catch (err) {
    console.error('getMyRank error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load your rank' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/leaderboard/friends
// ---------------------------------------------------------------------------
async function getFriendsBoard(req, res) {
  try {
    const params = parseBoardParams(req.query);
    const { scopeKey, season } = await resolveScopeKey(params.scope);
    const m = METRICS[params.lift];

    // Bounded by design: a user follows hundreds, not millions.
    const edges = await Follow.find({ follower: req.user._id }).select('following').lean();
    const ids = edges.map((e) => e.following);
    ids.push(req.user._id); // you appear on your own friends board

    const filter = { ...boardFilter({ ...params, scopeKey }), user: { $in: ids } };
    const entries = await BoardEntry.find(filter)
      .sort({ [m.field]: -1, [m.tie]: 1, user: 1 })
      .limit(MAX_LIMIT)
      .lean();

    return res.json({
      season: seasonMeta(season),
      entries: entries.map((e, i) => entryToRow(e, params.lift, i + 1)),
    });
  } catch (err) {
    console.error('getFriendsBoard error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load friends board' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/seasons/current
// ---------------------------------------------------------------------------
async function getCurrentSeason(req, res) {
  try {
    const { season } = await resolveScopeKey('season');
    return res.json({ season: seasonMeta(season) });
  } catch (err) {
    console.error('getCurrentSeason error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load season' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/athletes/:id/card
// ---------------------------------------------------------------------------
async function getAthleteCard(req, res) {
  try {
    const params = parseBoardParams(req.query);
    const { scopeKey, season } = await resolveScopeKey(params.scope);
    const Lift = require('../models/Lift');

    const own = { user: req.params.id, scopeKey, provisional: false };
    let entry;
    if (params.lift === 'sinclair' || !req.query.class) {
      entry =
        (await BoardEntry.findOne({ ...own, sinclair: { $gt: 0 } }).lean()) ||
        (await BoardEntry.findOne(own).sort({ totalKg: -1 }).lean());
    } else {
      entry = await BoardEntry.findOne({ ...own, weightClass: params.weightClass }).lean();
    }
    if (!entry) return res.status(404).json({ success: false, message: 'Athlete not ranked here' });

    const liftIds = [
      entry.snatchLift,
      entry.cleanLift,
      entry.totalSnatchLift,
      entry.totalCleanLift,
    ].filter(Boolean);
    // Independent lookups run in parallel — the card is one round-trip wide,
    // not a sequential chain (matters on high-latency connections).
    const [lifts, following] = await Promise.all([
      Lift.find({ _id: { $in: liftIds } })
        .select('liftType weightKg bodyweightKg liftDate videoUrl pendingReview')
        .lean(),
      Follow.exists({ follower: req.user._id, following: entry.user }),
    ]);
    const byId = Object.fromEntries(lifts.map((l) => [String(l._id), l]));
    const pick = (id) => (id ? byId[String(id)] || null : null);

    return res.json({
      season: seasonMeta(season),
      athlete: {
        id: entry.user,
        name: entry.name,
        avatarUrl: entry.avatarUrl,
        club: entry.club,
        countryCode: entry.countryCode,
        sex: entry.sex,
        weightClass: entry.weightClass,
        ageCategories: categoriesForBirthYear(entry.birthYear),
        following: !!following,
      },
      stats: {
        totalKg: entry.totalKg,
        bodyweightKg: entry.totalBwKg,
        sinclair: entry.sinclair,
        snatchKg: entry.totalSnatchKg,
        cleanKg: entry.totalCleanKg,
      },
      videos: {
        snatch: pick(entry.totalSnatchLift || entry.snatchLift),
        cleanjerk: pick(entry.totalCleanLift || entry.cleanLift),
      },
    });
  } catch (err) {
    console.error('getAthleteCard error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load athlete card' });
  }
}

module.exports = {
  getLeaderboard,
  getMyRank,
  getFriendsBoard,
  getCurrentSeason,
  getAthleteCard,
  // exported for DB-free checks
  parseBoardParams,
  boardFilter,
  METRICS,
};
