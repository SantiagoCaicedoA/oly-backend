const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getPrivacy, updatePrivacy } = require('../controllers/privacyController');

router.use(auth);
router.get('/', getPrivacy);
router.put('/', updatePrivacy);

module.exports = router;
