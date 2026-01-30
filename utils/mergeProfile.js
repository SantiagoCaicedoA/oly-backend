/**
 * Deep merge source into target. Used for PUT profile so each onboarding
 * screen can send only its section without wiping other fields.
 * - Objects: merged recursively
 * - Arrays: replaced (e.g. performance_gaps, preferred_rest_days)
 * - Primitives: replaced
 */
function deepMerge(target, source) {
  if (source === null || source === undefined) return target;
  if (typeof source !== 'object' || Array.isArray(source)) return source;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = { deepMerge };
