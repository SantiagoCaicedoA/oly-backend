/**
 * Normalize profile enum fields so frontend can send "male", "KG" etc.
 * and we store schema-canonical values: "Male", "kg".
 */
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
}

const impactLevel = { values: ['Mild', 'Moderate', 'High'], key: (v) => (v && String(v).toLowerCase()) };

function normalizeProfilePayload(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  normalizeTopLevel(obj);
  if (obj.considerations && typeof obj.considerations === 'object' && obj.considerations.impact_level !== undefined) {
    obj.considerations.impact_level = findMatch(obj.considerations.impact_level, impactLevel);
  }
  return obj;
}

module.exports = { normalizeProfilePayload };
