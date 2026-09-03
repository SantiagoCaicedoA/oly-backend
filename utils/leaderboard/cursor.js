/**
 * Cursor pagination for board queries — never offset-based.
 *
 * The cursor is the (metric value, tie-break date, user id) triple of the
 * last row served, matching the index order (value desc, date asc, user
 * asc), so page N+1 resumes exactly where page N stopped regardless of
 * concurrent inserts, and the walk stays inside the index.
 */

function encodeCursor(value, tieDateMs, userId) {
  return Buffer.from(JSON.stringify([value, tieDateMs, String(userId)])).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const [value, tieDateMs, userId] = JSON.parse(
      Buffer.from(String(cursor), 'base64url').toString('utf8')
    );
    if (typeof value !== 'number' || typeof tieDateMs !== 'number' || !userId) return null;
    return { value, tieDateMs, userId };
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
 * (rank = betterCount + 1) under any filter set, walking the covered index.
 */
function betterThanPredicate(metricField, tieField, value, tieDate, userId) {
  return {
    $or: [
      { [metricField]: { $gt: value } },
      { [metricField]: value, [tieField]: { $lt: tieDate } },
      { [metricField]: value, [tieField]: tieDate, user: { $lt: userId } },
    ],
  };
}

module.exports = { encodeCursor, decodeCursor, cursorPredicate, betterThanPredicate };
