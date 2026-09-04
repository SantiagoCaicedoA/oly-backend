const express = require('express');
const router = express.Router();
const userRoutes = require('./userRoutes');
const profileRoutes = require('./profileRoutes');
const videoRoutes = require('./videoRoutes');
const postRoutes = require('./postRoutes');
const trainingRoutes = require('./trainingRoutes');
const dailyCheckInRoutes = require('./dailyCheckInRoutes');
const v1AuthRoutes = require('./v1AuthRoutes');
const setLogRoutes = require('./setLogRoutes');
const followRoutes = require('./followRoutes');
const leaderboardRoutes = require('./leaderboardRoutes');
const seasonRoutes = require('./seasonRoutes');
const athleteRoutes = require('./athleteRoutes');

// API Routes
router.use('/users', userRoutes);
router.use('/profile', profileRoutes);
router.use('/videos', videoRoutes);
router.use('/posts', postRoutes);
router.use('/training', trainingRoutes);
router.use('/daily', dailyCheckInRoutes);
router.use('/v1/auth', v1AuthRoutes);
router.use('/set-log', setLogRoutes);
router.use('/follow', followRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/seasons', seasonRoutes);
router.use('/athletes', athleteRoutes);

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
