const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getCurrentSeason } = require('../controllers/leaderboardController');

router.use(auth);

// Drives the "Season 1 · ends Dec 31" UI.
router.get('/current', getCurrentSeason);

module.exports = router;
