/**
 * OpenAI Training Logic service: uses the Oly App Training Logic document
 * (source of truth) + athlete profile from DB to generate training blocks,
 * interpret feedback, and adjust programming. This is NOT a chatbot.
 * Can return free-form text or structured JSON for the app workout screens.
 */

const { getContextForPrompt, getFullDocumentText } = require('./documentService');

// Initialize OpenAI at module level
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
let openai = null;

if (OPENAI_API_KEY) {
  const OpenAI = require('openai');
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

/** JSON schema: each exercise has a "sets" array; each set has set_number, weight, reps, rpm_percent (MUST BE A NUMBER 0-100, NEVER NULL), intent (training purpose), and context (set position/description). */
const WORKOUT_TAB_JSON_SCHEMA = `{
  "coach_note": "string",
  "key_cues": ["string"],
  "training_days": [
    {
      "day": 1,
      "day_label": "string e.g. Monday",
      "exercises": [
          {
            "exercise_name": "string",
            "time": "string e.g. 15 min",
            "no_of_set": number,
            "coach_note": "string",
            "sets": [
              { "set_number": 1, "weight": number, "reps": number, "rpm_percent": number (0-100, NEVER NULL), "coach_prescription": "string", "key_cues": ["string"], "intent": "Technical Consistency OR Speed & Power OR Strength Under Load OR Confidence & Exposure", "context": "Set 1 of 5" },
              { "set_number": 2, "weight": number, "reps": number, "rpm_percent": number (0-100, NEVER NULL), "coach_prescription": "string", "key_cues": ["string"], "intent": "ONE OF THE FOUR OPTIONS ONLY", "context": "Set 2 of 5" },
              { "set_number": 3, "weight": number, "reps": number, "rpm_percent": number (0-100, NEVER NULL), "coach_prescription": "string", "key_cues": ["string"], "intent": "ONE OF THE FOUR OPTIONS ONLY", "context": "Set 3 of 5" },
              { "set_number": 4, "weight": number, "reps": number, "rpm_percent": number (0-100, NEVER NULL), "coach_prescription": "string", "key_cues": ["string"], "intent": "ONE OF THE FOUR OPTIONS ONLY", "context": "Top Set - Max Effort OR Money Set - Go Heavy" },
              { "set_number": 5, "weight": number, "reps": number, "rpm_percent": number (0-100, NEVER NULL), "coach_prescription": "string", "key_cues": ["string"], "intent": "ONE OF THE FOUR OPTIONS ONLY", "context": "Back-off Set - Recovery OR Back-off Set - Technique Focus" }
            ]
          },
          {
            "exercise_name": "string",
            "time": "string e.g. 15 min",
            "no_of_set": number,
            "coach_note": "string",
            "sets": [
              { "set_number": 1, "weight": number, "reps": number, "rpm_percent": number (0-100, NEVER NULL), "coach_prescription": "string", "key_cues": ["string"], "intent": "ONE OF THE FOUR OPTIONS ONLY", "context": "Set 1 of 3" }
            ]
          }
      ]
    }
  ],
  "todays_training": [
    {
      "exercise_name": "string",
      "time": "string",
      "no_of_set": number,
      "coach_note": "string",
      "sets": [
        { "set_number": 1, "weight": number, "reps": number, "rpm_percent": number (0-100, NEVER NULL), "coach_prescription": "string", "key_cues": ["string"], "intent": "MUST BE: Technical Consistency OR Speed & Power OR Strength Under Load OR Confidence & Exposure", "context": "MUST BE: Set X of Y OR Top Set - Max Effort OR Back-off Set - Recovery" }
      ]
    }
  ],
  "daily_check_in": {
    "sleep_quality": number 1-10 or null,
    "stress_level": number 1-10 or null,
    "mental_readiness": number 1-10 or null
  },
  "coach_prescription": "string",
  "key_cues_of_specific_lift": ["string"],
  "weight_lifted": number or null,
  "reps": number or null,
  "suggested_exercises": [
    { "lift_name": "string", "description": "string", "label": "string" }
  ]
}`;

const DEFAULT_MODEL = process.env.OPENAI_TRAINING_MODEL || 'gpt-4o-mini';

/**
 * Format athlete profile (from User.profile) into text for the system prompt.
 * @param {object} profile - User.profile from DB
 * @returns {string}
 */
function formatProfileForPrompt(profile) {
  if (!profile || typeof profile !== 'object') return 'No athlete profile available.';
  const p = profile;
  const lines = [];
  if (p.display_name) lines.push(`Name: ${p.display_name}`);
  if (p.country) lines.push(`Country: ${p.country}`);
  if (p.age != null) lines.push(`Age: ${p.age}`);
  if (p.sex) lines.push(`Sex: ${p.sex}`);
  if (p.experience_years != null) lines.push(`Experience (years): ${p.experience_years}`);
  if (p.height_cm != null) lines.push(`Height: ${p.height_cm} cm`);
  if (p.bodyweight_value != null) lines.push(`Bodyweight: ${p.bodyweight_value} ${p.bodyweight_unit || 'kg'}`);
  if (p.preferred_unit) lines.push(`Preferred unit: ${p.preferred_unit}`);
  if (p.strength_stats) {
    const stats = [];
    const walk = (obj, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object' && v.value != null) stats.push(`${prefix}${k}: ${v.value}`);
        else if (v && typeof v === 'object') walk(v, `${prefix}${k}.`);
      }
    };
    walk(p.strength_stats);
    if (stats.length) lines.push('Strength stats: ' + stats.join(', '));
  }
  if (p.strength_accuracy) lines.push(`Strength accuracy: ${p.strength_accuracy}`);
  if (p.considerations && p.considerations.has_limitations) {
    lines.push('Considerations: has limitations');
    if (p.considerations.affected_areas?.length) lines.push('  Affected areas: ' + p.considerations.affected_areas.join(', '));
    if (p.considerations.impact_level) lines.push('  Impact: ' + p.considerations.impact_level);
    if (p.considerations.triggers?.length) lines.push('  Triggers: ' + p.considerations.triggers.join(', '));
  }
  if (p.availability) {
    if (p.availability.training_days_per_week != null) lines.push(`Training days/week: ${p.availability.training_days_per_week}`);
    if (p.availability.session_duration != null) lines.push(`Session duration: ${p.availability.session_duration} min`);
    if (p.availability.preferred_rest_days?.length) lines.push('Preferred rest days: ' + p.availability.preferred_rest_days.join(', '));
  }
  if (p.equipment?.optional?.length) lines.push('Equipment: ' + p.equipment.optional.join(', '));
  if (p.training_preference) lines.push('Training preference: ' + p.training_preference);
  if (p.performance_gaps?.length) lines.push('Performance gaps: ' + p.performance_gaps.join(', '));
  const PHASE_LABELS = {
    starting_fresh: 'Starting fresh',
    in_training_block: 'In a training block',
    post_competition: 'Post-competition',
    deload_recovery: 'Deload / Recovery',
    coming_back: 'Coming back from injury',
  };
  if (p.training_phase) lines.push(`Training phase (starting point): ${PHASE_LABELS[p.training_phase] || p.training_phase}`);
  const RECENT_LABELS = {
    returning: 'Coming back from time off (2+ weeks away)',
    light: 'Lightly — about 1-2 sessions/week recently',
    steady: 'Steadily — about 3-4 sessions/week recently',
    heavy: 'Heavy — 5+ sessions/week recently',
  };
  if (p.recent_training_volume) lines.push(`Recent training (last 4 weeks): ${RECENT_LABELS[p.recent_training_volume] || p.recent_training_volume}`);
  if (p.competition && p.competition.preparing) {
    lines.push('Competition: PREPARING for a meet');
    if (p.competition.name) lines.push(`  Meet name: ${p.competition.name}`);
    if (p.competition.date) lines.push(`  Meet date: ${p.competition.date}`);
    if (p.competition.weight_class) lines.push(`  Weight class: ${p.competition.weight_class}`);
    if (p.competition.target_total != null) lines.push(`  Target total: ${p.competition.target_total}`);
  }

  // ---- Derived context (computed) to help the AI apply the bible reliably ----
  const derived = [];
  const gv = (o) => (o && typeof o.value === 'number' && o.value > 0 ? o.value : null);
  const ss = p.strength_stats || {};
  const sn = gv(ss.classic && ss.classic.snatch), cj = gv(ss.classic && ss.classic.clean_jerk);
  const fsq = gv(ss.squat && ss.squat.front_squat), bsq = gv(ss.squat && ss.squat.back_squat);
  if (sn && cj) derived.push(`Snatch:C&J = ${Math.round((sn / cj) * 100)}% (normal 78-83%; low => snatch is the limiter)`);
  if (fsq && bsq) derived.push(`Front:back squat = ${Math.round((fsq / bsq) * 100)}% (normal ~85%; low => clean-recovery limiter)`);
  if (p.experience_years != null) {
    const ty = p.experience_years;
    const band = ty < 2 ? 'Developing (<2y)' : ty < 5 ? 'Provincial (~3-4y)' : 'Advanced-candidate (5y+)';
    derived.push(`Training age: ${ty}y -> ${band}`);
  }
  if (p.competition && p.competition.preparing && p.competition.date) {
    const d = new Date(p.competition.date);
    if (!isNaN(d.getTime())) derived.push(`Weeks out from meet: ${Math.round((d.getTime() - Date.now()) / (7 * 24 * 3600 * 1000))}`);
  }
  const reliable = p.strength_accuracy === 'Tested';
  const clean = !(p.considerations && p.considerations.has_limitations);
  let tier = 'Developing';
  if (!reliable) tier = 'Developing (maxes unproven -> safety gate, Sec 14A)';
  else if (p.experience_years != null && p.experience_years >= 5 && clean) tier = 'National+ candidate (CONFIRM 14A gates)';
  else if (p.experience_years != null && p.experience_years >= 3) tier = 'Provincial';
  derived.push(`Suggested tier: ${tier}`);
  if (derived.length) lines.push('\nDerived context (computed — confirm against the bible):\n- ' + derived.join('\n- '));

  return lines.length ? lines.join('\n') : 'No athlete profile available.';
}

/**
 * Generate a training-logic response: blocks, feedback interpretation, or programming adjustments.
 * Uses the Oly App Training Logic document as source of truth + athlete profile from DB.
 * @param {object} options
 * @param {object} options.profile - Athlete profile from DB (User.profile)
 * @param {string} options.request - The specific task
 * @param {string} [options.feedback] - Optional recent athlete feedback
 * @param {string} [options.documentContext] - Pre-fetched document context
 * @param {string} [options.responseFormat] - 'workout_tab' to get structured JSON for app screens
 * @returns {Promise<{ content: string, usage?: object }>}
 */
/**
 * Build the workout-generation system prompt. The AI follows the injected Oly
 * Training Bible; this prompt only orchestrates the process and locks the JSON shape.
 */
function buildWorkoutSystemPrompt(profileSummary, docContext) {
  return `You are the Oly AI weightlifting coach. Your complete, authoritative programming manual — the OLY TRAINING BIBLE — is provided below. FOLLOW IT EXACTLY; it overrides any generic training assumption. Where the athlete's data is missing, follow the bible's defaults and graceful-degradation rules — never invent your own method.

# THE OLY TRAINING BIBLE (your source of truth)
${docContext || '(Training bible not loaded.)'}

# THIS ATHLETE
${profileSummary}

# YOUR TASK — build the training week by applying the bible IN ORDER:
1. Trust & tier: assess max reliability (Sec 11) and set the athlete tier (Sec 14A gates: experience + confirmed maxes + injury-clean + ratios). Unlock National+ ONLY if all gates pass; otherwise use the conservative default.
2. Limiter: diagnose from the ratios (5D), performance gaps, and any logged misses (Sec 5).
3. Timeline: place the week in its phase (Sec 6) — a competitor counts down from the meet date; a non-competitor runs the repeating cycle.
4. Week structure: lay out EXACTLY the athlete's available days; squat every day on low-frequency weeks; wave Heavy/Moderate/Light; bias the weaker lift (Sec 4). Respect the SESSION TIME BUDGET (4G): a heavy classic lift ~30-40 min, a squat ~15-20 min. Do NOT exceed session_duration — if over, shed accessories then pulls, never the main lifts and never rest time.
5. Exercises: EVERY exercise states its intention in coach_note; no filler (5A). Use the fault-correction library (5C) for the athlete's weaknesses; pick movements from the library (Sec 2).
6. Loads: every weight = a percentage of the athlete's TRUE max for the matched lift (Sec 3 zones), using the variation->max conversion factors (9A) for non-competition movements, bounded by Prilepin (9B) and the volume landmarks (4F / 14D for National+). Distrust unproven or Estimated maxes — work 5-10% under (Sec 11). Round to real plates (9F). Classic lifts in singles/doubles ONLY.
7. Safety & conflicts: obey the never-do rules and defaults (Sec 8) and the priority stack (10A: Safety > time/days > readiness > phase > limiter > balance).

# OUTPUT — JSON ONLY (no markdown, no text before or after). Use this EXACT shape:
${WORKOUT_TAB_JSON_SCHEMA}

Field rules — map the bible onto these fields:
- training_days: exactly training_days_per_week items; day_label = weekday names, respecting preferred_rest_days.
- Each day: multiple exercises per the session shape (4B) within the time budget (4G).
- Each set: set_number; weight = round(% x TRUE max) in the athlete's unit — always a positive real load, NEVER 0 or a flat fallback; reps per the bible (classic lifts 1-2; squats/pulls by phase); rpm_percent = THE ACTUAL % OF TRUE MAX USED FOR THIS SET (e.g. a set at 82% -> rpm_percent: 82 — never a constant, never null); coach_prescription (cue for this set); key_cues (array); intent (EXACTLY one of: Technical Consistency, Speed & Power, Strength Under Load, Confidence & Exposure); context ("Set X of Y", or "Top Set - Max Effort" / "Back-off Set - Recovery" for special sets — never put context text into intent).
- coach_note on each exercise MUST state WHY it is in the program (its intention / the fault it fixes) — the no-filler law (5A).
- daily_check_in: sleep_quality, stress_level, mental_readiness as realistic 1-10 numbers. todays_training: same structure as training_days[0].exercises. suggested_exercises: per the schema.

Output ONLY the JSON object.`;
}

async function generateTrainingResponse({ profile, request, feedback, documentContext, responseFormat }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env file.');
  }

  const queryForContext = [request, feedback].filter(Boolean).join(' ');
  const docContext =
    documentContext !== undefined
      ? documentContext
      : await getFullDocumentText(); // the whole Oly Training Bible, read in order

  const profileSummary = formatProfileForPrompt(profile);
  const isWorkoutTab = responseFormat === 'workout_tab';

  const systemPrompt = isWorkoutTab
    ? buildWorkoutSystemPrompt(profileSummary, docContext)

    : `You are the Oly App Training Logic agent. You must use BOTH sources below for every response:

1) The official Training Logic document (rules, exercise library, block/session structure, feedback system).
2) This specific athlete's profile from the database — you MUST tailor every response to this athlete's actual data.

Do not give generic programming. Use the athlete profile to decide:
- How many days per week and session length (availability) — only prescribe within these limits.
- What equipment they have — only use exercises that fit their equipment.
- Limitations (e.g. knees, lower back, triggers) — avoid or modify anything that conflicts; if feedback mentions "knees hurt", respect both profile considerations and the feedback.
- Strength stats and experience — scale intensity and complexity accordingly.
- Training preference (High Intensity / Balanced / etc.) and performance gaps — align sessions to this.
- Preferred unit (Metric/Imperial) and preferred rest days when suggesting schedule.
- Training phase (starting point) and any upcoming competition (date, weight class, target total) — periodize and adapt the plan toward the meet, and respect the athlete's current phase.

Follow the document strictly for rules and structure; use the athlete profile for all personalization. Your output must be specific to this athlete, not a generic plan.

## Oly App Training Logic Documentation (excerpts)
${docContext || '(No document loaded. Set DOCUMENT_PATH in .env to your Training Logic PDF or TXT.)'}

## This athlete's profile (from database — use this for every response)
${profileSummary}

Respond only with training logic outputs (blocks, sessions, feedback-based adjustments) that follow the document and are tailored to the athlete profile above. Be structured and specific.`;

  const userContent = feedback
    ? `Request: ${request}\n\nRecent athlete feedback to consider: ${feedback}`
    : request;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: isWorkoutTab ? 10000 : 2048,
    temperature: 0.4,
  });

  const choice = response.choices?.[0];
  let content = choice?.message?.content?.trim() || 'No response generated.';

  if (isWorkoutTab) {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch) {
      content = jsonMatch[1].trim();
    } else {
      const startIdx = content.indexOf('{');
      const endIdx = content.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        content = content.slice(startIdx, endIdx + 1).trim();
      }
    }
  }
  const usage = response.usage ? { prompt_tokens: response.usage.prompt_tokens, completion_tokens: response.usage.completion_tokens } : undefined;

  return { content, usage };
}

/**
 * Generate AI adjustment for a specific day based on abnormal check-in data
 */
async function generateDailyAdjustment(day, checkIn, abnormalities, currentDayData) {
  if (!OPENAI_API_KEY || !openai) {
    throw new Error('OpenAI is not properly configured. Check OPENAI_API_KEY.');
  }

  // Use minimal context for daily adjustments to avoid rate limits
  const prompt = `
You are an expert Olympic weightlifting coach. Adjust training based on athlete's daily check-in data.

DAILY CHECK-IN ABNORMALITIES DETECTED:
- Day: ${day}
- Sleep Quality: ${checkIn.sleep_quality}/10
- Stress Level: ${checkIn.stress_level}/10  
- Mental Readiness: ${checkIn.mental_readiness}/10
- Abnormalities: ${abnormalities.join(', ')}

CURRENT WORKOUT FOR THIS DAY:
${JSON.stringify(currentDayData, null, 2)}

TASK: Adjust ONLY this specific day's workout based on abnormal check-in data.

RULES:
- If sleep quality ≤ 3: Reduce volume by 20-30%, lower intensity, focus on recovery
- If stress level ≥ 8: Reduce technical complexity, focus on familiar movements
- If mental readiness ≤ 3: Reduce load, focus on confidence-building exercises
- If consecutive bad sleep: Consider deload or active recovery
- If high stress + low recovery: Significant reduction in intensity/volume

RESPONSE FORMAT (JSON):
{
  "exercises": [
    {
      "exercise_name": "string",
      "time": "string", 
      "no_of_set": number,
      "coach_note": "string",
      "sets": [
        {
          "set_number": 1,
          "weight": number,
          "reps": number,
          "rpm_percent": number,
          "coach_prescription": "string",
          "key_cues": ["string"],
          "intent": "string (one of: Technical Consistency, Speed & Power, Strength Under Load, Confidence & Exposure)",
          "context": "string (Set X of Y for non-top sets, special text for top/back-off sets)"
        }
      ]
    }
  ],
  "coach_note": "string explaining the adjustment",
  "key_cues": ["string"]
}

For context field, follow these rules:
- Identify the TOP SET: The heaviest OR highest intensity set (usually last working set before back-offs)
- For NON-TOP sets: Use format "Set X of Y"
- For TOP SET: Use "Top Set - Max Effort" or similar
- For BACK-OFF sets: Use "Back-off Set - Recovery" or similar

Focus on safety and recovery. Be conservative with adjustments. Return only valid JSON.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert Olympic weightlifting coach. Adjust training based on athlete's daily check-in data. Prioritize safety and recovery. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Log the full AI response for debugging
    console.log('AI Response length:', content.length);
    console.log('AI Response preview:', content.substring(0, 500));

    // Parse JSON response with better error handling
    let adjustment;
    try {
      // Try to parse as-is first
      adjustment = JSON.parse(content);
    } catch (parseError) {
      // If that fails, try to extract JSON from content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          adjustment = JSON.parse(jsonMatch[0]);
        } catch (secondError) {
          console.log('Full AI response that failed to parse:', content);
          throw new Error(`Invalid JSON response from OpenAI: ${content.substring(0, 200)}...`);
        }
      } else {
        console.log('No JSON found in AI response:', content);
        throw new Error(`No valid JSON found in OpenAI response: ${content.substring(0, 200)}...`);
      }
    }

    return adjustment;
  } catch (error) {
    console.error('Error generating daily adjustment:', error);
    throw error;
  }
}

module.exports = {
  formatProfileForPrompt,
  buildWorkoutSystemPrompt,
  generateTrainingResponse,
  generateDailyAdjustment,
};
