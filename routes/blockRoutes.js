const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createLimiter } = require('../middleware/rateLimiters');
const { block, unblock, listBlocks } = require('../controllers/blockController');

// A real person blocks a handful of people. Bulk blocking was also the lever
// for pushing other people's blocks out of a capped set.
const blockLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: 'Too many blocks. Please try again later.',
});

router.use(auth);

// Plain '/' first so it is never parsed as a :userId.
router.get('/', listBlocks);
router.post('/:userId', blockLimiter, block);
router.delete('/:userId', unblock);

module.exports = router;
