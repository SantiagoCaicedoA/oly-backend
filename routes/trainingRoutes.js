const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generate, getWeek, logActivity, addCustomSet, deleteCustomSet } = require('../controllers/trainingController');

// Stored week (from onboarding trigger or Sunday cron) – frontend uses this, no manual generate
router.get('/week', auth, getWeek);
// Optional: manual generate still available for admin/special cases
router.post('/generate', auth, generate);
// Log activity (update weight/reps/completion for a day)
router.patch('/log', auth, logActivity);

// Custom sets (user-added sets to existing exercises)
router.post('/week/custom-set', auth, addCustomSet);
router.delete('/week/custom-set', auth, deleteCustomSet);

module.exports = router;
