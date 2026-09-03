/**
 * Versioned Sinclair coefficients (IWF revises them each Olympic cycle,
 * same treatment as the class table — see classTable.js).
 *
 * Score = total * 10 ^ (A * X^2), X = log10(bodyweight / b), for
 * bodyweight < b; athletes at or above b score their raw total.
 */

const SINCLAIR_TABLES = {
  // 2021–2024 cycle coefficients. Update by ADDING a new version when the
  // 2025–2028 values are published/adopted — never by editing in place.
  'v2021-2024': {
    M: { A: 0.722762521, b: 193.609 },
    F: { A: 0.787004341, b: 153.757 },
  },
};

const CURRENT_SINCLAIR_SET = 'v2021-2024';

/**
 * @param {number} totalKg  snatch + clean & jerk (kg)
 * @param {number} bodyweightKg
 * @param {'M'|'F'} sex
 * @returns {number} Sinclair points, rounded to the nearest integer
 */
function sinclairScore(totalKg, bodyweightKg, sex, version = CURRENT_SINCLAIR_SET) {
  const c = SINCLAIR_TABLES[version] && SINCLAIR_TABLES[version][sex];
  if (!c) throw new Error(`Unknown Sinclair table ${version}/${sex}`);
  if (!totalKg || !bodyweightKg) return null;
  if (bodyweightKg >= c.b) return Math.round(totalKg);
  const x = Math.log10(bodyweightKg / c.b);
  return Math.round(totalKg * Math.pow(10, c.A * x * x));
}

module.exports = { SINCLAIR_TABLES, CURRENT_SINCLAIR_SET, sinclairScore };
