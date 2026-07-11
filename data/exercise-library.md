# Oly Exercise Library — how it plugs into the system

> **One of four documents in the Oly Programming System** — the **Training Bible** (the rules), the **Oly Team Program** (the free 5-day / 90-min plan everyone runs), this **Exercise Library** (the movements + load math), and the **Coach-Note Bible** (the voice). This document is the reader's guide; the data itself lives in **`exercise-library.xlsx`** (87 movements). Every canonical **tier, phase, fault, and equipment** term is defined in the Training Bible's *Shared Language* section, and the Library uses those exact terms. *Role: the single source of truth for what movements exist and how each one loads.*

## What the Library is for
The Bible says *how* to program; the Library says *what to pick from and how to load it.* Both the Oly Team engine (deterministic) and the Personalized Coaching engine (AI) read the Library the same way: filter by the athlete's situation → pick a movement → compute its weight from its load basis.

## The columns the engine reads (in `exercise-library.xlsx`)
- **Exercise / Aliases** — the canonical name (one per movement).
- **Category** — competition lift / snatch, clean, jerk variation / pull / squat / press / accessory / core.
- **Primary quality** — the one job it trains.
- **⭐ Load basis** — which max it loads off and the % range (e.g. *"80–88% of snatch max"*, *"own front-squat max"*). This is what makes the weight computable; nothing is programmed without it.
- **Rep & set range · Intensity zone.**
- **Phase suitability** — uses the canonical phases (Base · Strength · Peak · Deload · Taper · Any).
- **⭐ Fault(s) corrected** — written *fault → cause → mechanism*, keyed to the canonical **fault taxonomy** in the Bible's Shared Language, so a logged limiter maps straight to its fix.
- **Experience level** — Developing / Intermediate+ / Advanced (matches the Bible's athlete tiers).
- **Equipment required + substitution** — uses the canonical equipment terms; the paid engine filters on the athlete's onboarding equipment, the Oly Team assumes a full gym.
- **Coaching cues** — the per-movement cues the Coach-Note Bible pulls from for `key_cues`.
- **Contraindications** — feeds the Bible's Safety layer (top of the conflict stack, 10A): an athlete's injury vetoes a movement regardless of what the phase wants.
- **Staple vs situational** — the "everyone does this" filter vs. the "only when a fault calls for it" filter.

## How the three lookups run
1. **Staples** — the work every athlete runs (competition lifts, main squats/pulls) → the *Staple* column.
2. **Fault fixes** — a logged limiter → the movements whose *Fault corrected* matches it.
3. **Phase-appropriate** — only pull movements whose *Phase suitability* includes the current phase.

## Alignment status (the one open plumbing task)
The Library is written in clean prose and is coaching-complete. To be fully machine-driven it still needs a **one-time normalization pass**: turn the prose columns into parsed tags (`parent_lift`, `pct_min`, `pct_max`, `fault_tags[]`, `phase_tags[]`, `equipment_tags[]`, `level`, `staple`) using the **exact** canonical labels from the Bible's Shared Language, so onboarding limiters, Library faults, and Bible §5C all match string-for-string. Until then, the free/paid engines can read it, but the fault and equipment strings must be reconciled to the taxonomy first.
