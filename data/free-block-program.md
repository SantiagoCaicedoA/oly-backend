# Oly Team Program — The Season Blocks

> **One of four documents in the Oly Programming System** — the **Training Bible** (the rules), this **Oly Team Program** (the free plan everyone runs), the **Exercise Library** (the movements + load math), and the **Coach-Note Bible** (the voice). This program is the **Training Bible compiled into a fixed, shared plan** — every rule here traces back to the Bible; every movement and load basis comes from the Exercise Library; every canonical **tier, phase, fault, and equipment** term is defined in the Bible's *Shared Language* section and used exactly. *Role: the free 5-day / 90-minute program.*

**What this is — the Oly Team.** Oly is your weightlifting club — online. Every member gets **Oly Team**: a free training program of **90-minute sessions, 5 days a week**, plus a path to competing (verified PRs, rankings, testing days) and a community to train alongside. The same deal people pay a monthly membership for at a physical club — *programming, the app, the community* — minus the in-person floor. This document is the Team **programming**.

**The Team program — personally timed, not personalized.** Everyone on Oly Team runs the same seasons, and loads come from *each athlete's own maxes* — but each member is on their **own start date** (a rolling calendar), so everyone gets the full block from *their* week 1, safely ramped in, and nobody parachutes into the middle of someone else's peak week. "On the Oly program" is the shared identity; community moments come from the feed, not from forcing everyone onto the same day. (Rolling costs exactly the same as a synced calendar — the same deterministic template, just offset per member.)

**Personalized Coaching is the paid layer on top** — the same Bible, but applied *live* by the AI to build and adjust a plan around *you* for *your* meet, with days/week and session length flexed to your needs. Exactly like a club coach individualizing a competitor's prep on top of the Team programming.

---

## How a member moves through the program (the calendar)

1. **Intro block (2–3 weeks) — the on-ramp.** Every new member starts *here*, never mid-wave. Submaximal, technique-first, RPE-based. Its job: teach the app, groove positions, and establish reliable working maxes. It ends by locking in starting numbers — which also seeds their first leaderboard entry, an early win.
2. **Season rotation.** After the intro, the member begins the rotation on their own timeline: **Base Season (12 wk) → Peak Season (12 wk) → Base → Peak …**. Base first, because you build before you peak. Their max-out lands at *their* Peak Week 12.
3. **Community moments:** a continuous feed of members hitting their personal Max-Out Days — always-fresh PRs rolling into the feed and onto the leaderboard, rather than one synchronized day. The community energy comes from the constant stream, not a scheduled event.

Which season and week a member is on is a pure function of their own start date. Deterministic, no global calendar to parachute into.

**Continuation (Base → Peak):** when a Peak Season *immediately follows* a completed Base Season, skip Peak's first 1–2 re-accumulation weeks — the athlete already banked that volume, so start them nearer the strength phase and get to the peak faster. A member who starts *cold* on Peak (no recent Base) gets the full ramp. One flag ("just finished Base?"), still deterministic — it just smooths the redundant re-base at the seam between blocks.

## Keeping maxes honest between tests (auto-adjust, both ways)

A member may train for months between max-outs, so the stored max has to stay honest on its own — otherwise every percentage runs wrong. The bible's training-max logic is symmetric (9H): clean makes raise it, repeated grinding/missing lowers it. So the stored max moves **both ways**, deterministically.

**Up.** When a member logs a clean single (not a miss) above their stored max on a classic lift — which the Day 5 tops and the peak weeks naturally produce — auto-raise the stored max to that weight. Guardrails: clean makes only, and cap a single jump to ~3–4% so a mis-logged number can't inflate everything.

**Down (the self-heal).** If a member repeatedly misses weights they *should* make — say 3 misses in 2 weeks at loads **below ~85%** of their stored max — shave the max a few percent and flag it. The trick is *which* misses count: missing at 90%+ is normal and never lowers the max; missing at 78% repeatedly is the signal the stored number is inflated (a bad onboarding entry, or an ego lift on Max-Out Day). This is what turns the system from one that only rewards good data into one that *fixes* bad data — the exact population the bible worries about.

Both directions are deterministic, use the miss data already logged (`was_it_a_miss`), and cost nothing. For beginners the up-adjust stays off until they have reliable maxes, and the down-adjust simply loosens their (already submaximal) loads.

### Crossing blocks: earned, never assumed

**A block never trains off a number the athlete hasn't demonstrated.** This is the rule that keeps successive cycles honest — assumed gains compound into a progressively overfaced program.

- **Squats:** the Base Season ends in a *true work-up to a 3-rep-max* (a real top-end triple, not a fixed percentage of the old max). That 3RM converts to an estimated max via the bible's e1RM rule (9H: 1RM ≈ weight × (1 + reps/30)), and **that estimate becomes the squat max the next block trains off.** If the squat held flat, the next block loads flat — no invented gain.
- **Classic lifts:** they're *not* max-tested in a block (only technical singles), so the stored snatch/C&J max carries forward **unchanged** and rises only via the auto-bump rule above — when a heavier clean single is actually made. The PR is *attempted* on Max-Out Day, never assumed into the training loads beforehand.

---

## The 5-day weekly skeleton (shape constant; fill & loads change by season)

**Five days a week, 90 minutes a session** — the Oly Team standard. Every day fits the 90-minute budget (Bible 4G): warm-up (~10) + main classic lift (~30–35) + a pull or variation (~15) + a squat (~15–20) + 1–2 targeted accessories (~10). Loads are a **% of the athlete's own max** for the matched lift; every movement below (and its exact load basis) comes from the **Exercise Library** — this skeleton just says *which job* each slot fills.

| Day | Theme | Main work |
|---|---|---|
| **Day 1 (Mon)** | Snatch + Squat | Snatch · Snatch Pull · Back Squat |
| **Day 2 (Tue)** | Clean & Jerk + Squat | Clean & Jerk · Clean Pull · Front Squat |
| **Day 3 (Wed)** | Snatch skill + Strength | Snatch variation (Tall/Hang/Blocks) · Back Squat · Overhead (Snatch Balance / Push Press) · RDL |
| **Day 4 (Thu)** | Power + Jerk | Power Snatch · Power Clean & Jerk · **Jerk from rack (dedicated)** · Front Squat |
| **Day 5 (Fri)** | Snatch + C&J to a top | Snatch · Clean & Jerk · Back Squat |
| Sat / Sun | Rest | (Personal Max-Out / Test Day lands on the final Sunday of the season) |

Frequency: snatch 4x, clean & jerk 3x, dedicated jerk 1x, squat 4x, pulls 2x, overhead + posterior 1x. The standalone jerk (Day 4) is deliberate — it's the most-missed piece on test day, so it gets its own work.

**The skeleton is recognizable across both seasons, but the *fill* differs:** Base Season adds hypertrophy accessories (below); Peak Season strips them to protect recovery for the heavy work.

### Standing readiness rule (printed on every heavy day) — the Team's safety valve
> **Rough day?** Bad sleep, high stress, or beat up — drop the classic lifts to the **70–80% zone**, cut one set on the main work, and skip the top single. A missed heavy day costs more than a light one. Train tomorrow.

---

## Peak Season — the 12-week block (ends in a true max)

Near-max exposure spans weeks 7, 9, 10, 11 (four heavy weeks) so members rehearse max lifting before testing. Pulls start at 100%+. "S/CJ" = snatch / clean & jerk.

| Wk | Phase | S / CJ | S / CJ reps | Squat | Pulls | Purpose |
|---|---|---|---|---|---|---|
| **1** | Base | 72–77% | 2×2–3 | 4×5 @72% | 4×3 @100% | Build the base — positions and volume. |
| **2** | Base (peak vol) | 75–80% | 2×2 | 5×4 @76% | 4×3 @103% | Highest base volume — the work that pays later. |
| **3** | Strength | 80–84% | 2×1–2 | 5×3 @82% | 3×3 @105% | Heavier bars, own the positions. |
| **4** | **Deload** | ≤75% | 2×2 (fewer) | 3×4 @70% | 3×3 @100% | Planned recovery — absorb the base. |
| **5** | Strength | 82–86% | 1–2×1 | 5×3 @85% | 3×3 @107% | Strength is the engine for bigger lifts. |
| **6** | Strength (peak) | 84–88% | singles | 4×3 @87% | 3×3 @110% | Heaviest strength — confidence under load. |
| **7** | Peak entry | 88–90% | heavy single | 4×2 @88% | 3×2 @107% | First near-max exposure — express the strength. |
| **8** | **Deload** | ≤80% | singles (fewer) | 3×3 @78% | 3×2 @100% | Recover so you peak clean. |
| **9** | Peak | ~91% | ONE heavy single | 3×2 @90% | light | A single heavy exposure at 90%+. |
| **10** | Peak | ~93% | ONE heavy single | 3×2 @88% | none | Top peak week — one quality heavy single. |
| **11** | Unload / taper | ~88% openers | openers only | 2×2 @78% | none | Shed fatigue **everywhere**, not just the bar (see taper rule below). |
| **12** | **MAX-OUT** | build to a max | — | none | none | Light primer early week, then **Sunday = Max-Out Day** only. Nothing else. |

**Three rules that make the peak/taper actually work (learned the hard way):**
- **Day 5 is the *differentiated* day, never a second max.** Day 1/2 hold the week's heavy classic exposure; Day 5 is lighter — speed/technique in build weeks, opener rehearsal in peak weeks. One heavy exposure per lift per week (bible 3J), not two.
- **Everything tapers, not just the main lift.** In deload, peak, and taper weeks the *secondary* work (Snatch Balance, RDL, hang work, the power complex) scales down and gets dropped — otherwise fatigue never comes off. Week 12 strips to a light primer session + the single Max-Out session, nothing in between.
- **The squat tapers on its own schedule.** In build weeks, squat every squat day. In peak and taper weeks, keep **one heavy squat + one moderate** and drop the rest — three heavy squat sessions stacked into a peak week is exactly where residual fatigue hides until it kills max day.

### Max-Out Day (Peak, Wk 12 Sunday)
Warm up to openers → **max Snatch** → reset → **max Clean & Jerk** → *(optional)* heavy Back Squat single → **log → post to feed → submit verified PR to leaderboard.** A personal event, celebrated in the feed as each member reaches it — a continuous stream of PRs rather than one synchronized day.

---

## Base Season — the 12-week block (ends in a strength benchmark)

Higher volume, hypertrophy + positional strength, intensity capped ~88%, more squat/pull volume, and real accessory work. Ends in a benchmark, not a 1RM — respects "develop, don't test."

**Accumulation volume comes from more sets of doubles plus hang/variation triples — never full-lift triples above 75%, and never full clean & jerk triples (bible 3A).** (A hang triple stays clean; three full clean & jerks in a set degrade fast.)

| Wk | Phase | S / CJ | S / CJ reps | Squat | Pulls | Purpose |
|---|---|---|---|---|---|---|
| **1** | Volume | 70–75% | 3×2 (+ hang triples) | 4×6 @70% | 4×4 @100% | Build the volume base, groove positions. |
| **2** | Volume | 72–77% | 3×2 (+ hang/var triples) | 4×6 @72% | 4×4 @103% | Add volume; technique under fatigue. |
| **3** | Volume (peak) | 74–78% | 4×2 (+ hang triples) | 5×5 @75% | 4×4 @105% | Highest volume — the growth work. |
| **4** | **Deload** | ≤72% | 2×2 | 3×5 @68% | 3×3 @97% | Recover, absorb. |
| **5** | Volume-strength | 76–80% | 3×2 | 5×4 @78% | 4×3 @107% | Convert volume toward strength. |
| **6** | Volume-strength | 78–82% | 3×2 | 5×4 @80% | 4×3 @108% | Heavier, still high volume. |
| **7** | Strength | 80–85% | 2×2 | 4×4 @83% | 3×3 @110% | Positional strength climbs. |
| **8** | **Deload** | ≤78% | 2×2 | 3×4 @72% | 3×3 @102% | Recover. |
| **9** | Strength | 82–86% | 2×1–2 | 4×3 @85% | 3×3 @110% | Consolidate strength. |
| **10** | Strength | 84–88% | doubles/singles | 4×3 @87% | 3×3 @110% | Own heavier positions. |
| **11** | Strength (taper) | 85–88% | singles | 3×3 @84% | reduce | Sharpen, shed some fatigue. |
| **12** | **Base Test Day** | ~90% technical single | — | **true work-up to a 3RM** | — | Benchmark: a genuine top-end 3RM squat (sets the next block's squat max via e1RM) + one clean technical single each lift. Not a 1RM. |

### Base Season accessory fill (Peak Season drops these)
The extra muscle-building volume that makes Base a real hypertrophy season — added into the existing 5-day shape, ~2–3 slots, watching total session time:
- **Day 1** — Barbell/Pendlay Row (upper back / pulling base)
- **Day 2** — GHR or Back Extension (posterior chain)
- **Day 5** — Strict or DB Press (overhead pressing volume)

Peak Season leaves these out so recovery goes to the heavy classic work.

### Base Season positional/skill variations (the off-season toolbox)
Base is where the wider variation library earns its keep — with volume high and intensity capped, it's the right time to hammer positions. In the build weeks Base deploys, rotating through the block:
- **Deficit pulls** (snatch/clean) — reinforce the first pull and stronger positions off the floor.
- **Pause work** — pause snatch/clean at the knee (or below), and pause squats — for position and time under tension.
- **Block work** — snatch/clean from blocks (above or below knee) to isolate the second pull.

Peak Season drops these back to the competition lifts and their close variants — positional work is built in the off-season, not the peak.

---

## Real competitions (a member enters a meet date)

Peaking someone for *their* meet on *their* date is personal coaching — re-timing the whole block so the peak and taper land exactly on the date, adjusting the taper, picking openers, adapting to how they respond. **That lives behind the paywall**, and a real meet date is also the strongest upgrade trigger you have (*"You've got a meet on March 14 — upgrade and we'll build your peak to land on it."*).

But the free tier still shouldn't *sabotage* a real meet. The rule: **don't paywall safety, only paywall optimization.**

- **Free (ignore-but-protect).** If a free member's meet date falls in the current training week, replace that week with a **basic light/taper week** (reduced volume, openers) and show a heads-up. This just keeps them from a heavy volume session days before competing — it is *not* real peaking.
- **Paid (personalized peaking).** Re-time the entire block into the meet date, a personalized taper, opener/attempt selection, and in-cycle adaptation to their check-ins and logs.

Free says *"we won't wreck your meet week."* Paid says *"we'll build your whole peak around it."* The meet date collected at onboarding does double duty: it triggers the upgrade pitch and it drives the free safety taper.

---

## Beginner safety layer (deterministic, applied at serve time)

A true novice (experience < 2 yr **or** no reliable tested max) does NOT get the full intermediate block — that would break the bible's beginner rules (RPE-based, no heavy singles, no maxing) and is a real injury/churn risk. Same seasons, same community — but the served plan is transformed:

- **Cap classic lifts at 80%** of estimated max; **no top singles** — 2–3 reps at moderate load by feel to ~RPE 6–7. **Strip the "to a top single" framing from Day 5 entirely** (change the day's identity in the serve, not just the number), so the UI never tells a novice to do the thing we told them not to.
- **Trim to 3 days** (serve Days 1, 2, 5) so volume is appropriate.
- **Test Day → a rep-PR or an RPE-capped clean technical single, never a fixed % or a true max.** (85% off an estimated max could be a near-max or a miss — so it's RPE-capped, not a set percentage.)
- **Framing:** *"You're new — we're keeping this submaximal and technique-first. As you build a base and tested maxes, the full block unlocks."*

All decidable from onboarding data (experience, max reliability), so it stays deterministic and cheap. The auto-bump rule stays off for beginners until they have reliable maxes.

---

## Runtime (deterministic — no AI at serve time)

`weight = round_to_2.5( intensity% × athlete's max for that lift )`, reusing the app's rounding/weight logic. Variations use the bible's variation→max conversion factors. Missing a reliable max → show % and reps, let them pick a working weight, nudge to test. Which season and week a member sees is a pure function of *their own* start date.

## Known ceiling — no eyes on the bar

This deterministic program manages *loading and structure* — how heavy, how many, in what order — and does that well. What it fundamentally cannot do is *watch* a lifter and diagnose *why* a lift fails or fix a technical fault. That's the ceiling of any remote program, not a flaw in this design. The natural frontier: Oly is already a video app, so "eyes on the bar" is where the social/video pillar eventually bridges into training — post a lift, get eyes on it (community, a coach, and later some form of analysis). That belongs to the paid tier's future, not the free program. The program owns the numbers; technique is a separate feature your video DNA is uniquely set up to own.

---

## Club program vs. personalized coaching
Club program (these seasons): same structure for everyone, each on their own rolling timeline, no individual adaptation.
Personalized (the coaching tier): built around their schedule, experience, weaknesses and meet; progresses off their logged loads; **adapts** to check-ins and misses; and **peaks them for their actual competition**.
