const express = require('express');
const router = express.Router();
const userRoutes = require('./userRoutes');
const profileRoutes = require('./profileRoutes');
const videoRoutes = require('./videoRoutes');

// API Routes
router.use('/users', userRoutes);
router.use('/profile', profileRoutes);
router.use('/videos', videoRoutes);

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
