/**
 * Versioned IWF bodyweight class tables.
 *
 * Classes change roughly each Olympic cycle (last revision effective
 * 2025-06-01), so entries never store a hardcoded label alone — they store
 * the bodyweight and the class-set version, and labels are derived here.
 * A future IWF revision is a new table added to CLASS_TABLES, never a
 * migration of historical BoardEntries.
 */

const CLASS_TABLES = {
  'v2025-06': {
    // Upper bound (kg) per class; the last class is open-ended.
    M: [60, 65, 71, 79, 88, 94, 110],
    F: [48, 53, 58, 63, 69, 77, 86],
  },
};

const CURRENT_CLASS_SET = 'v2025-06';

/**
 * Class label for a bodyweight, e.g. (80.4, 'M') -> "88", (112, 'M') -> "+110".
 * @param {number} bodyweightKg
 * @param {'M'|'F'} sex
 * @param {string} [version]
 */
function classForBodyweight(bodyweightKg, sex, version = CURRENT_CLASS_SET) {
  const table = CLASS_TABLES[version];
  if (!table || !table[sex]) throw new Error(`Unknown class table ${version}/${sex}`);
  const bounds = table[sex];
  for (const bound of bounds) {
    if (bodyweightKg <= bound) return String(bound);
  }
  return `+${bounds[bounds.length - 1]}`;
}

/** All class labels for a sex, in ascending order (for validation / filters). */
function classLabels(sex, version = CURRENT_CLASS_SET) {
  const bounds = CLASS_TABLES[version][sex];
  return [...bounds.map(String), `+${bounds[bounds.length - 1]}`];
}

/** True when `label` names a class heavier than or equal to `other`. */
function isHeavierOrEqualClass(label, other, sex, version = CURRENT_CLASS_SET) {
  const order = classLabels(sex, version);
  return order.indexOf(label) >= order.indexOf(other);
}

module.exports = {
  CLASS_TABLES,
  CURRENT_CLASS_SET,
  classForBodyweight,
  classLabels,
  isHeavierOrEqualClass,
};
