const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generate } = require('../controllers/trainingController');

// Training logic: document + athlete profile → generate blocks / interpret feedback
router.post('/generate', auth, generate);

module.exports = router;
