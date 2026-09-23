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
const liftRoutes = require('./liftRoutes');
const reviewRoutes = require('./reviewRoutes');
const blockRoutes = require('./blockRoutes');
const privacyRoutes = require('./privacyRoutes');
const notificationRoutes = require('./notificationRoutes');
const reportRoutes = require('./reportRoutes');

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
router.use('/lifts', liftRoutes);
router.use('/review', reviewRoutes);
router.use('/blocks', blockRoutes);
router.use('/privacy', privacyRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);

// Health check route — carries a deploy fingerprint so we can verify from
// outside WHICH build is serving the domain and whether its node_modules
// are intact (a corrupted image once served with iconv-lite broken).
router.get('/health', (req, res) => {
  let iconvOk = false;
  try {
    require('iconv-lite').getCodec('utf-8');
    iconvOk = true;
  } catch (_) {}
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    build: process.env.BUILD_SHA || 'unknown',
    startedAt: process.uptime ? new Date(Date.now() - process.uptime() * 1000).toISOString() : null,
    iconvOk,
  });
});

module.exports = router;
