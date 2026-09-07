/**
 * Normalize profile enum fields so frontend can send "male", "KG" etc.
 * and we store schema-canonical values: "Male", "kg".
 */
const { iocCodeForCountry } = require('./iocCountryCodes');

const ENUMS = {
  sex: { values: ['Male', 'Female', 'Other'], key: (v) => (v && String(v).toLowerCase()) },
  // Accept "lb", "LB", "lbs", "kg", "KG" etc. – store as "kg" or "lbs"
  bodyweight_unit: {
    values: ['kg', 'lbs'],
    key: (v) => {
      const s = v && String(v).toLowerCase();
      if (s === 'lb' || s === 'lbs') return 'lbs';
      if (s === 'kg') return 'kg';
      return s;
    },
  },
  preferred_unit: { values: ['Metric', 'Imperial'], key: (v) => (v && String(v).toLowerCase()) },
  strength_accuracy: { values: ['Tested', 'Estimated', 'Unsure'], key: (v) => (v && String(v).toLowerCase()) },
  training_preference: {
    values: ['High Intensity', 'Balanced', 'Higher Volume', 'Adaptive'],
    key: (v) => (v && String(v).toLowerCase().replace(/\s+/g, ' ').trim()),
  },
  // Keys come from the UI already; this mainly turns "" into undefined so an
  // empty selection never trips the schema enum validation.
  training_phase: {
    values: [
      'starting_fresh',
      'in_training_block',
      'post_competition',
      'deload_recovery',
      'coming_back',
    ],
    key: (v) => (v && String(v).toLowerCase().trim()),
  },
  recent_training_volume: {
    values: ['returning', 'light', 'steady', 'heavy'],
    key: (v) => (v && String(v).toLowerCase().trim()),
  },
  recovery_profile: {
    values: ['fast', 'average', 'slow'],
    key: (v) => (v && String(v).toLowerCase().trim()),
  },
};

function findMatch(input, { values, key }) {
  if (input === undefined || input === null) return undefined;
  const k = key(String(input));
  if (!k) return undefined;
  // bodyweight_unit key() can return canonical value directly
  if (k === 'lbs' || k === 'kg') return k;
  const matched = values.find((val) => key(val) === k);
  return matched !== undefined ? matched : input;
}

function normalizeTopLevel(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.sex !== undefined) obj.sex = findMatch(obj.sex, ENUMS.sex);
  if (obj.bodyweight_unit !== undefined) obj.bodyweight_unit = findMatch(obj.bodyweight_unit, ENUMS.bodyweight_unit);
  if (obj.preferred_unit !== undefined) obj.preferred_unit = findMatch(obj.preferred_unit, ENUMS.preferred_unit);
  if (obj.strength_accuracy !== undefined) obj.strength_accuracy = findMatch(obj.strength_accuracy, ENUMS.strength_accuracy);
  if (obj.training_preference !== undefined) obj.training_preference = findMatch(obj.training_preference, ENUMS.training_preference);
  if (obj.training_phase !== undefined) obj.training_phase = findMatch(obj.training_phase, ENUMS.training_phase);
  if (obj.recent_training_volume !== undefined) obj.recent_training_volume = findMatch(obj.recent_training_volume, ENUMS.recent_training_volume);
  if (obj.recovery_profile !== undefined) obj.recovery_profile = findMatch(obj.recovery_profile, ENUMS.recovery_profile);
}

/**
 * Optional means optional: an empty string is never a meaningful profile
 * value, but it trips Mongoose enum validation ("`` is not a valid enum
 * value"). Recursively drop empty-string fields (and empty-string array
 * entries) so a skipped optional question can never fail the whole submit.
 */
function stripEmptyStrings(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim() === '') {
      delete obj[key];
    } else if (Array.isArray(v)) {
      obj[key] = v.filter((item) => !(typeof item === 'string' && item.trim() === ''));
      obj[key].forEach((item) => stripEmptyStrings(item));
    } else if (v && typeof v === 'object') {
      stripEmptyStrings(v);
    }
  }
}

const impactLevel = { values: ['Mild', 'Moderate', 'High'], key: (v) => (v && String(v).toLowerCase()) };

const STRENGTH_SECTIONS = {
  classic: ['snatch', 'clean_jerk'],
  variation: ['power_snatch', 'clean', 'power_clean'],
  squat: ['back_squat', 'front_squat', 'overhead_squat'],
  press: ['strict_press', 'push_press', 'power_jerk', 'jerk'],
};

/**
 * Convert flat strength_stats (legacy) to sectioned format { classic, variation, squat, press }.
 * If already sectioned (has 'classic' or 'variation' etc.), return as-is.
 * Ensures all four sections and all lifts exist with { value, checked }.
 */
function strengthStatsToSectioned(strengthStats) {
  if (!strengthStats || typeof strengthStats !== 'object') return strengthStats;
  if (strengthStats.classic != null || strengthStats.variation != null) return strengthStats;

  const sectioned = {};
  for (const [section, liftKeys] of Object.entries(STRENGTH_SECTIONS)) {
    sectioned[section] = {};
    for (const key of liftKeys) {
      const entry = strengthStats[key];
      sectioned[section][key] = {
        value: entry?.value != null ? entry.value : 0,
        checked: Boolean(entry?.checked),
      };
    }
  }
  return sectioned;
}

function normalizeProfilePayload(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  stripEmptyStrings(obj);
  normalizeTopLevel(obj);
  // Leaderboard identity bridge: onboarding sends a country NAME
  // ("Colombia") but board entries need the IOC code ("COL"). Derive it
  // whenever a name is present and no code was sent explicitly.
  if (obj.country && !obj.countryCode) {
    const code = iocCodeForCountry(obj.country);
    if (code) obj.countryCode = code;
  }
  if (obj.considerations && typeof obj.considerations === 'object' && obj.considerations.impact_level !== undefined) {
    obj.considerations.impact_level = findMatch(obj.considerations.impact_level, impactLevel);
  }
  if (obj.strength_stats != null) {
    obj.strength_stats = strengthStatsToSectioned(obj.strength_stats);
  }
  return obj;
}

module.exports = { normalizeProfilePayload, strengthStatsToSectioned };
