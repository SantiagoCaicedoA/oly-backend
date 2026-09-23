const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createLimiter } = require('../middleware/rateLimiters');
const { createReport } = require('../controllers/reportController');

// Same posture as lift flagging: a real person reports a handful of things,
// and anything past that is either a bot or someone trying to bury an account.
const reportLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many reports. Please try again later.',
});

router.post('/', auth, reportLimiter, createReport);

module.exports = router;
