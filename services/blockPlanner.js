/**
 * Block planner — turns a season template into a stored TrainingBlock (the forward
 * plan) for an athlete, tracks which week they're on (rolling calendar), and rolls
 * to the next season when a block completes. This is the deterministic TEAM plan
 * generator; the personalized (paid) generator will produce a richer plan into the
 * same model.
 */
const TrainingBlock = require('../models/TrainingBlock');
const { SEASONS, SEASON_ROTATION } = require('../data/season-blocks');
const { getWeekStart } = require('./trainingWeekService');

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Build the per-week forward map (the intention summary) from a season template. */
function buildPlanMap(season) {
  return season.weeks.map((w) => ({
    week: w.week,
    phase: w.phase,
    acc: w.acc,
    top_intensity: w.main ? w.main.top : null,
    squat_pct: w.squat ? w.squat.pct : null,
    is_deload: w.phase === 'Deload',
    is_special: w.acc === 'max' || w.acc === 'test',
    note: w.note,
  }));
}

/** Which week of the block is it today (1..weeks_total, clamped). */
function currentWeekIndex(block, now = new Date()) {
  const wk = Math.floor((now.getTime() - new Date(block.start_date).getTime()) / WEEK_MS) + 1;
  return Math.max(1, Math.min(block.weeks_total, wk));
}

/** Has the block run past its final week? */
function isComplete(block, now = new Date()) {
  return Math.floor((now.getTime() - new Date(block.start_date).getTime()) / WEEK_MS) + 1 > block.weeks_total;
}

/** Next season in the rotation (Base -> Peak -> Base ...). */
function nextSeasonKey(prevKey) {
  if (!prevKey) return SEASON_ROTATION[0];
  const i = SEASON_ROTATION.indexOf(prevKey);
  return SEASON_ROTATION[(i + 1) % SEASON_ROTATION.length];
}

/** Create and store a new block for a season starting on a given (Sunday) date. */
async function createBlock(user, seasonKey, startDate, extra = {}) {
  const season = SEASONS[seasonKey];
  if (!season) throw new Error('Unknown season: ' + seasonKey);
  return TrainingBlock.create({
    user: user._id,
    tier: 'team',
    season_key: season.key,
    season_name: season.name,
    start_date: startDate,
    weeks_total: season.weeks_total,
    ending: season.ending,
    plan: buildPlanMap(season),
    status: 'active',
    ...extra,
  });
}

/**
 * Get the athlete's active block — creating the first one, or rolling to the next
 * season if the current one has finished. `options.seasonKey` forces a season
 * (used for testing / a chosen starting season); default is the rotation start (Base).
 */
async function getOrCreateActiveBlock(user, options = {}) {
  const now = options.now || new Date();
  let block = await TrainingBlock.findOne({ user: user._id, status: 'active' }).sort({ createdAt: -1 });

  if (block && isComplete(block, now)) {
    block.status = 'completed';
    await block.save();
    block = await createBlock(user, nextSeasonKey(block.season_key), getWeekStart(now));
  }
  if (!block) {
    block = await createBlock(user, options.seasonKey || SEASON_ROTATION[0], getWeekStart(now));
  }
  return block;
}

module.exports = {
  buildPlanMap,
  currentWeekIndex,
  isComplete,
  nextSeasonKey,
  createBlock,
  getOrCreateActiveBlock,
};
