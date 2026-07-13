/**
 * Provider-agnostic LLM client — the swappable "coaching brain" socket.
 *
 * Every LLM call in the app goes through complete(). It routes to Anthropic (Claude,
 * the primary/validated model) or OpenAI (fallback) based on env, so the model can be
 * changed without touching any call site. Supports Claude prompt caching on the large
 * static system context (training bible + exercise library + generation spec), which is
 * where 90% of the tokens live — caching makes repeated generations cheap.
 *
 * Provider selection (per call, then env):
 *   opts.provider  ->  LLM_PROVIDER env  ->  'anthropic' if ANTHROPIC_API_KEY set, else 'openai'.
 * This means: until ANTHROPIC_API_KEY is set in the environment, behaviour is unchanged
 * (still OpenAI). Set the key to flip the whole app to Claude — no code change.
 */

// Per-TASK model routing (quality-first, cheap where the task is simple). Each call
// passes a `task`; the client resolves the right model FOR THE ACTIVE PROVIDER, so the
// same call works whether we're on Claude or the OpenAI fallback. Override any via env.
//   brain  = program generation / reasoning  -> best model
//   notes  = coach notes (voice)             -> cheap, good voice
//   adjust = daily check-in adjustment       -> cheap
const TASK_MODELS = {
  anthropic: {
    brain: process.env.LLM_BRAIN_MODEL || 'claude-sonnet-4-6',
    notes: process.env.LLM_NOTES_MODEL || 'claude-haiku-4-5-20251001',
    adjust: process.env.LLM_ADJUST_MODEL || 'claude-haiku-4-5-20251001',
  },
  openai: {
    brain: process.env.OPENAI_BRAIN_MODEL || 'gpt-4o',
    notes: process.env.OPENAI_NOTES_MODEL || 'gpt-4o-mini',
    adjust: process.env.OPENAI_ADJUST_MODEL || 'gpt-4o-mini',
  },
};
function modelFor(task, provider) {
  const table = TASK_MODELS[provider] || TASK_MODELS.anthropic;
  return table[task] || table.brain;
}

function defaultProvider() {
  const p = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (p === 'anthropic' || p === 'claude') return 'anthropic';
  if (p === 'openai' || p === 'gpt') return 'openai';
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
}

let _anthropic = null;
let _openai = null;
function anthropicClient() {
  if (!_anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}
function openaiClient() {
  if (!_openai) {
    const OpenAI = require('openai');
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/** Pull a bare JSON object out of a model response that may be fenced or chatty. */
function extractJSON(text) {
  if (!text) return text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) return fence[1].trim();
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  return s !== -1 && e !== -1 ? text.slice(s, e + 1).trim() : text.trim();
}

/**
 * One chat/JSON completion, provider-agnostic.
 * @param {object} opts
 * @param {string} opts.system            - system prompt (may be large & static)
 * @param {string} opts.user              - user message
 * @param {boolean} [opts.json=false]     - force/normalize JSON output
 * @param {number} [opts.maxTokens=2048]
 * @param {number} [opts.temperature=0.4]
 * @param {boolean} [opts.cacheSystem=false] - cache the system prompt (Claude only; no-op on OpenAI)
 * @param {string} [opts.task='brain']    - 'brain' | 'notes' | 'adjust' (picks the model per provider)
 * @param {string} [opts.provider]        - 'anthropic' | 'openai' override
 * @param {string} [opts.model]           - explicit model override (skips task routing)
 * @returns {Promise<{content:string, usage:object, provider:string, model:string}>}
 */
async function complete(opts = {}) {
  const provider = (opts.provider || defaultProvider()).toLowerCase();
  const json = opts.json === true;
  const maxTokens = opts.maxTokens || 2048;
  const temperature = opts.temperature != null ? opts.temperature : 0.4;
  const system = opts.system || '';
  const user = opts.user || '';

  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
    const model = opts.model || modelFor(opts.task || 'brain', 'anthropic');
    // Cache the big static system block so repeat calls only pay for the small delta.
    const systemParam = opts.cacheSystem
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system;
    const userText = json ? `${user}\n\nRespond with ONLY the JSON object — no markdown, no prose.` : user;
    const resp = await anthropicClient().messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemParam,
      messages: [{ role: 'user', content: userText }],
    });
    let content = (resp.content || []).map((b) => (b && b.type === 'text' ? b.text : '')).join('').trim();
    if (json) content = extractJSON(content);
    const u = resp.usage || {};
    return {
      content: content || '',
      usage: {
        prompt_tokens: u.input_tokens,
        completion_tokens: u.output_tokens,
        cache_read_tokens: u.cache_read_input_tokens,
        cache_write_tokens: u.cache_creation_input_tokens,
      },
      provider,
      model,
    };
  }

  // ---- OpenAI (fallback) ----
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set.');
  const model = opts.model || modelFor(opts.task || 'brain', 'openai');
  const resp = await openaiClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  });
  let content = resp.choices?.[0]?.message?.content?.trim() || '';
  if (json) content = extractJSON(content);
  const u = resp.usage || {};
  return {
    content,
    usage: { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens },
    provider,
    model,
  };
}

module.exports = { complete, extractJSON, defaultProvider, modelFor, TASK_MODELS };
