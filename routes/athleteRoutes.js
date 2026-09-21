const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getAthleteCard } = require('../controllers/leaderboardController');

router.use(auth);

// The athlete sheet on the Rank screen: stats + proof videos + follow state.
router.get('/:id/card', getAthleteCard);

module.exports = router;
