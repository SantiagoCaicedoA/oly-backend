const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const auth = require('../middleware/auth');
const { uploadVideoToMemory } = require('../config/upload');

// All video routes require authentication
router.use(auth);

// Upload video file to S3 only – returns URL (use in POST /api/videos with metadata)
router.post(
    '/upload',
    (req, res, next) => {
        uploadVideoToMemory(req, res, (err) => {
            if (err) {
                const message =
                    err.code === 'LIMIT_FILE_SIZE'
                        ? 'Video must be 100MB or less'
                        : err.message;
                return res.status(400).json({ success: false, message });
            }
            next();
        });
    },
    videoController.uploadVideoFile
);

// Create new video record (body: video_url, lift_name, category, reps, etc.)
router.post('/', videoController.uploadVideo);

// Get all videos (with optional filtering via query params)
router.get('/', videoController.getVideos);

// Get single video by ID
router.get('/:id', videoController.getVideoById);

// Update video
router.put('/:id', videoController.updateVideo);

// Delete video
router.delete('/:id', videoController.deleteVideo);

module.exports = router;
