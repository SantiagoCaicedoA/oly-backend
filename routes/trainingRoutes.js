const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generate, getWeek } = require('../controllers/trainingController');

// Stored week (from onboarding trigger or Sunday cron) – frontend uses this, no manual generate
router.get('/week', auth, getWeek);
// Optional: manual generate still available for admin/special cases
router.post('/generate', auth, generate);

module.exports = router;
