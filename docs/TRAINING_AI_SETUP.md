# Training AI Setup (Oly App Training Logic + Athlete Profile)

This is **not a chatbot**. The AI uses the **Oly App Training Logic document** (source of truth) and the **athlete profile from the DB** to generate training blocks, interpret athlete feedback, and adjust programming.

## Overview

- **Document**: Oly App Training Logic Documentation (your ~50-page PDF/TXT). Defines Exercise Library, Core Programming Principles, Athlete Feedback System, Auto-Regulation Rules, Training Block Structure, Session Structure, AI Decision Tree, etc. The first pages include the table of contents and Exercise Library categories (Competition Lifts, Variations, Squats, Pulls, etc.).
- **Profile**: From MongoDB `User.profile` (current user via `x-user-id`).
- **Flow**: App sends a **request** (e.g. “Generate week 1 strength block”) and optional **feedback** → backend loads relevant doc chunks + profile → OpenAI responds with training logic output only (blocks, feedback interpretation, programming adjustments).

## 1. Environment variables

Add to your `.env` (see `.env.example`):

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_TRAINING_MODEL=gpt-4o-mini
DOCUMENT_PATH=data/training-logic.pdf
```

- **OPENAI_API_KEY**: From [OpenAI API keys](https://platform.openai.com/api-keys). Keep in `.env` only.
- **OPENAI_TRAINING_MODEL**: Optional. Default `gpt-4o-mini`; use `gpt-4o` for higher quality.
- **DOCUMENT_PATH**: Path to the Training Logic document, **relative to project root**, e.g. `data/training-logic.pdf` or `docs/oly-training-logic-v2.pdf`.

## 2. Where to put the Training Logic document

1. Put your **Oly App Training Logic** PDF (or TXT) in the repo, e.g. `data/training-logic.pdf`.
2. Set `DOCUMENT_PATH` in `.env` to that path.

If the file is large, you can add it to `.gitignore` and deploy it separately (e.g. S3 or build step); the app only needs the file at the path at runtime.

## 3. How the document is processed

- **PDF**: Text extracted with `pdf-parse` (already in `package.json`).
- **TXT**: Read as UTF-8.
- The full text is **chunked** (~4000 chars with overlap). For each request, **relevant chunks** are selected (keyword match from `request` + `feedback`) and sent in the system prompt with the athlete profile. The 50-page doc is not sent in full each time.

## 4. Athlete profile (from DB)

- Endpoint is authenticated with `x-user-id`. Backend uses `req.user.profile`.
- Profile (display name, country, age, strength stats, availability, equipment, training preference, performance gaps, etc.) is formatted and included in the system prompt so the AI follows the document rules **for this athlete**.

## 5. API usage

**Endpoint**: `POST /api/training/generate`

**Headers**: `Content-Type: application/json`, `x-user-id: <User _id>`

**Body**:

```json
{
  "request": "Generate week 1 strength block",
  "feedback": "Optional: knees hurt on squats"
}
```

- **request** (required): The specific task, e.g. generate block, apply phase, interpret feedback.
- **feedback** (optional): Recent athlete feedback to factor into adjustments.

**Success (200)**:

```json
{
  "success": true,
  "data": {
    "output": "...",
    "usage": { "prompt_tokens": 1200, "completion_tokens": 300 }
  }
}
```

**Errors**: `400` (missing/empty `request`), `401` (auth), `503` (OPENAI_API_KEY not set).

## 6. Dependencies

- `openai`, `pdf-parse` are in `package.json`. Run `npm install`.

## Summary

| Item            | What to do |
|-----------------|------------|
| Training Logic doc | Place PDF/TXT (e.g. `data/training-logic.pdf`), set `DOCUMENT_PATH` in `.env`. |
| Athlete data    | From `User.profile`; ensure profile is set via your app. |
| OpenAI          | Set `OPENAI_API_KEY` (and optionally `OPENAI_TRAINING_MODEL`) in `.env`. |
| Endpoint        | `POST /api/training/generate` with `{ "request": "...", "feedback": "..." }` and `x-user-id`. |
