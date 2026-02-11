# Oly Backend – API Reference

This file documents **Signup**, **Signin**, and **Profile PUT** with request/response and detailed payloads.

- **Base URL:** `/api` (e.g. `http://localhost:8080/api`)
- **Auth for profile / me:** send header `x-user-id: <userId>` (use the user `_id` from signup or signin response).
- **Profile** is stored **inside the User document** (`user.profile`). One read gives user + profile.

---

## 1. Signup

Creates a new user. Only **name**, **email**, and **password** are accepted.

| Item    | Value |
|---------|--------|
| **Method** | `POST` |
| **Endpoint** | `/api/users` |
| **Auth** | None |
| **Content-Type** | `application/json` |

### Request body (payload)

| Field      | Type   | Required | Rules |
|-----------|--------|----------|--------|
| `name`    | string | Yes      | Non-empty, trimmed |
| `email`   | string | Yes      | Valid email, unique |
| `password`| string | Yes      | Min 6 characters |

### Example payload

```json
{
  "name": "Ali Khan",
  "email": "ali@example.com",
  "password": "secret123"
}
```

### Example request

```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ali Khan","email":"ali@example.com","password":"secret123"}'
```

### Success response (201)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Ali Khan",
    "email": "ali@example.com",
    "createdAt": "2025-01-30T10:00:00.000Z",
    "updatedAt": "2025-01-30T10:00:00.000Z"
  }
}
```

*Password is not returned. Save `data._id` and use it as `x-user-id` for profile APIs.*

### Error responses

- **400** – Validation failed (e.g. missing name, invalid email, short password).  
  Body: `{ "success": false, "errors": [...] }`
- **500** – Email already exists (duplicate).  
  Handled by error handler.

---

## 2. Signin

Authenticates a user with email and password. Use the returned user `_id` as `x-user-id` for profile and other protected routes.

| Item    | Value |
|---------|--------|
| **Method** | `POST` |
| **Endpoint** | `/api/users/signin` |
| **Auth** | None |
| **Content-Type** | `application/json` |

### Request body (payload)

| Field       | Type   | Required | Rules |
|------------|--------|----------|--------|
| `email`    | string | Yes      | Valid email |
| `password` | string | Yes      | Min 6 characters |

### Example payload

```json
{
  "email": "ali@example.com",
  "password": "secret123"
}
```

### Example request

```bash
curl -X POST http://localhost:8080/api/users/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@example.com","password":"secret123"}'
```

### Success response (200)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Ali Khan",
    "email": "ali@example.com",
    "createdAt": "2025-01-30T10:00:00.000Z",
    "updatedAt": "2025-01-30T10:00:00.000Z"
  }
}
```

*Use `data._id` as the `x-user-id` header for profile APIs.*

### Error responses

- **400** – Validation failed (invalid email or missing password).  
  Body: `{ "success": false, "errors": [...] }`
- **401** – Invalid email or password.  
  Body: `{ "success": false, "message": "Invalid email or password" }`

---

## 3. Get current user (with profile)

Returns the **complete user** (no password) including **profile** in one response. Use **GET /api/users/me** with header `x-user-id: <userId>`. Response: `{ success: true, data: { _id, name, email, createdAt, updatedAt, profile: { ... } } }`. If profile not completed, `profile` may be null or empty.

---

## 4. Profile – Upload image (S3) and save URL to athlete profile

Upload a profile image to S3; the API returns the public URL and saves it to the current user's profile as `profile_image_url`.

| Item       | Value |
|------------|--------|
| **Method** | `POST` |
| **Endpoint** | `/api/profile/upload-image` |
| **Auth**   | Required: `x-user-id: <userId>` |
| **Content-Type** | `multipart/form-data` |

- Field name: **`image`** (file). Allowed: JPEG, PNG, GIF, WebP; max 5MB.

```bash
curl -X POST http://localhost:8080/api/profile/upload-image \
  -H "x-user-id: YOUR_USER_ID" \
  -F "image=@/path/to/photo.jpg"
```

**Success (200):** `{ "success": true, "url": "https://...", "data": { "profile_image_url": "https://...", ... }, "message": "Profile image uploaded and saved." }`

The URL is stored as `profile_image_url` and returned by **GET /api/profile** and **GET /api/users/me**. Ensure your S3 bucket allows public read for objects (bucket policy or ACL).

---

## 5. Profile – PUT (full onboarding payload)

Updates the current user’s profile. Call **once** when the user completes the 9th onboarding screen and send **all 9 screens’ data** in one request. Existing profile is merged with the payload (nested objects are deep-merged).

| Item    | Value |
|---------|--------|
| **Method** | `PUT` |
| **Endpoint** | `/api/profile` |
| **Auth** | Required: `x-user-id: <userId>` |
| **Content-Type** | `application/json` |

### Request body (payload) – detailed

All fields are optional; send only what you collect. Structure matches the 9 onboarding screens.

#### Screen 1 – Basic info

| Field              | Type   | Description / constraints |
|--------------------|--------|----------------------------|
| `display_name`     | string | Display name |
| `country`          | string | Country |
| `age`              | number | 1–120 |
| `sex`              | string | `"Male"` \| `"Female"` \| `"Other"` |
| `experience_years`  | number | Years of experience |

#### Body stats

| Field               | Type   | Description / constraints |
|---------------------|--------|----------------------------|
| `height_cm`         | number | Height in cm |
| `bodyweight_value`  | number | Bodyweight value |
| `bodyweight_unit`   | string | `"kg"` \| `"lbs"` |
| `preferred_unit`    | string | `"Metric"` \| `"Imperial"` |

#### Screen 2 & 3 – Current strength

| Field               | Type   | Description |
|---------------------|--------|-------------|
| `strength_stats`    | object | See structure below |
| `strength_accuracy` | string | `"Tested"` \| `"Estimated"` \| `"Unsure"` |

`strength_stats` – grouped by section (CLASSIC, VARIATION, SQUAT, PRESS). Each lift has `value` (number) and `checked` (boolean):

```json
{
  "classic": {
    "snatch": { "value": 120, "checked": true },
    "clean_jerk": { "value": 150, "checked": true }
  },
  "variation": {
    "power_snatch": { "value": 115, "checked": true },
    "clean": { "value": 140, "checked": true },
    "power_clean": { "value": 130, "checked": true }
  },
  "squat": {
    "back_squat": { "value": 180, "checked": true },
    "front_squat": { "value": 160, "checked": true },
    "overhead_squat": { "value": 0, "checked": false }
  },
  "press": {
    "strict_press": { "value": 0, "checked": false },
    "push_press": { "value": 0, "checked": false },
    "power_jerk": { "value": 0, "checked": false },
    "jerk": { "value": 100, "checked": true }
  }
}
```

#### Screen 4 – Training considerations

| Field     | Type   | Description |
|-----------|--------|-------------|
| `considerations` | object | See structure below |

```json
{
  "has_limitations": true,
  "affected_areas": ["Lower back", "Knees"],
  "impact_level": "Mild",
  "triggers": ["Overhead position", "When fatigued"]
}
```

- `has_limitations`: boolean  
- `affected_areas`: array of strings (e.g. body areas)  
- `impact_level`: `"Mild"` \| `"Moderate"` \| `"High"`  
- `triggers`: array of strings  

#### Screen 5 – Availability

| Field     | Type   | Description |
|-----------|--------|-------------|
| `availability` | object | See structure below |

```json
{
  "training_days_per_week": 4,
  "session_duration": 60,
  "preferred_rest_days": ["Monday", "Wednesday"]
}
```

- `training_days_per_week`: number, 2–6  
- `session_duration`: one of `45`, `60`, `75`, `90` (minutes)  
- `preferred_rest_days`: array of day names (strings)  

#### Screen 6 – Equipment

| Field     | Type   | Description |
|-----------|--------|-------------|
| `equipment` | object | See structure below |

```json
{
  "optional": ["Lifting Blocks", "Pull-up Bar", "Kettlebell"]
}
```

- `optional`: array of equipment names (strings)  

#### Screen 7 – Training preference

| Field                | Type   | Allowed values |
|----------------------|--------|----------------|
| `training_preference` | string | `"High Intensity"` \| `"Balanced"` \| `"Higher Volume"` \| `"Adaptive"` |

#### Screen 8 – Performance gaps

| Field             | Type     | Description |
|-------------------|----------|-------------|
| `performance_gaps`| string[] | e.g. `["Limited leg endurance", "Slow pull from the floor"]` |

---

### Example full PUT payload (all 9 screens)

```json
{
  "display_name": "Ali Khan",
  "country": "Pakistan",
  "age": 25,
  "sex": "Male",
  "experience_years": 3,
  "height_cm": 175,
  "bodyweight_value": 72,
  "bodyweight_unit": "kg",
  "preferred_unit": "Metric",
  "strength_stats": {
    "classic": {
      "snatch": { "value": 120, "checked": true },
      "clean_jerk": { "value": 150, "checked": true }
    },
    "variation": {
      "power_snatch": { "value": 115, "checked": true },
      "clean": { "value": 140, "checked": true },
      "power_clean": { "value": 130, "checked": true }
    },
    "squat": {
      "back_squat": { "value": 180, "checked": true },
      "front_squat": { "value": 160, "checked": true },
      "overhead_squat": { "value": 0, "checked": false }
    },
    "press": {
      "strict_press": { "value": 0, "checked": false },
      "push_press": { "value": 0, "checked": false },
      "power_jerk": { "value": 0, "checked": false },
      "jerk": { "value": 100, "checked": true }
    }
  },
  "strength_accuracy": "Tested",
  "considerations": {
    "has_limitations": false,
    "affected_areas": [],
    "impact_level": "Mild",
    "triggers": []
  },
  "availability": {
    "training_days_per_week": 4,
    "session_duration": 60,
    "preferred_rest_days": ["Monday", "Wednesday"]
  },
  "equipment": {
    "optional": ["Pull-up Bar", "Lifting Blocks"]
  },
  "training_preference": "Balanced",
  "performance_gaps": ["Limited leg endurance"]
}
```

### Example request

```bash
curl -X PUT http://localhost:8080/api/profile \
  -H "Content-Type: application/json" \
  -H "x-user-id: 507f1f77bcf86cd799439011" \
  -d '{ ... }'
```

### Success response (200)

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "user": "507f1f77bcf86cd799439011",
    "display_name": "Ali Khan",
    "country": "Pakistan",
    "age": 25,
    "sex": "Male",
    "experience_years": 3,
    "height_cm": 175,
    "bodyweight_value": 72,
    "bodyweight_unit": "kg",
    "preferred_unit": "Metric",
    "strength_stats": { ... },
    "strength_accuracy": "Tested",
    "considerations": { ... },
    "availability": { ... },
    "equipment": { ... },
    "training_preference": "Balanced",
    "performance_gaps": [ ... ],
    "createdAt": "...",
    "updatedAt": "..."
  },
  "message": "Profile updated successfully"
}
```

### Error responses

- **401** – Missing or invalid `x-user-id`, or user not found.  
  Body: `{ "success": false, "message": "..." }`
- **500** – Validation or server error (see error handler response).

---

## 6. Posts – Create / List / Get / Update / Delete

Create a new post (draft or published). **Video is required** (upload or URL); other details (opinion, load, etc.) go in the form body. Image is optional. All post routes require `x-user-id`.

| Item       | Value |
|------------|--------|
| **Method** | `POST` |
| **Endpoint** | `/api/posts` |
| **Auth**   | `x-user-id` |
| **Content-Type** | `multipart/form-data` (video file + body fields) |

### Create post – request

- **Video (required):** Either upload a file in field **`video`** (MP4, MOV, WebM, AVI; max 100MB; stored on S3) or send **`video_url`** in the body.
- **Image (optional):** Field **`image`** — JPEG/PNG/GIF/WebP, max 5MB. If omitted, `image_url` is stored as empty string.
- **Other details (optional):** Send as form body fields.

| Field         | Type    | Required | Description |
|---------------|---------|----------|-------------|
| `video`       | file    | One of video / video_url | Video file (multipart); MP4/MOV/WebM/AVI, max 100MB |
| `video_url`   | string  | One of video / video_url | URL to the video (e.g. S3) when not uploading a file |
| `image`       | file    | No       | Image file (multipart); JPEG/PNG/GIF/WebP, max 5MB |
| `image_url`   | string  | No       | URL to image (if not uploading); default empty |
| `opinion`     | string  | No       | User's notes/comment (max 2000 chars) |
| `load_lifted` | number  | No       | Load lifted (e.g. 123 for 123 kg) |
| `load_unit`   | string  | No       | `"kg"` or `"lbs"` (default `"kg"`) |
| `context`     | string  | No       | Session context (max 500 chars) |
| `intent`      | string  | No       | Intent text (max 500 chars) |
| `effort`      | string  | No       | Effort text (max 500 chars) |
| `rpe`         | number  | No       | Rate of perceived exertion (0–10) |
| `visibility`  | array   | No       | `["PRIVATE"]` or `["SHARED_WITH_FRIENDS"]` (default `["PRIVATE"]`) |
| `status`      | string  | No       | `"DRAFT"` or `"PUBLISHED"` (default `"DRAFT"`) |

### Example create post (multipart – video + body details)

```bash
curl -X POST http://localhost:8080/api/posts \
  -H "x-user-id: YOUR_USER_ID" \
  -F "video=@/path/to/lift.mp4" \
  -F "opinion=Clean felt solid today, working on lockout" \
  -F "load_lifted=120" \
  -F "load_unit=kg" \
  -F "context=Heavy singles" \
  -F "intent=Build to heavy single" \
  -F "effort=RPE 8" \
  -F "rpe=8" \
  -F "visibility=[\"SHARED_WITH_FRIENDS\"]" \
  -F "status=PUBLISHED"
```

### Sample payload (form-data fields; video as file)

| Field        | Value |
|-------------|--------|
| `video`     | (file) **required** |
| `opinion`   | `Clean felt solid today` |
| `load_lifted` | `120` |
| `load_unit` | `kg` |
| `context`   | `Heavy singles, third session` |
| `intent`    | `Build to a heavy single` |
| `effort`    | `RPE 8` |
| `rpe`       | `8` |
| `visibility` | `["SHARED_WITH_FRIENDS"]` |
| `status`    | `PUBLISHED` |

### Create post – success (201)

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "user": "...",
    "image_url": "",
    "video_url": "https://s3.../...",
    "opinion": "Clean felt solid today",
    "load_lifted": 120,
    "load_unit": "kg",
    "context": "Heavy singles",
    "intent": "Build to a heavy single",
    "effort": "RPE 8",
    "rpe": 8,
    "visibility": ["SHARED_WITH_FRIENDS"],
    "status": "PUBLISHED",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "message": "Post created successfully"
}
```

### Other post endpoints

| Action        | Method | Endpoint       | Auth       |
|---------------|--------|----------------|------------|
| List my posts | GET    | `/api/posts`   | `x-user-id` |
| Get post by ID| GET    | `/api/posts/:id` | `x-user-id` |
| Update post   | PUT    | `/api/posts/:id` | `x-user-id` |
| Delete post   | DELETE | `/api/posts/:id` | `x-user-id` |

List supports query params: `status` (DRAFT/PUBLISHED), `limit`, `skip`.

---

## 7. Video – Upload file to S3

Upload a video file to S3; returns the public URL. Use this URL in **POST /api/videos** with metadata (lift_name, category, reps, weight_value, etc.) to create the video record.

| Item       | Value |
|------------|--------|
| **Method** | `POST` |
| **Endpoint** | `/api/videos/upload` |
| **Auth**   | Required: `x-user-id` |
| **Content-Type** | `multipart/form-data` |

- Field name: **`video`** (file). Allowed: MP4, MOV, WebM, AVI; max **100MB**.

```bash
curl -X POST http://localhost:8080/api/videos/upload \
  -H "x-user-id: YOUR_USER_ID" \
  -F "video=@/path/to/lift.mp4"
```

**Success (200):** `{ "success": true, "url": "https://oly-image.s3.eu-north-1.amazonaws.com/videos/USER_ID/...", "message": "Video uploaded successfully. Use this URL in POST /api/videos with metadata." }`

Then create the video record: **POST /api/videos** with JSON body `{ "video_url": "<returned url>", "lift_name": "...", "category": "Classic", "reps": 3, "weight_value": 100, ... }`.

---

## Quick reference

| Action              | Method | Endpoint              | Auth       |
|---------------------|--------|------------------------|------------|
| Signup              | POST   | `/api/users`           | None       |
| Signin              | POST   | `/api/users/signin`    | None       |
| **Get current user + profile** | GET    | `/api/users/me`        | `x-user-id` |
| Update profile      | PUT    | `/api/profile`         | `x-user-id` |
| Upload profile image| POST   | `/api/profile/upload-image` | `x-user-id` |
| Create post         | POST   | `/api/posts`           | `x-user-id` |
| List my posts       | GET    | `/api/posts`           | `x-user-id` |
| **Upload video (S3)** | POST   | `/api/videos/upload`   | `x-user-id` |