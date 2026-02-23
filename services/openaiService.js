/**
 * OpenAI Training Logic service: uses the Oly App Training Logic document
 * (source of truth) + athlete profile from DB to generate training blocks,
 * interpret feedback, and adjust programming. This is NOT a chatbot.
 * Can return free-form text or structured JSON for the app workout screens.
 */

const { getContextForPrompt } = require('./documentService');

/** JSON schema: each exercise has a "sets" array; each set has set_number, weight, reps, rpm_percent. */
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
              { "set_number": 1, "weight": number, "reps": number, "rpm_percent": number or null, "coach_prescription": "string", "key_cues": ["string"] },
              { "set_number": 2, "weight": number, "reps": number, "rpm_percent": number or null, "coach_prescription": "string", "key_cues": ["string"] }
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
        { "set_number": 1, "weight": number, "reps": number, "rpm_percent": number or null, "coach_prescription": "string", "key_cues": ["string"] }
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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

  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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
- Each item in training_days: { "day", "day_label", "exercises": [ ... ] }. Each exercise has ONLY: exercise_name, time, no_of_set, sets. Do NOT put coach_prescription or key_cues_of_specific_lift inside an exercise — those go at day level only.
- CRITICAL — WEIGHT: For every set, "weight" MUST be a positive number. Use the athlete's Strength stats: match the exercise to a lift (e.g. Snatch → classic.snatch value, Snatch Pull → use snatch 1RM × 0.9, Back Squat → squat.back_squat). Formula: weight = Math.round(1RM × percentage). Use 70%, 75%, 80%, 85% etc. for sets 1,2,3,4. Preferred unit is in profile (kg or lbs). NEVER output 0 for weight; if a lift 1RM is missing use 50 kg (or 110 lbs) as fallback.
- CRITICAL — RPM_PERCENT: For every set, "rpm_percent" MUST be a number (e.g. 70, 75, 80, 85). This is intensity as % of 1RM. Never null for working sets.
- Each set: set_number (1,2,3...), weight (positive number), reps (positive number), rpm_percent (number), coach_prescription (specific guidance for THIS set), key_cues (array of specific cues for THIS set). no_of_set = sets.length. Ensure key_cues are different for each set if applicable.
- todays_training: same structure as training_days[0].exercises.

You must respond with ONLY a valid JSON object, no markdown and no text before or after. Use this exact shape:

${WORKOUT_TAB_JSON_SCHEMA}

- training_days: length = athlete's "Training days/week". Each exercise: exercise_name, time, no_of_set, coach_note (for the full exercise), sets[]. Each set: set_number, weight (positive, from Strength stats), reps, rpm_percent (number, never null), coach_prescription (string), key_cues (array of strings).
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

module.exports = {
  formatProfileForPrompt,
  generateTrainingResponse,
};
