const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowStatus,
} = require('../controllers/followController');

router.use(auth);

// Lists (must come before /:userId so "followers" isn't parsed as an id)
router.get('/followers', getFollowers); // ?userId= for another user's list (defaults to me)
router.get('/following', getFollowing); // ?userId= for another user's list (defaults to me)
router.get('/status/:userId', getFollowStatus);

// Follow / unfollow
router.post('/:userId', followUser);
router.delete('/:userId', unfollowUser);

module.exports = router;
