/**
 * The canonical list of lifts. This file is the only place a lift name,
 * a lift id, or the mapping between them may live.
 *
 * WHY THIS EXISTS
 * `Post.lift_name` was free text, so the same lift arrived as "Clean & Jerk"
 * from the picker and "Clean and Jerk" from a training session. Any query for
 * an athlete's best clean and jerk found some of them, which is the kind of
 * bug that produces a wrong badge rather than an error.
 *
 * THE TWO SPELLINGS
 * `Lift.liftType` (the RANKING model) has used 'snatch' and 'cleanjerk' since
 * the boards were built, and those values are in production data and in every
 * board partition key. The app's catalogue uses 'clean_jerk'. Renaming either
 * one means a migration, so instead both exist and the mapping lives here, in
 * one function, with this comment. Do not spread it.
 *
 * Only snatch and clean & jerk rank. The other ten are trainable lifts that
 * can appear on a post and in badge rules, but never on a leaderboard.
 */

const LIFTS = [
  { id: 'snatch', name: 'Snatch', ranksAs: 'snatch' },
  { id: 'clean_jerk', name: 'Clean & Jerk', ranksAs: 'cleanjerk' },
  { id: 'power_snatch', name: 'Power Snatch', ranksAs: null },
  { id: 'clean', name: 'Clean', ranksAs: null },
  { id: 'power_clean', name: 'Power Clean', ranksAs: null },
  { id: 'jerk', name: 'Jerk', ranksAs: null },
  { id: 'power_jerk', name: 'Power Jerk', ranksAs: null },
  { id: 'back_squat', name: 'Back Squat', ranksAs: null },
  { id: 'front_squat', name: 'Front Squat', ranksAs: null },
  { id: 'overhead_squat', name: 'Overhead Squat', ranksAs: null },
  { id: 'strict_press', name: 'Strict Press', ranksAs: null },
  { id: 'push_press', name: 'Push Press', ranksAs: null },
];

const BY_ID = new Map(LIFTS.map((l) => [l.id, l]));

/** Strip everything that varies between spellings of the same lift. */
function slug(text) {
  return String(text || '')
    .toLowerCase()
    // Strip accents FIRST. Without this, 'envión' slugs to 'envi_n' and
    // 'envion' to 'envion', so the same Spanish word keys twice and one of
    // them never resolves.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_');
}

// Every spelling seen in the wild, plus the obvious ones. Deliberately an
// explicit list: a fuzzy matcher would happily map "snatch grip deadlift"
// onto "snatch" and silently corrupt somebody's best lift.
const ALIASES = new Map();
function alias(id, ...forms) {
  for (const f of forms) ALIASES.set(slug(f), id);
}
for (const l of LIFTS) alias(l.id, l.id, l.name);
// English. Only spellings of the SAME movement, never a different one.
alias('clean_jerk', 'clean and jerk', 'clean & jerk', 'cleanjerk', 'c&j', 'cj', 'clean + jerk');
alias('snatch', 'full snatch', 'squat snatch');
alias('clean', 'full clean', 'squat clean');
alias('jerk', 'split jerk');
alias('power_jerk', 'push jerk'); // the commoner name for it
alias('back_squat', 'squat', 'backsquat');
alias('front_squat', 'fs', 'frontsquat');
alias('overhead_squat', 'ohs', 'overheadsquat');
alias('strict_press', 'military press', 'shoulder press', 'overhead press');
alias('push_press', 'pp', 'pushpress');
alias('power_snatch', 'powersnatch');
alias('power_clean', 'powerclean');

// Spanish. Half this sport speaks it and every Spanish post was resolving to
// null, which means invisible to every lift query.
alias('snatch', 'arranque');
alias('clean_jerk', 'envion', 'dos tiempos', 'envion y arranque', 'clean y jerk');
alias('clean', 'cargada');
alias('power_clean', 'cargada de potencia');
alias('power_snatch', 'arranque de potencia');
alias('jerk', 'envion segundo tiempo', 'segundo tiempo');
alias('back_squat', 'sentadilla', 'sentadilla trasera');
alias('front_squat', 'sentadilla frontal');
alias('overhead_squat', 'sentadilla overhead');
alias('strict_press', 'press militar');

// DELIBERATELY ABSENT, and each one was tried:
//   'hang power snatch' / 'hang power clean' — a DIFFERENT movement, and
//     systematically lighter. Mapping them onto power_snatch/power_clean put
//     the wrong lift on somebody's record, which is the exact thing this
//     table exists to prevent. Every other hang variant already resolved to
//     null, so these two were also the only inconsistent entries.
//   'press' — for a Spanish-speaking user base this reads as press de banca,
//     the bench press, which is not an overhead lift at all.
//   'bs' — a coin-flip abbreviation with no weightlifting claim on it.

/**
 * Resolve arbitrary text to a canonical lift id.
 * Returns null when nothing matches, and the caller stores null. Guessing
 * here would put a wrong lift on somebody's record, which is worse than a
 * gap: a gap is visible, a wrong value is not.
 */
function resolveLiftId(text) {
  if (!text) return null;
  const key = slug(text);
  if (BY_ID.has(key)) return key;
  return ALIASES.get(key) || null;
}

function isLiftId(id) {
  return typeof id === 'string' && BY_ID.has(id);
}

function displayName(id) {
  const l = BY_ID.get(id);
  return l ? l.name : '';
}

/** The Lift.liftType this id ranks as, or null when it does not rank. */
function ranksAs(id) {
  const l = BY_ID.get(id);
  return l ? l.ranksAs : null;
}

module.exports = { LIFTS, resolveLiftId, isLiftId, displayName, ranksAs, slug };
