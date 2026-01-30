const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const auth = require('../middleware/auth');

// All video routes require authentication
router.use(auth);

// Upload new video
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
