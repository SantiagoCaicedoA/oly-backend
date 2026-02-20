# AI Training Flow – How It Executes

This doc describes **when** and **how** the Training AI runs, from the client request to the response.

---

## 1. When does it execute?

**Only when the client calls the API.** There is no background job or scheduler.

- **Endpoint:** `POST /api/training/generate`
- **Trigger:** The app (e.g. Workout tab) sends this request when it needs AI-generated training (e.g. on screen load or "Generate week" button).
- **Auth:** Request must include a valid **Bearer JWT** (or your auth header). The backend loads the **current user** from the token and uses their **athlete profile** from the DB.

So: **request in → load profile + doc context → call OpenAI → return response.** One execution per API call.

---

## 2. Step-by-step execution flow

```
Client                          Server
  |                                |
  |  POST /api/training/generate   |
  |  Body: { request, response_format: "workout_tab" }  |
  |  Headers: Authorization: Bearer <token>             |
  |--------------------------------->|
  |                                |
  |                         [1] auth middleware
  |                            - Verify JWT
  |                            - Load User from DB → req.user
  |                                |
  |                         [2] trainingController.generate
  |                            - Validate body (request required)
  |                            - profile = req.user.profile
  |                            - responseFormat = body.response_format
  |                                |
  |                         [3] openaiService.generateTrainingResponse
  |                                |
  |                            [3a] getContextForPrompt(request + feedback)
  |                                 - documentService.getDocumentChunks()
  |                                   • First time: load PDF/TXT from DOCUMENT_PATH
  |                                   • Chunk text (~4000 chars, overlap 200)
  |                                   • Cache chunks in memory
  |                                 - Select up to 15 chunks (keyword match from request)
  |                                 - Return combined context string
  |                                |
  |                            [3b] formatProfileForPrompt(profile)
  |                                 - Turn profile (display_name, availability, strength_stats, etc.)
  |                                   into a text summary for the prompt
  |                                |
  |                            [3c] Build system prompt
  |                                 - If workout_tab: instructions + JSON schema + doc context + profile
  |                                 - Else: free-form training logic instructions + doc + profile
  |                                |
  |                            [3d] Build user message
  |                                 - request (and optional feedback)
  |                                |
  |                            [3e] openai.chat.completions.create(...)
  |                                 - Sends system + user message to OpenAI
  |                                 - max_tokens: 4096 (workout_tab) or 2048
  |                                 - temperature: 0.4
  |                                |
  |                            [3f] Parse response
  |                                 - content = model reply (text or JSON string)
  |                                 - If workout_tab: strip ```json if present
  |                                 - Return { content, usage }
  |                                |
  |                         [4] Back in controller
  |                            - If response_format === 'workout_tab':
  |                              • JSON.parse(result.content)
  |                              • normalizeWorkoutTabData(data)  → safe shape (training_days, todays_training, etc.)
  |                              • Respond 200 { success, data: normalized, usage }
  |                            - Else:
  |                              • Respond 200 { success, data: { output: result.content, usage } }
  |                                |
  |<---------------------------------|
  |  200 OK, JSON body                |
```

---

## 3. Where things come from

| Input | Source | When |
|-------|--------|------|
| **Who** | JWT → `User` from DB → `req.user` | Every request (auth middleware) |
| **Profile** | `req.user.profile` (same User document) | In controller, passed to `generateTrainingResponse` |
| **Document** | File at `DOCUMENT_PATH` (e.g. `data/training-logic.pdf`) | First call: load + chunk + cache. Later calls: use cached chunks. |
| **Request / feedback** | Request body `request`, `feedback` | Every request |
| **Response format** | Request body `response_format` (`"workout_tab"` or omitted) | Every request |

---

## 4. Document loading (when and how)

- **When:** The first time **any** request to `POST /api/training/generate` calls `getContextForPrompt()`. That calls `getDocumentChunks()`.
- **How:**  
  - Read file from `DOCUMENT_PATH` (PDF via pdf-parse, TXT as UTF-8).  
  - Split into chunks (size 4000 chars, overlap 200).  
  - Store chunks in memory (`cachedChunks`).  
- **Later requests:** Same path → reuse `cachedChunks` (no disk read). Different path or server restart → load again.

So the doc is **loaded on first use** of the training API, then **cached** for the rest of that process’s lifetime.

---

## 5. OpenAI call (when and how)

- **When:** Once per `POST /api/training/generate` request, inside `generateTrainingResponse()`, after context and profile are ready.
- **How:**  
  - One `chat.completions.create()` with:  
    - **system:** Training Logic instructions + doc excerpts + athlete profile text.  
    - **user:** The `request` string (and optional `feedback`).  
  - Model (e.g. `gpt-4o-mini`) returns text.  
  - For `workout_tab`, that text is expected to be a **single JSON object**; the controller parses it and normalizes it.

So: **one request → one OpenAI call** (no multi-step or automatic retries inside this flow).

---

## 6. Response path

- **Without `response_format: "workout_tab"`:**  
  Raw model text is returned as `data.output` (and `usage`).
- **With `response_format: "workout_tab"`:**  
  - Model text is `JSON.parse`’d.  
  - `normalizeWorkoutTabData()` ensures the shape (e.g. `training_days`, `todays_training`, `coach_note`, etc.).  
  - That normalized object is returned as `data` (plus `usage`).  
  - If parsing fails, `data` is still a normalized default shape so the app doesn’t crash.

---

## 7. Summary

| Question | Answer |
|----------|--------|
| **When does the AI run?** | Only when the client sends `POST /api/training/generate`. |
| **When is the document read?** | On the first request that needs doc context; then chunks are cached in memory. |
| **When is the profile read?** | On every request, from `req.user.profile` (user from JWT). |
| **When is OpenAI called?** | Once per request, after building system + user message from doc + profile + body. |
| **Execution style** | Synchronous per request: auth → validate → load context → format profile → call OpenAI → normalize (if workout_tab) → respond. |

No cron, no queue: **one HTTP request = one full run** of this flow.
