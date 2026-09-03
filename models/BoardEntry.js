const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * BoardEntry — the materialized read model the leaderboard serves from.
 * One document per (user, scopeKey, weightClass); reads NEVER touch the
 * Lift log. Derived data: scripts/rebuildBoards can regenerate everything.
 *
 * Weight class comes from the bodyweight ON THE LIFT (class-set versioned),
 * never from the profile — an athlete near a class line legitimately holds
 * entries in two classes, like real competition.
 *
 * best*  = lifts that RANK IN THIS ENTRY'S CLASS (single-lift boards).
 * total* = components of THIS ENTRY'S TOTAL, possibly borrowed from a
 *          lighter class per the §4.5 boundary rule (total + Sinclair rank
 *          in the heavier contributing class). The total board reads only
 *          total*, the single-lift boards only best* — so one lift can
 *          never rank on two class boards.
 *
 * Per-metric tie-break dates: a snatch tie is decided by when the snatches
 * happened, not by when a C&J later completed the total (rev 5).
 */
const BoardEntrySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scopeKey: { type: String, required: true }, // "S1" | ... | "alltime"
    weightClass: { type: String, required: true },
    classSetVersion: { type: String, required: true }, // e.g. "v2025-06"

    // Ranks in this entry's class (single-lift boards)
    bestSnatchKg: { type: Number, default: null },
    snatchLift: { type: Schema.Types.ObjectId, ref: 'Lift', default: null },
    snatchBwKg: { type: Number, default: null },
    bestCleanKg: { type: Number, default: null },
    cleanLift: { type: Schema.Types.ObjectId, ref: 'Lift', default: null },
    cleanBwKg: { type: Number, default: null },

    // Components of this entry's total (may be borrowed from a lighter class)
    totalSnatchKg: { type: Number, default: null },
    totalSnatchLift: { type: Schema.Types.ObjectId, ref: 'Lift', default: null },
    totalCleanKg: { type: Number, default: null },
    totalCleanLift: { type: Schema.Types.ObjectId, ref: 'Lift', default: null },
    totalKg: { type: Number, default: null },
    totalBwKg: { type: Number, default: null }, // heavier contributing bodyweight — what Sinclair used
    sinclair: { type: Number, default: null },
    sinclairSetVersion: { type: String, default: null },

    // Per-metric tie-break dates (each board breaks ties on ITS OWN date)
    snatchAchievedAt: { type: Date, default: null },
    cleanAchievedAt: { type: Date, default: null },
    totalAchievedAt: { type: Date, default: null },

    // Onboarding 1RMs, no video yet: excluded from every public board
    // (enforced by the partial indexes), visible only via /leaderboard/me.
    provisional: { type: Boolean, default: false },

    // Canonical class-partition ranks, maintained by the phase-2 renumber
    // worker (idempotent sorted recompute + $set — never $inc). Sinclair
    // rank is NEVER materialized: its (scope, sex) partition is ~25k at
    // target scale and is always served by the covered count instead.
    ranks: {
      total: { type: Number, default: null },
      snatch: { type: Number, default: null },
      clean: { type: Number, default: null },
    },

    // Denormalized identity (inline-synced on profile edit — identity ONLY;
    // never weightClass, never an age category)
    name: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    club: { type: String, default: null },
    countryCode: { type: String, required: true }, // IOC code
    sex: { type: String, enum: ['M', 'F'], required: true },
    birthYear: { type: Number, default: null }, // never exposed raw via the API
  },
  { timestamps: true }
);

/**
 * Board indexes (design doc §4.2, rev 5) — one per sortable metric, each
 * tie-breaking on its own achieved-at date, user last for a provably stable
 * cursor; countryCode + birthYear as trailing keys so filtered queries AND
 * filtered rank counts are covered (index-only, no document fetches).
 *
 * ALL FOUR ARE PARTIAL on { provisional: false }: provisional entries never
 * occupy the board indexes, and every board query carries the matching
 * equality so the planner selects them.
 *
 * The Sinclair index is additionally partial on { sinclair: { $gt: 0 } } —
 * and the Sinclair board query MUST carry sinclair: { $gt: 0 }: a bare sort
 * does not imply the partial filter and the planner would silently skip
 * the index (rev 5 finding #2).
 */
const partialBoard = { partialFilterExpression: { provisional: false } };

BoardEntrySchema.index(
  { scopeKey: 1, sex: 1, weightClass: 1, totalKg: -1, totalAchievedAt: 1, user: 1, countryCode: 1, birthYear: 1 },
  { name: 'board_total', ...partialBoard }
);
BoardEntrySchema.index(
  { scopeKey: 1, sex: 1, weightClass: 1, bestSnatchKg: -1, snatchAchievedAt: 1, user: 1, countryCode: 1, birthYear: 1 },
  { name: 'board_snatch', ...partialBoard }
);
BoardEntrySchema.index(
  { scopeKey: 1, sex: 1, weightClass: 1, bestCleanKg: -1, cleanAchievedAt: 1, user: 1, countryCode: 1, birthYear: 1 },
  { name: 'board_clean', ...partialBoard }
);
BoardEntrySchema.index(
  { scopeKey: 1, sex: 1, sinclair: -1, totalAchievedAt: 1, user: 1, countryCode: 1, birthYear: 1 },
  {
    name: 'board_sinclair',
    partialFilterExpression: { provisional: false, sinclair: { $gt: 0 } },
  }
);
BoardEntrySchema.index({ user: 1, scopeKey: 1, weightClass: 1 }, { unique: true });

module.exports = mongoose.model('BoardEntry', BoardEntrySchema);
