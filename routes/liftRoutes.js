const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createLimiter } = require('../middleware/rateLimiters');
const { submitLift, getMyLifts, flagLift } = require('../controllers/liftController');

// Submissions are rare and precious (athletes don't PR daily) — the
// per-user daily cap lives in the controller; this per-IP limiter is the
// abuse backstop.
const submitLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many submissions from this connection. Try again later.',
});

// Flags can't be weaponized to mass-report (§8).
const flagLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many flags from this connection. Try again later.',
});

router.post('/', auth, submitLimiter, submitLift);
router.get('/me', auth, getMyLifts);
router.post('/:id/flag', auth, flagLimiter, flagLift);

module.exports = router;
