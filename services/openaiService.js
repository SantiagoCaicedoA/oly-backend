/**
 * OpenAI Training Logic service: uses the Oly App Training Logic document
 * (source of truth) + athlete profile from DB to generate training blocks,
 * interpret feedback, and adjust programming. This is NOT a chatbot.
 * Can return free-form text or structured JSON for the app workout screens.
 */

const { getContextForPrompt } = require('./documentService');

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
  if (p.competition && p.competition.preparing) {
    lines.push('Competition: PREPARING for a meet');
    if (p.competition.name) lines.push(`  Meet name: ${p.competition.name}`);
    if (p.competition.date) lines.push(`  Meet date: ${p.competition.date}`);
    if (p.competition.weight_class) lines.push(`  Weight class: ${p.competition.weight_class}`);
    if (p.competition.target_total != null) lines.push(`  Target total: ${p.competition.target_total}`);
  }
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
async function generateTrainingResponse({ profile, request, feedback, documentContext, responseFormat }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env file.');
  }

  const queryForContext = [request, feedback].filter(Boolean).join(' ');
  const docContext =
    documentContext !== undefined
      ? documentContext
      : await getContextForPrompt(queryForContext);

  const profileSummary = formatProfileForPrompt(profile);
  const isWorkoutTab = responseFormat === 'workout_tab';

  const systemPrompt = isWorkoutTab
    ? `You are the Oly App Training Logic agent. Generate data for the app's Workout tab. Use BOTH sources below.

CRITICAL: Generate the FULL week according to what the athlete chose in onboarding (their profile).
- Use "Training days/week" (training_days_per_week) from the athlete profile — that is the number of days THEY selected in onboarding. Return exactly that many items in "training_days" (could be 1, 2, 3, 4, 5, or 6 — whatever they chose).
- Use "Session duration" and "Preferred rest days" from the same profile. Respect session_duration per session and preferred_rest_days when assigning day labels.
- CRITICAL — TRAINING PHASE & COMPETITION: If the profile has a "Training phase (starting point)", adapt this week to it: "Coming back from injury" = conservative loads, extra warm-up, no maximal efforts; "Deload / Recovery" = reduced volume and intensity; "Post-competition" = lighter technical re-entry; "Starting fresh" = build base with submaximal technique work; "In a training block" = continue progressive overload. If the athlete is "PREPARING for a meet" with a Meet date, periodize toward it: build intensity as the date nears, taper in the final 1-2 weeks, bias toward the competition lifts (snatch, clean & jerk), and aim selections at the Target total if given.
- CRITICAL — MULTIPLE EXERCISES: Each training day MUST include MULTIPLE exercises (typically 2-4 exercises per day), not just 1. Structure a proper training session with main lifts and accessory work. Each exercise has: exercise_name, time, no_of_set, sets[].
- CRITICAL — WEIGHT: For every set, "weight" MUST be a positive number. Use the athlete's Strength stats: match the exercise to a lift (e.g. Snatch → classic.snatch value, Snatch Pull → use snatch 1RM × 0.9, Back Squat → squat.back_squat). Formula: weight = Math.round(1RM × percentage). Use 70%, 75%, 80%, 85% etc. for sets 1,2,3,4. Preferred unit is in profile (kg or lbs). NEVER output 0 for weight; if a lift 1RM is missing use 50 kg (or 110 lbs) as fallback.
- CRITICAL — SET INTENT (Training Purpose): For every set, include "intent" field. This describes the TRAINING PURPOSE/FOCUS of the set. Choose exactly one of these four values:
  • "Technical Consistency" - for lighter sets focusing on perfect form
  • "Speed & Power" - for explosive speed-focused work
  • "Strength Under Load" - for heavier challenging sets building strength
  • "Confidence & Exposure" - for max effort/competition simulation

- CRITICAL — SET CONTEXT (Set Position/Description): For every set, include "context" field. This describes the POSITION in the progression or special nature of the set:
  - Identify the TOP SET: The heaviest OR highest intensity set in the progression (usually the last working set before any back-off sets). This is the "money set" where peak performance matters most.
  - For NON-TOP sets: Use format "Set X of Y" (e.g., "Set 1 of 5", "Set 2 of 4"). 
  - For the TOP SET: Use descriptive context like "Top Set - Max Effort", "Peak Intensity Set", or "Money Set - Go Heavy".
  - For BACK-OFF sets after top set: Use "Back-off Set - Recovery" or "Back-off Set - Technique Focus".
  - Example progression with 5 sets: "Set 1 of 5", "Set 2 of 5", "Set 3 of 5", "Top Set - Max Effort", "Back-off Set - Recovery".

IMPORTANT: NEVER put "Back-off Set - Recovery" or "Top Set" descriptions in the intent field - those belong in context!
- Each set: set_number (1,2,3...), weight (positive number), reps (positive number), rpm_percent (number, never null), coach_prescription (specific guidance for THIS set), key_cues (array of specific cues for THIS set), intent (MUST be one of: Technical Consistency, Speed & Power, Strength Under Load, Confidence & Exposure), context (MUST be "Set X of Y" for non-top sets, or specific description for top/special sets). no_of_set = sets.length. Ensure key_cues are different for each set if applicable.
- todays_training: same structure as training_days[0].exercises.

You must respond with ONLY a valid JSON object, no markdown and no text before or after. Use this exact shape:

${WORKOUT_TAB_JSON_SCHEMA}

- training_days: length = athlete's "Training days/week". Each exercise: exercise_name, time, no_of_set, coach_note (for the full exercise), sets[]. Each set: set_number, weight (positive, from Strength stats), reps, rpm_percent (number, never null), coach_prescription (string), key_cues (array of strings), intent (MUST be one of: Technical Consistency, Speed & Power, Strength Under Load, Confidence & Exposure), context (MUST describe the set - "Set X of Y" for most sets, special text for top sets).
- coach_note, key_cues, coach_prescription, key_cues_of_specific_lift go at the day/root level as well (for general notes), but set-level and exercise-level notes are preferred for specific guidance.
- daily_check_in: contains sleep_quality, stress_level, and mental_readiness as numbers 1-10 (provide realistic values, not null).
- suggested_exercises: as before.

## Oly App Training Logic Documentation (excerpts)
${docContext || '(No document loaded.)'}

## This athlete's profile (from database)
${profileSummary}

Output ONLY the JSON object.`

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
  generateTrainingResponse,
  generateDailyAdjustment,
};
