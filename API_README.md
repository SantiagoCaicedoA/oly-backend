# Oly Backend – API Reference

This file documents **Signup**, **Signin**, and **Profile PUT** with request/response and detailed payloads.

- **Base URL:** `/api` (e.g. `http://localhost:8080/api`)
- **Auth for profile:** send header `x-user-id: <userId>` (use the user `_id` from signup or signin response).

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

## 3. Profile – PUT (full onboarding payload)

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

`strength_stats` – each lift can have `value` (number) and `checked` (boolean):

```json
{
  "snatch": { "value": 120, "checked": true },
  "power_snatch": { "value": 115, "checked": true },
  "clean_jerk": { "value": 150, "checked": true },
  "clean": { "value": 140, "checked": true },
  "power_clean": { "value": 130, "checked": true },
  "jerk": { "value": 100, "checked": false },
  "back_squat": { "value": 180, "checked": true },
  "front_squat": { "value": 160, "checked": true }
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
    "snatch": { "value": 120, "checked": true },
    "power_snatch": { "value": 115, "checked": true },
    "clean_jerk": { "value": 150, "checked": true },
    "clean": { "value": 140, "checked": true },
    "power_clean": { "value": 130, "checked": true },
    "jerk": { "value": 100, "checked": false },
    "back_squat": { "value": 180, "checked": true },
    "front_squat": { "value": 160, "checked": true }
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

## Quick reference

| Action        | Method | Endpoint              | Auth     |
|---------------|--------|------------------------|----------|
| Signup        | POST   | `/api/users`           | None     |
| Signin        | POST   | `/api/users/signin`    | None     |
| Update profile| PUT    | `/api/profile`         | `x-user-id` |
