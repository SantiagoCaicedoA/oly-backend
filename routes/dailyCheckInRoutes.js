const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { submitDailyCheckIn } = require('../controllers/dailyCheckInController');

// Submit daily check-in - may trigger AI adjustment for abnormal data
router.post('/check-in', auth, submitDailyCheckIn);

module.exports = router;
