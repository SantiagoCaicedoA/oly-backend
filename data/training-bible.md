# Oly Training Programming Bible

**Purpose.** This document is the single source of truth the Oly AI coach uses to generate every training program. It encodes settled weightlifting principles (non-negotiable law) and Oly's chosen coaching philosophy (decided with the founder). The AI must follow this document over any generic default.

**How to use it.** For every program, the AI reads the athlete's onboarding data + recent logged performance, then applies the rules below in order. When data is missing, it follows the graceful-degradation defaults (Section 8C). The goal: a sound, personalized, progressive program **every time** — never a random or unsafe week.

> Status: complete (v1.7) — adds a session time-budget and a tier-vs-availability rule. Living document; revise as the coaching philosophy evolves.
> Sections: 1 Philosophy · 2 Movement Library · 3 Intensity & Rep Schemes · 4 Volume & Frequency · 5 Exercise Selection & Fault Correction · 6 Periodization · 7 Autoregulation · 8 Safety, Exceptions & Defaults · 9 Loading Reference Tables · 10 Operating Rules, Data & Protocols · 11 Training Max & Data Integrity · 12 Adherence & Real-Life Adjustment · 13 Competition Day · 14 Advanced & National-Level Athletes.

---

## Section 1 — Philosophy & First Principles

### 1A. Non-negotiable laws (never deviate)

These are settled across credible weightlifting coaching. They are hard law.

1. **The squat is the engine of the total.** Squat strength is the #1 trainable driver of how much an athlete lifts. Squat priority is always high. *(Exception: strength-sufficient advanced athletes — see 14E.)*
2. **Specificity rules.** The competition lifts (snatch, clean & jerk) and their close variations are the primary stimulus. Everything else supports them; nothing replaces them.
3. **Train to develop, not to test.** The majority of work is submaximal. Strength is built in training and *demonstrated* at the meet. Athletes do not get strong by maxing.
4. **Progressive overload.** Load and volume trend upward across a block in a planned way. No random, disconnected weeks — every week knows its place in the block.
5. **Recovery is where adaptation happens.** Fatigue is managed by waving loads and *scheduled* deloads — never by training until breakdown.
6. **Technique is a skill.** It is built through frequency and submaximal volume, not just heavy singles.
7. **Mobility gates strength.** An athlete cannot express strength in a position they cannot achieve.
8. **Pulls are programmed heavier than the lifts** (100%+ of the related competition lift).
9. **Individualize to the limiter.** The athlete's weakest quality gets the emphasis.
10. **Safety is absolute.** Never load through a returning or injured athlete. Contraindications are respected without exception.

### 1B. The Oly System (our chosen approach)

The backbone is a **percentage-based, periodized hybrid** — structured like the systematic (Soviet-rooted) school, sustainable for athletes who are competitive but not necessarily full-time, and scalable from 3 to 6 training days.

**Load prescription — % of 1RM, autoregulated.**
Working weights are prescribed as percentages of the athlete's **true best (confirmed) max** for the matched lift (the single reference — Section 11). Those percentages are then nudged up or down by the daily readiness check-in (sleep, stress, mental readiness) and by recent logged performance. Structure with a brain: the plan is predictable, but a bad-sleep day pulls loads back and a great day allows a push.

**The training year — periodized by phase.**
Programming follows a block progression from general to specific as the meet approaches:

1. **Off-season / Base — hypertrophy & muscle gain.** Far from a meet, build the body: add muscle and work capacity. Higher volume, moderate intensity, more accessory/general-strength work; squats and pulls live in higher rep ranges; the classic lifts are maintained for skill. Bodyweight is allowed to rise as the athlete builds muscle. **Weight-making and nutrition are out of scope** — the AI programs training only and does not manage a weight cut or advise on diet (Section 8).
2. **Strength phase.** Convert the new muscle into maximal strength: heavier squats and pulls, lower reps, classic lifts climbing, accessories trimmed.
3. **Power & Peak.** Express strength as speed: more classic-lift singles and doubles at higher percentages, volume reduced, intensity sharpened, then a taper into the meet (openers, freshness).

**Going heavy — periodic heavy singles.**
Athletes regularly work up to a *heavy* (not maximal) single to stay sharp and gauge readiness, then perform back-off volume. True near-maximal singles are reserved for the peak phase before a meet. We sharpen without grinding.

**Accessory work — moderate and targeted.**
Accessories are chosen to fix the athlete's limiter (Section 5) and to keep joints healthy. The classic lifts, squats, and pulls always remain primary; accessory volume scales up in the off-season (muscle-building) and trims down toward the meet.

**One system, two anchors.**
There is a single training system for every athlete. The *only* difference between someone who competes and someone who doesn't is the **periodization anchor**:
- **Competitor:** counts down to the meet date and peaks for it (Section 6).
- **Non-competitor:** runs the same blocks on a **continuously repeating short cycle** (~5–6 weeks: build → heavy/PR week → short deload, looping), maxes updated each loop so it climbs. The PR week is their "meet" and feeds a verified PR to the leaderboard.

Non-competitors are **not** a different category and get **no different emphasis** — same logic, same movement selection, same intensity, same hypertrophy→strength flow. They simply don't compete. Rules that depend on competition inputs (weight-class management, meet taper) activate only when those inputs exist; otherwise they sit dormant, no special-casing.

### 1C. The hierarchy of strength (what we develop, in priority order)

Every program allocates emphasis down this list, individualized to the athlete's limiter:

1. **Maximal strength — the squat.** Back squat builds the general engine; front squat transfers directly to standing up from cleans and the jerk dip.
2. **The pull.** Pulling strength sets the ceiling on how much bar can be elevated. Programmed above competition-lift loads.
3. **Power — rate of force development.** Turning strength into bar speed via the classic lifts, their power variants, and speed work.
4. **Technique & positions.** Efficiency lets an athlete express the strength they have. Built through accumulated submaximal volume of the classic lifts and close variations.
5. **Mobility.** The gatekeeper for the catch positions (overhead, front rack, bottom of squat).
6. **Consistency / make-rate.** Hitting lifts reliably under fatigue and pressure; built through exposure.

### 1D. How progression is guaranteed

A program only produces progress if it obeys these, so the AI enforces them on every build:

- **Progressive overload** — demand climbs across the block in a planned way.
- **Specificity (SAID)** — the classic lifts and close variations drive the adaptation; accessories support.
- **Develop, don't test** — the bulk of work is submaximal quality volume.
- **Fatigue management** — loads wave; deloads are scheduled; recovery is respected.
- **Individualization** — the weakest quality dictates the emphasis.

### 1E. What "progress" means (and the leaderboard)

The AI optimises for **real long-term progress** — a bigger total over months — **not** for frequent 1RM PRs. By Law #3, most weeks are submaximal building work with no max attempt, and that is correct.

The app rewards progress through **everyday signals** the AI surfaces without anyone maxing: **volume PRs** (most load moved in a session), **rep-at-load PRs** (3 reps at a former double), **make-rate** improvement, **technical milestones** (a fault fixed), and a climbing **estimated-1RM (e1RM) trend**.

The **leaderboard is a discovery-and-comparison tool** — rank and filter by club, city, country, weight class, age; see how everyone's doing; find athletes. It is **not** a programming driver — the AI never adds max attempts to feed it.

---


## Section 2 — The Movement Library

The AI selects exercises by **job**, never randomly. Every movement belongs to a family with one primary purpose. The competition lifts and a squat form the spine of every training day; the other families fill in around them to build strength, positions, and the limiter.

### 2A. The families

**1. Competition lifts — the events.**
*Job:* skill, speed, and make-rate of the actual sport.
*Movements:* Snatch; Clean & Jerk (and the Clean and Jerk trained separately when useful).
*Oly approach:* programmed in **singles and doubles** (occasionally light triples for technique only). These are practiced for quality, not ground out for reps.

**2. Classic variations — targeted tools.**
*Job:* fix a position, build a phase of the pull, or train speed.
*Movements:* power snatch/clean (speed, extension); hang variations at various heights (positions, second pull); block and pause variations (specific position fixes).
*Oly approach:* **floor lifts are primary; variations are added deliberately to address a diagnosed weakness** — not used as the default. (Founder pick: balanced.)

**3. Squats — the strength base.**
*Job:* the engine of the total (Law #1). Present **every training day**.
*Movements:* back squat (general engine), front squat (clean recovery + jerk dip), overhead squat (snatch positions + mobility), pause/tempo squats (positions, off-season hypertrophy).
*Oly approach:* waved heavy/moderate/light across the week; back and front squat alternated by emphasis.

**4. Pulls — pulling strength + posterior-chain muscle.**
*Job:* set the ceiling on bar elevation, and (per Oly) build back and hamstring mass.
*Movements:* snatch pull, clean pull (specific, 100–110%+ of the lift); RDLs, snatch/clean deadlifts, deficit pulls (posterior-chain hypertrophy).
*Oly approach:* specific pulls always present; **posterior-chain hypertrophy pulls (RDLs, deficits, deadlift work) emphasized in the off-season** to build mass, trimmed toward the meet. (Founder pick.)

**5. Overhead / jerk strength — built off a pressing base.**
*Job:* a big, stable overhead expressed in the jerk.
*Movements:* push press (drive), strict press (foundation), behind-neck press/jerk, jerk dips and recoveries.
*Oly approach:* **build the overhead through pressing strength (push press + strict press), then express it in the jerk.** (Founder pick.) Program the **jerk as routine standalone work (from the rack/blocks)** — it is the most-missed part of the C&J and needs dedicated practice, not just riding along with the clean. A **clean-max vs jerk-max** check flags jerk-limited athletes (who clean more than they jerk) for extra jerk emphasis.

**6. Accessories — support & weak points.**
*Job:* fix the limiter and keep joints healthy.
*Movements:* posterior chain (back extensions, GHR), trunk/core, upper back (rows), single-leg, shoulder/knee prehab.
*Oly approach:* **moderate dose, targeted** to the athlete's weakness and health; volume scales up in the off-season (muscle-building), down toward the meet.

### 2B. Selection rules (how families combine)

- **Every training day:** one competition lift (or close variation) **+ a squat.** Non-negotiable on low-frequency weeks (3 days = squat every day).
- **Pulls:** 1–2x/week (more in off-season, as posterior-chain hypertrophy).
- **Overhead/jerk strength:** 1–2x/week.
- **Accessories:** fill remaining session time, chosen for the limiter and joint health.
- **Variation choice** is driven by the diagnosed limiter (see Section 5), never arbitrary.

---


## Section 3 — Intensity Zones & Rep Schemes

All intensity is a **percentage of the athlete's true best (confirmed) max for the matched lift** — this **single reference is used throughout the document** (daily work, zones, variation factors, peaks, openers). When a max is unproven or inflated, the AI works conservatively under it per Section 11 (a data-integrity safeguard, *not* a second denominator). Percentages are then governed by the daily readiness check-in and recent logged performance (autoregulation, Section 7). Numbers below are the planned targets; readiness moves them.

### 3A. Reference intensity zones

| Zone | % of max | Purpose |
|---|---|---|
| Technique / speed | 70–80% | Positions, bar speed, light technique |
| Quality / working | 80–87% | The bread-and-butter training zone |
| Heavy | 88–92% | Strong singles/doubles, intensity exposure |
| Near-max / max | 93%+ | Peak & PR weeks only |

### 3B. Classic lifts (snatch, clean & jerk)

- **Reps:** singles and doubles only. Light triples (≤75%) allowed purely for technique. **Never high-rep.**
- **Normal-week top:** work up to roughly **85–90%**, and on good-readiness days the athlete may climb toward **~92%** (founder pick: "close to 92%, depending on how the body is reacting"). On poor-readiness days, cap at the technique/speed zone (70–80%) and cut volume.
- Practiced for **quality and make-rate**, never ground out under heavy fatigue.

### 3C. Squats (rep scheme waves by phase)

- **Off-season / hypertrophy:** 5s → 3s at ~70–82%. Higher volume, build muscle.
- **Strength:** 3s → 2s at ~82–90%.
- **Peak / PR:** 2s → 1s at ~88–95%+.
- Back and front squat alternated by emphasis; waved heavy/moderate/light across the week.

### 3D. Pulls

- **Specific pulls (snatch/clean pull):** 90–110%+ of the related lift, reps of 3–5. Build pulling strength and positions.
- **Posterior-chain hypertrophy pulls (RDLs, deficits, deadlift work):** reps of 5–8, emphasized in the off-season for back/hamstring mass, trimmed toward the meet/PR week.

### 3E. Overhead / jerk strength

- **Push press:** 3–5 reps (drive).
- **Strict press:** 5–8 reps (pressing/overhead base, hypertrophy).
- **Jerk variations (dips, recoveries, behind-neck):** singles and doubles.

### 3F. Accessories

- **8–15 reps, 2–4 sets**, targeted to the limiter and joint health. Volume up in off-season, down toward a peak/PR week.

### 3G. The "heavy single" protocol (the regular intensity touch)

The way athletes get heavy in a normal week: **ramp to a strong single at ~88–90%** (autoregulated — back off if readiness is low, allow a touch more if flying), then perform **2–4 back-off sets at ~80–85%** for quality volume. A strong single that leaves something in the tank — never a max grind outside peak/PR weeks.

### 3H. Warm-up ramp

Every working set is preceded by a **warm-up ramp** — **3–5 progressively heavier build-up sets** from the empty bar, dropping reps as the weight climbs (e.g. 5 → 3 → 2 → 1) up to the first working load. More ramp sets on heavy days, fewer when light. Never jump cold into a working percentage.

### 3I. Rest between working sets

Main lifts and squats get **full recovery — ~2–4 minutes** (heavier sets = longer rest); quality and safety over density. Accessories can run shorter (~60–90s). The AI accounts for rest time when fitting the session to the athlete's available slot.

### 3J. Weekly heavy exposures

Cap genuinely heavy classic-lift work at **~2–3 exposures per week** (sets at 88%+). The remaining sessions live in the technique/quality zones (70–87%). This governs weekly nervous-system stress alongside the volume landmarks (Section 4F).

---


## Section 4 — Volume & Frequency

### 4A. The spine rule (non-negotiable)

Every training day = **one competition lift (or close variation) + a squat.** The classic lifts are trained frequently (skill needs reps). Volume is **waved** within the week — never hard every day.

### 4B. Default session shape (4–5 exercises)

> Main classic lift (or variation) → a pull or second variation → squat → 1–2 targeted accessories.

A complete weightlifting session that still fits a normal time slot. The AI fills each slot with specific exercises based on the current phase (Section 6) and the athlete's limiter (Section 5).

### 4C. Lift balance — bias toward the weaker lift

Default is balanced snatch / C&J development, **but frequency and volume tilt toward whichever competition lift the athlete's ratios show is lagging** (snatch is normally ~78–83% of C&J — if it's below that, snatch is the limiter and gets the extra emphasis and the heavy day more often).

### 4D. Weekly templates by frequency

Each day is tagged for the main lift's/squat's intensity (**H**eavy / **M**oderate / **L**ight-volume) so the week waves.

**3 days — squat EVERY day (locked):**
- **Day 1 — Snatch emphasis:** Snatch (or variation) · Snatch pull · Back squat **(H)** · posterior-chain accessory
- **Day 2 — C&J emphasis:** Clean & Jerk · Push press *or* clean pull · Front squat **(M)** · trunk/upper-back accessory
- **Day 3 — Mixed / heavy:** work up to a heavy single on the **weaker** lift · Back squat **(L-volume)** · strict press · accessory

**4 days:** Snatch focus · C&J focus · Snatch variation + pull · C&J variation + squat. Squat 3–4 of 4, waved.

**5 days:** Snatch · C&J · Snatch variation + heavy pull · C&J variation + squat · mixed/heavy (weaker lift). Squat 4 of 5.

**6 days:** alternate snatch / C&J emphasis across the week; squat 4–5 of 6 (one day may drop to a pull-only or pause/tempo squat to manage knee load); include a dedicated posterior-chain hypertrophy day in the off-season; one lighter technique/speed day.

### 4E. Frequency guidelines per family

- **Squat:** every day on 3-day weeks; 4–5x on 5–6 day weeks (waved H/M/L).
- **Specific pulls:** 1–2x/week; **posterior-chain hypertrophy pulls** add volume in the off-season.
- **Overhead/jerk strength:** 1–2x/week.
- **Accessories:** most days (1–2 per session), targeted to the limiter and joint health.

### 4F. Volume landmarks — working sets by phase

Volume and intensity move in **opposite directions**: the body cannot recover from high volume and high intensity at once, so as loads climb toward a peak, set counts step down. Counts below are **working sets after the warm-up ramp**, for the **primary** movement in each family (a secondary variation gets ~half).

| Phase | Main classic lift | Squat | Pulls | Accessories | Loads |
|---|---|---|---|---|---|
| **Off-season (hypertrophy)** | 5 sets (doubles) | 5 sets (5→3) | 3–4 sets | 2 (higher reps) | 70–82% |
| **Strength** | 4 sets (singles/doubles) | 4 sets (3→2) | 3 sets | 1–2 | 82–90% |
| **Peak** | 3 sets (singles) | 3 sets (2→1) | 2 sets | drop / minimal | 88–95% |
| **Taper** | 2–3 light singles | 1 light | — | — | openers, light |

- **Deload weeks:** cut total sets ~40% from the phase numbers.
- **Weaker-lift emphasis day:** that lift takes the top of its range; the other classic lift is trimmed or dropped that day.
- **Time-limited session:** protect the main lift + squat first; trim accessories, then pulls. Never exceed what session length and recovery allow (Laws #5, #10).

### 4G. Fitting the session to the clock (time budget)

The AI must **estimate session duration and keep it within the athlete's session length** — never write a 2-hour session and label it 90 minutes. Rough time costs for *heavy* work with proper 2–4 min rest (Section 3I):

| Block | Time |
|---|---|
| General warm-up | ~8–10 min |
| A heavy classic lift (ramp + heavy single + 2 back-offs) | ~30–40 min |
| A 2nd classic lift, same session (already warm) | ~30–40 min |
| One squat | ~15–20 min |
| A pull | ~10–15 min |
| Each accessory | ~8–12 min |

**Key consequence:** two *full, heavy* classic lifts + squat + pulls + accessories **do not fit in 90 minutes** — something must give. Therefore:

- **Shed order when time-capped** (from the 10A stack: time beats phase and limiter): protect the **main lift(s) + squat**; drop **accessories first, then pulls.** Never buy time by cutting rest on max-effort lifts — that kills the quality that makes them worth doing.
- **At ~90 min, do NOT run both lifts full-and-heavy in one session — alternate emphasis (Section 4D).** One lift heavy + a pull + a squat fits comfortably; the other lift gets its own heavy day, plus a moderate/technique touch on the mixed day. **Two quality exposures per lift beat three rushed ones.**
- Both lifts *every* session is possible only by stripping the day (no separate pulls, minimal accessories, low-interference fillers in the rest gaps) — and the second lift always gets the fatigued, lower-quality end. Use this only for an athlete specifically snatch- or jerk-consistency-limited who needs frequency over pull volume.

---


## Section 5 — Exercise Selection & Fault Correction

### 5A. The law: every exercise has an intention (no filler — ever)

Every movement in a program is either:
- **(a) a primary** — a competition lift, squat, or pull building a foundational quality, or
- **(b) a corrective** — chosen to fix a specific diagnosed fault or weakness.

Each exercise must carry its **intention** in its coach-note (e.g. *"Pause snatch — you're losing the bar forward; this forces you to stay over it."*). **If the AI cannot name why an exercise is in the program, it does not belong there.** This is non-negotiable.

### 5B. How faults are diagnosed

The AI selects correctives from three signals, in priority:
1. **Logged misses over time** (strongest) — e.g. "missed 3 snatches forward this week" → prescribe the forward-miss fix.
2. **Onboarding performance gaps** — pulling/positioning, receiving, squat/leg strength, overhead stability.
3. **Lift ratios** — reveal the strength/technical limiter (Section 5D).

### 5C. Fault → Correction library

★ = Oly's preferred go-to (founder's toolbox). Alternatives follow.

| Fault | Likely cause | Corrections |
|---|---|---|
| **Miss snatch FORWARD / press-out / unstable overhead** | Bar loops forward, soft/late lockout, early arm pull, weak overhead | ★ Drop/tall snatch · ★ No-feet snatch · overhead squat · snatch balance · pause in the bottom · behind-neck push press/jerk |
| **Jumping backwards / bar swings forward** | Bar drifts off the body, hips shoot up, weight on toes, not staying over the bar | ★ Pause snatch/clean (knee or mid-thigh) · ★ Lifts from blocks · ★ No-feet · tempo/halting pulls · deficit lifts · RDLs |
| **Cutting the pull short / incomplete extension** | Rushing under, impatience, weak posterior chain, poor timing | ★ Pause at knee then explode · ★ RDLs / posterior-chain strength · ★ High-hang · snatch/clean pulls (full finish) · high pulls |
| **Stuck in the bottom of cleans / can't stand up** | Weak front squat / quads, soft trunk, poor positions | ★ Front squats · ★ Clean + front squat complex · ★ Pause front squats · tempo squats |
| **Missing snatch BEHIND** | Over-pulling back, hips through too hard, leaning back | Overhead squat · snatch balance · bar-path cues · tempo work |
| **Soft / high receiving (catching high, crashing)** | Pulling too high then crashing, slow turnover | Tall/hang variations · no-feet · drop snatch · speed-under work |
| **Jerk forward / soft dip / unstable split** | Dip path, weak drive, foot placement | Jerk dips · pause jerks · jerk recovery · push press · behind-neck jerk |
| **Slow off the floor / weak first pull** | Weak back & posterior chain, positions | Deadlifts · deficit pulls · halting/pause pulls · back strength |
| **Early arm bend (muscling the bar)** | Trying to pull with the arms | Straight-arm pulls · light high pulls · patience cue |

### 5D. Limiter diagnosis from ratios

- **Snatch ÷ C&J** — normal ~78–83%. **Below** → snatch is the limiter (positions/overhead/speed): bias snatch frequency + its correctives. **Above ~83%** → the C&J side lags (usually the jerk or clean recovery): bias there.
- **Front ÷ back squat** — normal ~85%. **Front lagging (<80%)** → clean-recovery / front-rack limiter: prioritise front squats and pause front squats.
- **Power clean ÷ clean** and similar gaps refine whether the issue is pull power vs receiving.
- **Clean ÷ jerk** — if the athlete cleans notably more than they jerk, the **jerk is the limiter**: add routine standalone jerk-from-rack work (Section 2).

### 5E. Injury substitution (respect considerations absolutely)

- **Knee flagged:** cut squat depth/volume, sub box/tempo squats, no maximal/jumping work through pain.
- **Shoulder flagged:** reduce overhead volume, favour stable pressing, avoid behind-neck.
- **Lower back flagged:** reduce heavy pull/deadlift volume, use supported variations.
- **Mobility-blocked position** (can't reach the bottom of an overhead squat, front rack too tight, chronic positional misses): **regress or substitute** the movement (wider grip, box/pin work, higher-catch variation) and flag it — never keep loading a position the athlete can't achieve. Mobility work itself stays advice-only (Section 8A).
- Always stay inside the athlete's stated triggers. Safety overrides programming (Law #10).

### 5F. Accessory menu (bounded — pick to serve the limiter)

Accessories are chosen from this menu by the limiter they serve; dose per Section 3F (8–15 reps, 2–4 sets). Not a free-for-all — no accessory outside a clear job.

| Limiter / goal | Accessories |
|---|---|
| Posterior chain / pull strength | RDLs, back extensions, good mornings, GHR, deficit pulls |
| Leg drive / squat strength | Pause squats, tempo squats, split squats, Bulgarian split squats, leg press |
| Overhead / jerk stability | Strict press, behind-neck press, DB overhead press, Z-press |
| Upper back / positions | Rows (barbell/DB/chest-supported), pull-ups, snatch-grip rows, face pulls |
| Trunk / bracing | Weighted carries, hanging leg raises, planks, back extensions |
| Joint health / prehab | Face pulls, external rotations, band work, tibialis/calf work |

---


## Section 6 — Periodization

Training flows **general → specific**. The athlete builds the body in the off-season, converts it to strength in prep, and expresses it at the peak. Every week knows its place in the block — never an isolated week.

### 6A. The annual model

1. **Off-season / base (no meet in the prep window):** hypertrophy & muscle-gain emphasis (Section 1B) — 5s→3s squats, posterior-chain hypertrophy pulls, more accessory volume, classic lifts maintained for skill. (Weight-making is out of scope — the AI programs training only; see Section 8.)
2. **Strength-biased prep (meet on the calendar):** the bulk of a competition prep. Minimal dedicated hypertrophy — that work was done off-season. 3s→2s squats climbing, classic lifts working toward heavier singles/doubles, heavy pulls, accessories trimmed.
3. **Peak (final ~3–4 weeks):** intensity up, volume down — heavier classic-lift singles, openers rehearsed.
4. **Taper (final ~1.5–2 weeks):** volume cut sharply, **intensity kept** with light-to-moderate singles, accessories dropped — arrive fresh and sharp.

### 6B. Competitor — count down from the meet date

The AI computes weeks-out and maps phases (a long runway gets an off-season hypertrophy block first; a shorter runway goes straight to strength-biased prep):

| Weeks out | Phase |
|---|---|
| > ~16 | Off-season hypertrophy base, then transition |
| ~16 → ~4 | **Strength-biased prep** (the bulk) |
| ~4 → ~2 | Peak (intensity↑, volume↓) |
| Final ~1.5–2 | Taper |

### 6C. Non-competitor — the repeating short cycle (~5–6 weeks)

No date to count to, so the same logic runs on a loop (one system, two anchors — Section 1B):

- **Weeks 1–2:** build (volume, moderate intensity).
- **Weeks 3–4:** intensify (heavier, lower volume), climbing.
- **Week 5:** realization / **PR week** — work up to heavy/near-max singles, attempt PRs (→ verified PR to the leaderboard).
- **Week 6 / end:** short deload.
- **Repeat**, with maxes updated each loop so it climbs.

### 6D. Deload rhythm

**Every 4th week** in build phases (3 progressive weeks + 1 deload, ~40% volume cut). The non-competitor cycle has its own deload built in (week 6). Deloads are scheduled — never earned by breakdown (Law #5). Readiness data can pull a deload *earlier* if fatigue spikes, but never skip a scheduled one.

### 6E. Progression within and across blocks

- **Within a block:** load climbs gradually week to week (small jumps), peaking the week before the deload.
- **Across blocks:** each new block starts slightly higher than the last — progressive overload (Law #4).
- **Re-test maxes** at peak/PR weeks and meets; updated 1RMs recalibrate every percentage going forward.

---


## Section 7 — Autoregulation

The plan (Sections 3–6) is the backbone. Each day the readiness check-in (sleep, stress, mental readiness) and recent logged performance **bend** it — within bounds. The plan leads; the data adjusts.

### 7A. Poor-readiness day → pull back, don't skip
Drop intensity toward the technique/speed zone (~70–80%) and cut volume (fewer sets). Keep training — protect recovery without losing the session. Never force prescribed heavy loads onto a clearly under-recovered athlete (Laws #5, #10).

### 7B. Great-readiness day → hold the plan (discipline over ego)
Run the session exactly as written. Do **not** chase extra weight or push past the plan because the athlete feels good. The plan already contains the heavy days — a great day that lands on a heavy day is executed at the planned top (up to ~92%); a great day on a moderate/light day **stays** moderate/light. Bank the readiness as better quality and recovery. (Founder's call.)

### 7C. Made & missed lifts feed the next prescription
- **Clean makes at the prescribed load** → progress as planned.
- **Misses** → hold or reduce the next exposure's load, and if a pattern appears (e.g. repeatedly missing forward) **insert the matching corrective** from the fault library (Section 5C).

### 7D. Pulling back / early deload — needs BOTH signals
Trigger only when **missed reps AND a poor-readiness streak** align (several rough days plus missed lifts). That combination is real fatigue → reduce loads or pull a scheduled deload earlier. A single bad day is not enough. Never *skip* a scheduled deload (Section 6D).

### 7E. Max updates
Genuine PRs during peak/PR weeks (or a clean lift clearly above the stored max) update the 1RM and recalibrate every percentage going forward (Section 6E), and prompt a verified-PR submission to the leaderboard.

---


## Section 8 — Safety, Exceptions & Defaults

### 8A. Safety overrides everything
No program, percentage, or progression ever takes priority over athlete safety (Law #10). When in doubt, the AI is conservative.

**Mobility (middle path):** the AI does not run a mobility screen or prescribe a mobility program. But when a position clearly blocks a lift — an overhead squat far below the snatch, a too-tight front rack, repeated positional misses — it **regresses or substitutes the movement** (wider grip, box/pin work, a higher-catch variation) and **flags the limitation with brief advice**, rather than loading through it (Law #7). Mobility training itself stays out of scope (advice only).

**Conditioning / work capacity (GPP):** dedicated conditioning is **out of scope** (like nutrition). General work capacity is built through **off-season volume and session density** (Sections 4F, 6A), not a separate module.

### 8B. Special populations

- **True beginner (new to weightlifting):** technique-first, and **loaded by feel to a target rep/RPE, adjusted set to set** — not by percentages, since their 1RM is unreliable and moving. Switch to the percentage system once their lifts stabilise. *(The RPE→% conversion in 9D is for stale-max intermediates, not beginners — a beginner has no reliable max to convert.)* Lighter loads, more reps on positions and variations, **no heavy singles or maxing**, slower progression. Build the movement before the load.
- **Masters (≈40+):** **add recovery automatically** — more frequent deloads, slightly lower volume, longer warm-up ramps, fewer max efforts.
- **Returning athlete** (recent volume = "returning", or phase = "coming back"): true reintroduction — submaximal loads, technique focus, extra warm-ups, **no maximal singles**; build volume over 2–4 weeks toward their available days (Section 4 ramp).
- **Injured / limitations flagged:** apply the substitutions in Section 5E and stay inside the athlete's stated triggers. Pain is a hard stop.
- **Youth / adolescent (under 18):** technique-first and **submaximal — no maximal or near-maximal loading**; emphasise skill, positions, and long-term athletic development over load; conservative progression; higher-rep technical work. *(Product/legal: minors require parental/guardian consent and child-data-privacy handling — a launch requirement beyond programming.)*
- **Female athletes:** **may** tolerate slightly higher training frequency — but the evidence on sex-based volume tolerance is genuinely mixed, so treat this as a *mild lean, not a rule*, and **individualise off logged recovery** rather than systematically adding volume. (Menstrual-cycle phase as a readiness input is a possible future refinement, not required now.)
- **Modifiers stack — most conservative wins.** When an athlete hits several at once (e.g. a 46-year-old female returning from injury), apply all that fit; where they conflict, **the most conservative wins** (recovery and safety over added load).

### 8C. Graceful degradation — defaults when data is missing

The AI **always** produces a sound, safe program; a missing field costs a slightly conservative week, never a broken one. It states the assumption it made in the coach-note.

| Missing / weak input | Default behaviour |
|---|---|
| 1RM missing or marked **Estimated/Unsure** | Estimate from related lifts/ratios; work **5–10% under**; verify before loading heavy |
| Recent training volume missing | Assume conservative ("light–steady"); ramp in |
| Training phase missing | Assume "in a training block" |
| Not competing / no meet | Run the non-competitor repeating cycle (Section 6C) |
| Target total missing | Set a sensible target from current total + timeframe |
| Weight class missing | Skip making-weight logic (no special-casing) |
| Performance gaps missing | Infer the limiter from ratios (Section 5D) |
| Equipment unknown | Program with barbell + bumpers only |
| Session duration missing | Default 60 minutes |
| Rest days missing | Distribute training/rest sensibly across the week |
| Sparse / no check-in data | Run the plan as written, slightly conservative |

### 8D. The never-do rules (hard stops)

1. Never program a true max outside a peak/PR week (or for beginners/returning athletes at all).
2. Never program **through flagged pain**.
3. Never put the classic lifts in **high-rep** sets.
4. Never skip the **warm-up ramp**.
5. Never exceed the athlete's **available days or session length**.
6. Never write a training day **without a squat**.
7. Never include an exercise **without a stated intention** (Section 5A).
8. Never give **weight-cutting, diet, or hydration advice** — nutrition/weight-making is out of scope; program training only.

## Section 9 — Loading Reference Tables & Formulas

*The lookup layer. The logic lives in Sections 1–8; these tables give the AI exact numbers so it never stalls or guesses when assigning a load.*

### 9A. Variation → max conversion factors
Non-competition movements have no logged max. Load them in two steps: **variation max = factor × the base-lift max**, then apply the working % to that.

| Movement | % of base lift |
|---|---|
| Power snatch | 80–88% of snatch |
| Hang snatch (above knee) | 88–92% of snatch |
| Hang snatch (below knee) | 90–93% of snatch |
| Snatch from blocks (knee) | 90–95% of snatch |
| Pause / tempo snatch | 85–92% of snatch |
| Snatch balance | 100%+ of snatch |
| Overhead squat | 100–110% of snatch |
| Power clean | 80–85% of clean |
| Hang clean (above knee) | 88–92% of clean |
| Clean from blocks | 90–95% of clean |
| Front squat | 84–88% of back squat |
| Snatch pull | 100–110%+ of snatch |
| Clean pull | 100–110%+ of clean |
| Snatch / clean deadlift | 100–115%+ of the lift |
| Push press | ~75–85% of jerk |
| Strict press | ~60–70% of push press |

*Example: pause snatch at "80% working load" for a 100 kg snatcher = 80% × 90% (pause factor) ≈ 72 kg.*

### 9B. Prilepin's Chart (volume–intensity law)
Bounds reps-per-set and total reps at each intensity. Hard law. The **classic lifts additionally stay in singles/doubles** regardless (Section 3B).

| Intensity | Reps/set | Optimal total | Range |
|---|---|---|---|
| <70% | 3–6 | 24 | 18–30 |
| 70–80% | 3–6 | 18 | 12–24 |
| 80–90% | 2–4 | 15 | 10–20 |
| 90%+ | 1–2 | ~4 | 4–10 |

The AI must never exceed these (e.g. no 6×2 at 90%).

### 9C. 1RM estimation (missing max)
Fill from these ratios, flag **Estimated**, work 5–10% under until confirmed.

| Missing | Estimate from |
|---|---|
| Clean & jerk | snatch ÷ 0.80 |
| Snatch | 0.80 × C&J |
| Clean | ≈ jerk, or 0.85–0.90 × front squat |
| Jerk | 0.95–1.00 × clean |
| Front squat | 0.85 × back squat |
| Back squat | front squat ÷ 0.85 |

**Never** estimate a classic-lift max from a rep-max formula (Epley, etc.) — the lifts are neurological/technical; reps don't extrapolate.

### 9D. RPE / RIR anchors (beginners & stale maxes)
| RPE | Meaning | ≈ headroom |
|---|---|---|
| 10 | Max, nothing left | 0% |
| 9 | ~1 in reserve | ~2–4% under |
| 8 | ~2 in reserve | ~4–6% under |
| 7 | ~3 in reserve | ~7–10% under |
| ≤6 | Speed/technique, easy | light |

### 9E. Readiness → load (the autoregulation math)
From the daily check-in (sleep, stress, mental readiness, 1–10):

| Readiness | Signal | Adjustment |
|---|---|---|
| **Green** | sleep ≥7, stress ≤4, readiness ≥7 | Run the plan as written (hold — Section 7B) |
| **Amber** | mixed / moderate | −5–7% intensity, drop 1 working set |
| **Red** | sleep ≤4, or stress ≥8, or readiness ≤4 | Cap at technique zone 70–80%, cut volume ~40% |

### 9F. Progression increments & rounding
- **Classic lifts:** +1–2.5 kg/week (or +2–2.5% intensity) within a block.
- **Squats & pulls:** +2.5–5 kg/week.
- **Rounding:** round every load to the nearest achievable increment — default **2.5 kg** (1 kg / 0.5 kg if micro-plates exist). Never prescribe sub-plate numbers (83.7 kg → 82.5 kg).

### 9G. Realistic progression by training age (+ stall rule)
| Training age | Realistic gain |
|---|---|
| Novice (<1 yr) | Weekly–monthly; fast |
| Intermediate (1–3 yr) | Per block / a few kg per month |
| Advanced / competitive (3+ yr) | **2–5 kg per competition lift per YEAR** |

Never chase gains faster than the athlete's level allows — over-reaching causes the injuries and "train-to-test" failures Law #3 forbids.
**Stall rule:** if a max (or e1RM trend) hasn't moved in ~4–8 weeks → change the stimulus (variation, volume/intensity emphasis, attack the limiter), don't just add load.

### 9H. Estimated 1RM (e1RM) — how to compute it
- **Classic lifts (snatch, C&J):** e1RM = **best recent clean single** (optionally bar-speed-adjusted). **Never** extrapolate from reps — reps don't predict a snatch max.
- **Squats, presses, pulls (rep work):** a rep-max formula is fine (Epley: 1RM ≈ weight × (1 + reps/30)).

The "e1RM trend" referenced in Sections 1E and 9G uses these definitions.

---

## Section 10 — Operating Rules, Data & Protocols

### 10A. Conflict-resolution priority stack
When rules collide, **higher wins**:

> **Safety > available time & days > readiness > phase > limiter > lift balance.**

(e.g. limiter says bias snatch, but readiness is red and time is capped → readiness + time win: cut volume, protect the main lift, defer the snatch bias.)

### 10B. Consolidated input schema (single source of truth)
Every field the AI reads per athlete:
- **Maxes** (+ confidence flag Tested/Estimated/Unsure): snatch, C&J, clean, jerk, power snatch/clean, back squat, front squat, OHS
- **Computed ratios:** snatch:C&J, front:back squat, clean:jerk
- **Injuries:** has_limitations, affected_areas, impact_level, triggers
- **Training age** (experience_years) · **recent_training_volume**
- **Availability:** days/week, session_duration, rest_days
- **training_phase** · **training_preference** · **performance_gaps**
- **Competition:** preparing, date, weight_class, target_total
- **Equipment** · **bodyweight + unit** · **sex**
- **Ongoing:** daily check-in (sleep, stress, readiness) + every logged set

### 10C. Max-test & opener protocol
- **Ramp to a true single:** warm-up ramp, then ~5% jumps to ~90%, then 2–3% jumps to max; 1 rep/attempt near the top; 2–4 min rest.
- **Failed attempt:** retry once or drop 2–3%; stop after ~2 misses — never chase a max into repeated failure.
- **Competition opener:** ~88–91% of best/expected max — a weight the athlete hits ~10/10.

### 10D. Missed-week reinsertion
- **Missed ≤1 week** (sick/travel/work): resume ~5–10% under the last completed loads, rebuild one week, then continue.
- **Missed 2–3 weeks:** drop back ~one phase / −10–15%, ramp over 1–2 weeks.
- **Never** resume at the planned (higher) load as if no time was lost.

## Section 11 — Training Max & Data Integrity

Amateurs mis-log and ego-lift, and the percentage engine is only as good as the max it runs on. For this population, **wrong data is more common than missing data** — so the reference number must be robust.

### 11A. One reference: the true (confirmed) max
Every percentage in this document runs off the athlete's **true best confirmed max** for the lift — **one denominator, everywhere** (daily work, zones, variation factors, peaks, openers). The "training max" is **advisory, not a second denominator** — it is how the AI protects against bad data, never a standing discount on a reliable athlete.

### 11B. Distrust unproven maxes (the advisory buffer)
When a recorded max is **unproven** — estimated, a grind, missed-then-made, or not confirmed recently — the AI treats it as likely inflated and works from a **provisional max ~5–10% under the claimed number** until a clean make confirms it, then uses the true value. The reference **self-calibrates**: a clean make above it becomes the new max; repeated grinding/missing lowers the provisional figure. A safeguard against ego-lifts, not a haircut on athletes whose numbers are real.

### 11C. Trust clean makes, discount grinders
A max that was a **slow grind, or missed-then-made,** is not a training reference — treat it as ~5% optimistic. Trust **clean, fast makes.** Use the `strength_accuracy` flag (Tested/Estimated/Unsure) and logged bar-speed/RPE to weight confidence.

### 11D. Sanity-check new inputs
Cross-check any claimed max against the athlete's ratios (Section 9C) and recent logs. A number wildly out of line (e.g. a snatch at 95% of a claimed C&J, or a max far above logged working weights) is flagged low-confidence and worked conservatively until confirmed.

---

## Section 12 — Adherence & Real-Life Adjustment

For working amateurs with jobs, families, and travel, **consistency is the limiter — not periodization nuance.** The AI's job is to keep them progressing through real life, never to guilt-trip.

### 12A. Program what they actually do
The AI compares **scheduled vs logged** sessions and programs for the real attendance pattern, not the sign-up.

### 12B. Chronic under-attendance → collapse the template
If an athlete consistently logs fewer sessions than planned (≈≤60% for ~2 weeks), **drop to a sustainable template** (5-day → 3-day) rather than maintaining a broken plan. Protect the spine (main lift + squat); shed the extras. Offer the switch, don't force it.

### 12C. Missed time → reinsert, don't resume blind
Per Section 10D: missed ≤1 week → resume ~5–10% under, rebuild a week; missed 2–3 weeks → drop back ~a phase, ramp 1–2 weeks. Never continue the planned progression as if no time was lost.

### 12D. No guilt — protect the habit
A missed week or a rough block is normal life, not failure. The AI re-plans matter-of-factly and keeps the streak/habit alive (Hooked model) — it never shames the athlete or piles on volume to "catch up."

---

## Section 13 — Competition Day

The bible does not stop at the gym door. For competitive amateurs, **meet day is where earned kilos are lost** — bad attempt selection, mistimed warm-ups, ego third attempts. Applies only when competing.

### 13A. A taper they can execute
Final 1.5–2 weeks (Section 6A): cut volume sharply, keep intensity light-to-moderate, drop accessories. Simple and followable — **no hero sessions** in the last week.

### 13B. Warm-up-room timing
Work backward from the athlete's expected first-attempt time: ~5–6 warm-up lifts per competition lift, timed so the **last warm-up lands ~1–2 attempts before their opener is called.** Account for how many lifters are ahead and the attempt cadence.

### 13C. Attempt selection
- **Opener:** ~88–91% of best — a weight hit **~10/10**, even on a bad day. Never open on a lift they can miss.
- **Second:** ~93–97% / near a recent best — a realistic, confident jump.
- **Third:** a PR or total-securing weight — chosen by **what the total needs, not ego.**
- **Missed attempt:** repeat the same weight next attempt (don't jump after a miss); if the opener is missed, stay or drop — never chase.

### 13D. Execution reminders
Brief, calming cues: warm-up timing vs the athlete's flow, staying warm between attempts, **one cue per lift**, trust the training. (Weigh-in nutrition/cutting stays out of scope — Section 8.)

## Section 14 — Advanced & National-Level Athletes

The bible's defaults are calibrated **conservative** — correct for Developing/Provincial athletes, but they will **under-train a national lifter**. Provincial and national are not the same setting with the volume turned up; a few non-negotiables change. This section defines an athlete **tier** that unlocks a higher gear. The default bible governs unless a rule here overrides it *for that tier*, and the advanced settings unlock **only for proven, data-reliable, injury-clean athletes.** **Scope:** this tier serves a **national-level athlete training up to 6 sessions/week** — genuine full-time *international* volume needs the two-a-day structure that is intentionally out of scope (14G).

### 14A. The tier system
Set primarily from the onboarding **experience** field (`experience_years`), corroborated by data — **no new onboarding field needed.**

| Tier | Gate |
|---|---|
| **Developing** | Training age <~2 yr, or **any athlete with unproven/estimated maxes**. Runs the default bible as-is. |
| **Provincial** | Experienced (~3–4 yr), competes, maxes confirmed. Default bible. |
| **National+** | Competitive (~5+ yr) **AND** national-caliber numbers **AND** confirmed/clean maxes **AND** injury-clean **AND** strength-sufficient ratios (14E). Unlocks the overrides below. |

**Safety gate:** experience sets the *entry* tier, but the National+ overrides activate only when **all** corroborating conditions hold. If maxes are estimated/unproven or any injury is flagged, the athlete runs the **conservative default regardless of experience.** Unlock the ceiling only for athletes who've earned it and whose data is real.

### 14B. Intensity ceiling & heavy-exposure frequency — National+ (overrides 3B, 3J)
- Normal-week classic-lift work lives **85–95%**, not "peak-only above 92%." Making near-maximal lifts is itself a trained quality that's lost if only touched before a meet.
- **Heavy exposures rise to 4–5/week**; true/near-true singles appear in normal training, not just the peak.

### 14C. Advanced autoregulation — daily max (overrides 7B for National+)
On **green-readiness days**, a National+ athlete works up to a **daily max** (or daily training max) rather than stopping at a capped percentage — this is how national programs capitalise on good days. **Bounded:** daily-max work is used only on the block's *planned* intensity days (not every green day) so it complements — never fights — the proactive-fatigue plan (14H). "Hold the plan" (7B) stays the **default** for all lower tiers.

### 14D. Volume in NL (number of lifts) — monthly management (extends 4F for National+)
Advanced volume is managed in **NL — total classic-lift reps** (competition lifts + close variations; **not** squats/pulls/accessories) — waved by month. **Prilepin governs the session; NL governs the month.** Section 4F set-landmarks remain the reference for Developing/Provincial.

**Honest ceiling for a 6-session week.** With no two-a-days (14G), the realistic quality ceiling is **~600–1000 NL/month** — about what 6 single sessions can hold with good bar speed and technique. The very top of national/international volume (1200–1500+ NL) requires 9–14 sessions/week and is **not deliverable in this structure** — an accepted scope boundary, not a target to chase (a 1500-NL month would demand ~35–40 classic-lift sets *per session*).

| Phase (month) | NL target | Intensity-zone distribution |
|---|---|---|
| Hypertrophy / base | ~800–1000 (High) | ~65% @ 70–80% · ~30% @ 80–90% · ~5% @ 90%+ |
| Strength | ~700–900 (Med) | ~30% @ 70–80% · ~50% @ 80–90% · ~20% @ 90%+ |
| Peak | ~450–600 (Low) | ~15% technique · ~40% @ 80–90% · ~45% @ 90%+ |
| Deload | ~40% cut from the phase | mostly 70–85%, technique |

Wave the month **high → medium → low** across the year; cut ~40% on deload weeks. Session NL must still respect Prilepin (9B) and the per-session set caps (4F) — if the monthly target won't fit 6 quality sessions, the **session cap wins** (never a junk-volume session).

### 14E. Strength-sufficiency check — modifies Law #1 for advanced
Law #1 ("squat priority is always high") is true for developing athletes and **false for a strength-sufficient national athlete** — more squat is then wasted adaptation; the limiter becomes speed, timing, and technical efficiency under load.
- Once ratios are healthy — **front squat ≥ ~125–135% of clean, back squat ≥ ~140% of clean** — **cap squat emphasis** and redirect the freed capacity into the classic lifts, close variations, and **speed / rate-of-force work.**
- Below those ratios, keep chasing the squat.
This shift from *building* strength to *converting* it is what defines advanced programming.

### 14F. More specificity, less general work — National+
- Shorter, less frequent pure-hypertrophy blocks (a mature athlete is near their muscular ceiling).
- Fewer accessories year-round; a higher proportion of classic lifts + close variations.
- **Off-season becomes weight-class-aware:** for an athlete anchored near the top of their class, the default "bodyweight can rise" no longer applies — hypertrophy respects the class ceiling (maintain / strength-bias rather than mass-gain). *(Weight-making and nutrition remain out of scope — this affects training emphasis only.)*

### 14G. Multi-meet annual planning (extends Section 13 for National+)
National athletes navigate a calendar, not one meet:
- **Competition hierarchy:** A-meets (nationals/international) vs B-meets (qualifiers).
- **Mini-peak / mini-taper** for a qualifier — a short unload that does not derail the main peak.
- A **longer, more individualised realization phase** for the A-meet; handle back-to-back meets.
- **Two-a-day training is intentionally NOT supported** (product decision). National volume is delivered within **up to 6 single sessions/week** via higher per-session volume and NL management (14D) — the app never prescribes multiple sessions in one day.

### 14H. Proactive fatigue management (overrides 7D for National+)
At national volumes, "wait for missed reps AND a poor-readiness streak" (7D) is **too reactive** — by the time both fire, the athlete is already dug in. Advanced tiers use **planned unloading microcycles** and cumulative-load monitoring, with deloads possibly more frequent or differently structured at the highest volumes. Fatigue is managed *proactively*, not diagnosed after it shows.

### 14I. Progress expectations near the ceiling (extends 9G)
For a genuine national-level athlete, extend 9G to **0–2 kg/year**. At this level **maintaining a large total and winning is progress**, long plateaus are normal, and the "always show progress" ethos bends hardest here — lean on the process signals (1E). Chasing visible weekly progress on a near-ceiling athlete is how you injure them.

### 14J. When tier exceeds availability (e.g. National+ at 3×/week)

When an athlete's tier outstrips their training time, availability wins (10A):
- The **intensity & skill overrides still apply** — they're advanced and can handle higher percentages and daily-max work.
- The **volume & frequency overrides scale down to what the days allow** — fewer heavy exposures (e.g. ~2/week on a 3-day plan, not 4–5), far lower NL. The session cap and time budget (4G) are never violated to chase a tier target.
- The AI **reframes the goal to maintenance + technical refinement** and tells the athlete honestly: *at this frequency you can stay sharp and strong, but progressing toward that level needs more frequency.* Program the best plan the days allow (Section 4D: alternate emphasis, two quality exposures per lift) rather than a watered-down national plan.

---

## How the AI uses this document

For every program build: read the athlete's onboarding profile + recent logged performance → apply Sections 1–13 in order, then apply the athlete-tier overrides in Section 14 → output the week. Diagnose the limiter (5), place the week in its block (6), select every exercise with an intention (5A), prescribe loads as autoregulated percentages (3, 7), respect frequency/volume (4) and safety/defaults (8). If any exercise can't be justified, it doesn't ship. The result must be a sound, personalized, progressive program **every time**.
