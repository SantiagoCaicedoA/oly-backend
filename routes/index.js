const express = require('express');
const router = express.Router();
const userRoutes = require('./userRoutes');
const profileRoutes = require('./profileRoutes');
const videoRoutes = require('./videoRoutes');
const postRoutes = require('./postRoutes');
const trainingRoutes = require('./trainingRoutes');
const v1AuthRoutes = require('./v1AuthRoutes');

// API Routes
router.use('/users', userRoutes);
router.use('/profile', profileRoutes);
router.use('/videos', videoRoutes);
router.use('/posts', postRoutes);
router.use('/training', trainingRoutes);
router.use('/v1/auth', v1AuthRoutes);

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
