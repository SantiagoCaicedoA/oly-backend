/**
 * Age categories from birth year, IWF convention (birth YEAR, not birthdate).
 *
 * Categories OVERLAP — a 19-year-old is a junior AND belongs on the open
 * board; a 40-year-old is a master AND belongs on the open board. They are
 * therefore never stored as a single enum: entries store birthYear, and
 * filters are birth-year range predicates. Raw birthYear never leaves the
 * API — responses carry the derived labels from categoriesForBirthYear().
 */

const JUNIOR_MAX_AGE = 20; // junior: age <= 20 in the reference year
const MASTERS_MIN_AGE = 35; // masters: age >= 35 in the reference year

function refYear() {
  return new Date().getUTCFullYear();
}

/** Overlapping labels, e.g. 2007 in 2026 -> ["open", "junior"]. */
function categoriesForBirthYear(birthYear, year = refYear()) {
  if (!birthYear) return ['open'];
  const age = year - birthYear;
  const cats = ['open'];
  if (age <= JUNIOR_MAX_AGE) cats.push('junior');
  if (age >= MASTERS_MIN_AGE) cats.push('masters');
  return cats;
}

/**
 * Mongo predicate fragment for an age filter value.
 * "open" (or anything unknown) imposes no restriction.
 */
function birthYearPredicate(ageFilter, year = refYear()) {
  if (ageFilter === 'junior') return { birthYear: { $gte: year - JUNIOR_MAX_AGE } };
  if (ageFilter === 'masters') return { birthYear: { $lte: year - MASTERS_MIN_AGE } };
  return {};
}

module.exports = {
  JUNIOR_MAX_AGE,
  MASTERS_MIN_AGE,
  categoriesForBirthYear,
  birthYearPredicate,
};
