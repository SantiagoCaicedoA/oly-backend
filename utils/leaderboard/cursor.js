/**
 * Cursor pagination for board queries — never offset-based.
 *
 * The cursor is the (metric value, tie-break date, user id, next rank)
 * 4-tuple of the last row served, matching the index order (value desc,
 * date asc, user asc), so page N+1 resumes exactly where page N stopped
 * regardless of concurrent inserts, and the walk stays inside the index.
 */

function encodeCursor(value, tieDateMs, userId, nextRank) {
  return Buffer.from(
    JSON.stringify([value, tieDateMs, String(userId), nextRank])
  ).toString('base64url');
}

/**
 * A cursor is the 4-tuple (value, tieDateMs, userId, nextRank) — the sort
 * position of the last row served plus the rank the next page starts at,
 * so paginated pages never need a rank count: one query per page.
 *
 * KNOWN EDGE (disclosed, accepted): nextRank is derived state. A page
 * rendered from an old cursor shows ranks as of when the cursor was
 * minted; lifts landing mid-scroll shift the board underneath it. Low
 * stakes — rows are shifting anyway and refetch-on-focus resets — but it
 * is a property of the scheme, not an accident. A cursor is only valid
 * for the exact filter set that minted it.
 *
 * Anything that isn't a well-formed 4-tuple decodes to null and the
 * request is served as page 1. No legacy formats: nothing has shipped.
 */
function decodeCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const [value, tieDateMs, userId, nextRank] = parsed;
    if (typeof value !== 'number' || typeof tieDateMs !== 'number' || !userId) return null;
    if (typeof nextRank !== 'number' || !Number.isFinite(nextRank) || nextRank < 1) return null;
    return { value, tieDateMs, userId, nextRank };
  } catch {
    return null;
  }
}

/**
 * "Strictly after the cursor row" predicate for sort
 * { [metric]: -1, [tieField]: 1, user: 1 }.
 */
function cursorPredicate(metricField, tieField, cur) {
  const tieDate = new Date(cur.tieDateMs);
  return {
    $or: [
      { [metricField]: { $lt: cur.value } },
      { [metricField]: cur.value, [tieField]: { $gt: tieDate } },
      { [metricField]: cur.value, [tieField]: tieDate, user: { $gt: cur.userId } },
    ],
  };
}

/**
 * "Strictly better than this row" predicate — used for rank counts
 * (rank = betterCount + 1) under any filter set.
 *
 * NOTE: as a single $or, Mongo's OR-plan FETCHes documents, breaking the
 * covered-count property (review finding #1, observed empirically in the
 * phase-1 bench: docsExamined=50). Prefer betterThanBranches below, which
 * asks the same question as three simple single-range counts — each one
 * index-only — summed by the caller. Kept for the paginated-page predicate
 * composition test and reference.
 */
function betterThanPredicate(metricField, tieField, value, tieDate, userId) {
  return {
    $or: betterThanBranches(metricField, tieField, value, tieDate, userId),
  };
}

/**
 * The same "strictly better" question as three simple predicates. Each is a
 * tight range on the compound index (equality prefix + one range), so each
 * count stays inside the index — zero documents examined. Run them in
 * parallel and sum.
 */
function betterThanBranches(metricField, tieField, value, tieDate, userId) {
  return [
    { [metricField]: { $gt: value } },
    { [metricField]: value, [tieField]: { $lt: tieDate } },
    { [metricField]: value, [tieField]: tieDate, user: { $lt: userId } },
  ];
}

module.exports = {
  encodeCursor,
  decodeCursor,
  cursorPredicate,
  betterThanPredicate,
  betterThanBranches,
};
