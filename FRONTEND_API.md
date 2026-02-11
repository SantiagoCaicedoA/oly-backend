# Oly Backend – API Reference for Frontend

Share this with the frontend developer. Replace `BASE_URL` with your server (e.g. `http://localhost:8080` or production URL).

---

## Base URL & Auth

| Item | Value |
|------|--------|
| **Base URL** | `{BASE_URL}/api` (e.g. `http://localhost:8080/api`) |
| **Auth header** | `x-user-id: <userId>` |
| **UserId** | Use `data._id` from **Signup** or **Signin** response. Send it on every protected request. |

**Protected routes** = all except Signup, Signin, and `GET /api/health`.

---

## Quick reference – all endpoints

| Action | Method | Endpoint | Auth |
|--------|--------|----------|------|
| Health check | GET | `/api/health` | No |
| Signup | POST | `/api/users` | No |
| Signin | POST | `/api/users/signin` | No |
| Get current user + profile | GET | `/api/users/me` | `x-user-id` |
| **Create athlete profile** | POST | `/api/profile` | `x-user-id` |
| **Get athlete profile** | GET | `/api/profile` | `x-user-id` |
| **Update athlete profile (onboarding)** | PUT | `/api/profile` | `x-user-id` |
| **Upload profile image** | POST | `/api/profile/upload-image` | `x-user-id` |
| **Upload profile video** | POST | `/api/profile/upload-video` | `x-user-id` |
| Create post | POST | `/api/posts` | `x-user-id` |
| List my posts | GET | `/api/posts` | `x-user-id` |
| Get post | GET | `/api/posts/:id` | `x-user-id` |
| Update post | PUT | `/api/posts/:id` | `x-user-id` |
| Delete post | DELETE | `/api/posts/:id` | `x-user-id` |
| **Upload video file (S3)** | POST | `/api/videos/upload` | `x-user-id` |
| Create video record | POST | `/api/videos` | `x-user-id` |
| List my videos | GET | `/api/videos` | `x-user-id` |
| Get video | GET | `/api/videos/:id` | `x-user-id` |
| Update video | PUT | `/api/videos/:id` | `x-user-id` |
| Delete video | DELETE | `/api/videos/:id` | `x-user-id` |

---

## 1. Auth (no auth header)

### Signup – `POST /api/users`
- **Content-Type:** `application/json`
- **Body:**
```json
{
  "name": "Ali Khan",
  "email": "ali@example.com",
  "password": "secret123"
}
```
- **Success (201):** `{ "success": true, "data": { "_id": "...", "name", "email", "createdAt", "updatedAt" } }`
- **Save `data._id`** and use as `x-user-id` for all other APIs.

### Signin – `POST /api/users/signin`
- **Content-Type:** `application/json`
- **Body:**
```json
{
  "email": "ali@example.com",
  "password": "secret123"
}
```
- **Success (200):** `{ "success": true, "data": { "_id", "name", "email", "createdAt", "updatedAt" } }`
- Use `data._id` as `x-user-id`.

### Get current user + profile – `GET /api/users/me`
- **Headers:** `x-user-id: <userId>`
- **Success (200):** `{ "success": true, "data": { "_id", "name", "email", "createdAt", "updatedAt", "profile": { ... } } }`
- **Profile** includes `image_url` and `video_url` (always present; empty string if not set). Also has `profile_image_url`, `profile_video_url`, `display_name`, `country`, `age`, and all onboarding fields.

---

## 2. Athlete profile (onboarding)

### Create profile – `POST /api/profile`
- **Headers:** `x-user-id`, `Content-Type: application/json`
- **Body (all optional):**
```json
{
  "display_name": "Ali",
  "country": "Pakistan",
  "age": 25
}
```
- **Success (201):** `{ "success": true, "data": { "image_url", "video_url", "display_name", "country", "age", ... }, "message": "..." }`
- **Profile response** always has `image_url` and `video_url` (strings; empty if not uploaded yet).

### Get profile – `GET /api/profile`
- **Headers:** `x-user-id`
- **Success (200):** `{ "success": true, "data": { "image_url", "video_url", "profile_image_url", "profile_video_url", "display_name", ... } }`  
  If no profile: `{ "success": true, "data": null, "message": "..." }`

### Update profile (full onboarding) – `PUT /api/profile`
- **Headers:** `x-user-id`, `Content-Type: application/json`
- **Body:** Full or partial profile (merged with existing). All fields optional. Examples: `display_name`, `country`, `age`, `sex`, `experience_years`, `height_cm`, `bodyweight_value`, `bodyweight_unit`, `preferred_unit`, `strength_stats`, `strength_accuracy`, `considerations`, `availability`, `equipment`, `training_preference`, `performance_gaps`, `profile_image_url`, `profile_video_url`.  
  **`strength_stats`** is sectioned: `classic` (snatch, clean_jerk), `variation` (power_snatch, clean, power_clean), `squat` (back_squat, front_squat, overhead_squat), `press` (strict_press, push_press, power_jerk, jerk). Each lift has `value` (number) and `checked` (boolean).
- **Success (200):** `{ "success": true, "data": { "image_url", "video_url", ... }, "message": "Profile updated successfully" }`

### Upload profile image – `POST /api/profile/upload-image`
- **Headers:** `x-user-id`
- **Content-Type:** `multipart/form-data`
- **Body:** One field **`image`** (file). Allowed: JPEG, PNG, GIF, WebP. Max **5MB**.
- **Success (200):** `{ "success": true, "url": "https://...", "data": { "image_url", "video_url", "profile_image_url", ... }, "message": "Profile image uploaded and saved." }`

### Upload profile video – `POST /api/profile/upload-video`
- **Headers:** `x-user-id`
- **Content-Type:** `multipart/form-data`
- **Body:** One field **`video`** (file). Allowed: MP4, MOV, WebM, AVI. Max **100MB**.
- **Success (200):** `{ "success": true, "url": "https://...", "data": { "image_url", "video_url", "profile_video_url", ... }, "message": "Profile video uploaded and saved." }`

---

## 3. Posts

### Create post – `POST /api/posts`
- **Headers:** `x-user-id`
- **Content-Type:** `multipart/form-data`: **`video`** (file, required) + body fields below.
- **Required:** **`video`** (file) — MP4/MOV/WebM/AVI, max 100MB (uploaded to S3). Or **`video_url`** in body.
- **Body fields (form-data):** Send the same shape the frontend uses:
  - `is_private` (boolean or string) — e.g. `false`
  - `is_public` (boolean or string) — e.g. `true`
  - `lift_name` (string) — e.g. `"Clean & Jerk"`
  - `opinion` (string) — user comment
  - `session_detail` (object or JSON string) — e.g. `{ "context": true, "effort_value": 4, "intent_opt": "Speed & Power", "isEffort": true, "isIntent": true, "lifted_kg": 30, "rpe": "8.5" }`
  - `status` (optional) — `DRAFT` | `PUBLISHED` (default `DRAFT`)
- **Success (201):** `data` is in frontend shape: `{ "_id", "user", "image_url", "video_url", "is_private", "is_public", "lift_name", "opinion", "session_detail", "status", "createdAt", "updatedAt" }`

### List posts – `GET /api/posts?status=DRAFT|PUBLISHED&limit=50&skip=0`
- **Headers:** `x-user-id`
- **Success (200):** `{ "success": true, "count", "total", "data": [ ... ] }`

### Get / Update / Delete post – `GET|PUT|DELETE /api/posts/:id`
- **Headers:** `x-user-id`
- **Success:** 200 with `data` (GET/PUT) or 200 with `message` (DELETE).

---

## 4. Videos

### Upload video file (S3) – `POST /api/videos/upload`
- **Headers:** `x-user-id`
- **Content-Type:** `multipart/form-data`
- **Body:** One field **`video`** (file). Allowed: MP4, MOV, WebM, AVI. Max **100MB**.
- **Success (200):** `{ "success": true, "url": "https://...", "message": "..." }`
- **Use the returned `url`** in the next step when creating the video record.

### Create video record – `POST /api/videos`
- **Headers:** `x-user-id`, `Content-Type: application/json`
- **Body:**
```json
{
  "video_url": "https://...",
  "lift_name": "Power Snatch",
  "category": "Classic",
  "reps": 3,
  "weight_value": 100,
  "weight_unit": "kg"
}
```
- **Required:** `video_url`, `lift_name`, `category`, `reps`, `weight_value`, `weight_unit`.
- **Optional:** `intensity_percent`, `percent_of`, `set_index`, `set_total`, `set_label`, `rpe`, `effort_meter`, `bar_speed_label`, `coach_insight`, `thumbnail_url`.
- **category:** `"Classic"` | `"Squat"` | `"Press_Jerk"` | `"Variation"`.
- **Success (201):** `{ "success": true, "data": { ... }, "message": "Video uploaded successfully" }`

### List videos – `GET /api/videos?category=...&lift_name=...&limit=50&skip=0`
- **Headers:** `x-user-id`
- **Success (200):** `{ "success": true, "count", "total", "data": [ ... ] }`

### Get / Update / Delete video – `GET|PUT|DELETE /api/videos/:id`
- **Headers:** `x-user-id`
- **Success:** 200 with `data` (GET/PUT) or 200 with `message` (DELETE).

---

## 5. Error responses

- **400** – Validation error: `{ "success": false, "message": "...", "errors": [{ "field", "message" }] }`
- **401** – Missing or invalid auth: `{ "success": false, "message": "Authentication required..." }` or `"User not found"`
- **404** – Not found: `{ "success": false, "message": "Post not found" }` (or Video/Profile as applicable)
- **500** – Server error: `{ "success": false, "message": "..." }`

---

## 6. Profile response shape (image_url & video_url)

Every profile response (GET/POST/PUT profile, upload-image, upload-video, GET /api/users/me) includes in `data`:

| Field | Type | Description |
|-------|------|-------------|
| `image_url` | string | Profile photo URL (S3). Empty string if not set. |
| `video_url` | string | Profile video URL (S3). Empty string if not set. |
| `profile_image_url` | string | Same as image_url (raw stored value). |
| `profile_video_url` | string | Same as video_url (raw stored value). |

Plus all other profile fields (`display_name`, `country`, `age`, `sex`, `strength_stats`, etc.).

---

## 7. Health check

**GET /api/health** – No auth.  
**Success (200):** `{ "success": true, "message": "API is running", "timestamp": "..." }`
