const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { getQueue, reviewLift } = require('../controllers/reviewController');

router.get('/queue', auth, requireAdmin, getQueue);
router.post('/:liftId', auth, requireAdmin, reviewLift);

module.exports = router;
