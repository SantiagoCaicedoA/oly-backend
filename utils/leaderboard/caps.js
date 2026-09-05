/**
 * Absolute plausibility caps per sex (design doc §5): the ONLY thing that
 * hard-holds a lift before ranking. Seeded above world-record territory —
 * a weight that is almost certainly fake shouldn't spend even an hour at
 * #1, but nothing a human has plausibly lifted should ever trip these.
 *
 * Absolute caps rather than a relative "PR jump" gate on purpose:
 * beginners legitimately jump 10%+, while sophisticated fraud is a quiet
 * 3% bump (§12.4).
 *
 * OPEN CONFIG (decisions log): per-class values remain a product decision
 * to seed from national records; until then these per-sex ceilings are the
 * conservative floor of the mechanism. Tighten per class later — the
 * shape below already supports it via CLASS_OVERRIDES.
 */

const SEX_CAPS = {
  M: { snatch: 230, cleanjerk: 275 }, // WR territory ~225/267 (+margin)
  F: { snatch: 155, cleanjerk: 195 }, // WR territory ~149/187 (+margin)
};

// Optional per-class tightening: { M: { '60': { snatch: 170, ... } } }
const CLASS_OVERRIDES = {};

/** True when the weight crosses the absolute plausibility cap. */
function crossesPlausibilityCap(weightKg, liftType, sex, weightClass) {
  const override =
    CLASS_OVERRIDES[sex] &&
    CLASS_OVERRIDES[sex][weightClass] &&
    CLASS_OVERRIDES[sex][weightClass][liftType];
  const cap = override != null ? override : SEX_CAPS[sex] && SEX_CAPS[sex][liftType];
  if (cap == null) return false;
  return weightKg > cap;
}

module.exports = { SEX_CAPS, CLASS_OVERRIDES, crossesPlausibilityCap };
