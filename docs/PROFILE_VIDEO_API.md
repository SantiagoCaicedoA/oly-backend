# Profile video – endpoint & response (oly-video)

## 1. Profile response me `video_url` kab aata hai

Backend **har profile response** me `video_url` (aur `image_url`) bhejta hai:

- **GET /api/profile** → `data.video_url`
- **POST /api/profile** (create) → `data.video_url`
- **PUT /api/profile** (update) → `data.video_url`
- **POST /api/profile/upload-image** → `data.video_url`
- **POST /api/profile/upload-video** → `data.video_url`, `url`

Agar **video_url empty** hai to:

1. Abhi tak **upload-video** call nahi hua, ya
2. **PUT /api/profile** me poora profile bhejte waqt `profile_video_url` / `video_url` **mat bhejo** (backend existing value preserve karta hai). Agar frontend `profile_video_url: ""` bhej raha ho to URL clear ho jata hai.

---

## 2. Upload profile video – endpoint (oly-video me store)

Videos **oly-video** S3 bucket me store hote hain (env me `AWS_VIDEO_BUCKET=oly-video`).

| Item | Value |
|------|--------|
| **Method** | `POST` |
| **Endpoint** | `{BASE_URL}/api/profile/upload-video` |
| **Auth** | `x-user-id: <User _id>` |
| **Content-Type** | `multipart/form-data` |
| **Body** | Single field **`video`** (file) |
| **Allowed types** | MP4, MOV, WebM, AVI |
| **Max size** | 100 MB |

### Example (cURL)

```bash
curl -X POST "http://localhost:8080/api/profile/upload-video" \
  -H "x-user-id: YOUR_USER_MONGO_ID" \
  -F "video=@/path/to/your-video.mp4"
```

### Example (JavaScript FormData)

```js
const formData = new FormData();
formData.append('video', videoFile); // File from input or picker

const res = await fetch(`${API_BASE}/api/profile/upload-video`, {
  method: 'POST',
  headers: {
    'x-user-id': userId,
    // Do NOT set Content-Type; browser sets multipart boundary
  },
  body: formData,
});
const json = await res.json();
// json.data.video_url  → use this in UI
// json.url             → same URL
```

### Success response (200)

```json
{
  "success": true,
  "url": "https://oly-video.s3.eu-north-1.amazonaws.com/profiles/USER_ID/video/TIMESTAMP-xxx.mp4",
  "data": {
    "image_url": "",
    "video_url": "https://oly-video.s3.eu-north-1.amazonaws.com/profiles/USER_ID/video/TIMESTAMP-xxx.mp4",
    "profile_image_url": "",
    "profile_video_url": "https://oly-video.s3...",
    "display_name": "...",
    ...
  },
  "message": "Profile video uploaded and saved."
}
```

Frontend pe **video_url** ya **url** use karo; dono same hote hain. Profile get karne par bhi wahi `data.video_url` aata hai.

### Error (400)

- No file: `"No video file provided. Send multipart form with field \"video\"."`
- Wrong type: `"Invalid video type. Allowed: video/mp4, ..."`
- Too large: `"Video must be 100MB or less"`

---

## 3. .env (oly-video bucket)

```env
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_VIDEO_BUCKET=oly-video
```

`AWS_VIDEO_BUCKET` na ho to default **oly-video** use hota hai. Bucket AWS me **oly-video** name se bana lo aur same name .env me rakh sakte ho.

---

## 4. Short checklist

| Step | Action |
|------|--------|
| 1 | Upload: `POST /api/profile/upload-video` with `multipart/form-data`, field **`video`**, header **`x-user-id`** |
| 2 | Save: Response me `data.video_url` (or `url`) ko UI me dikhao / save karo |
| 3 | Onboarding/GET: `GET /api/profile` se `data.video_url` read karo – backend hamesha bhejta hai |
| 4 | PUT profile: Onboarding complete karte waqt **profile_video_url / video_url mat overwrite karo** (taaki upload ki hui video reh jaye) |
