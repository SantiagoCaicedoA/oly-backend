const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getLeaderboard,
  getMyRank,
  getFriendsBoard,
} = require('../controllers/leaderboardController');

router.use(auth);

// Viewer-independent board (cacheable + ETag). /me and /friends are
// per-viewer and deliberately separate so the board stays cacheable (§7).
router.get('/', getLeaderboard);
router.get('/me', getMyRank);
router.get('/friends', getFriendsBoard);

module.exports = router;
