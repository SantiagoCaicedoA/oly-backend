const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generate, getWeek, logActivity, addCustomSet, deleteCustomSet, generateFullProgram, generateRollingWeek, setTier, regenerateWeek } = require('../controllers/trainingController');

// Stored week (from onboarding trigger or Sunday cron) – frontend uses this, no manual generate
router.get('/week', auth, getWeek);
// Optional: manual generate still available for admin/special cases
router.post('/generate', auth, generate);
// Guarded AI program pipeline (pre-flight -> Claude -> linters). Test/preview: returns program + repair report.
router.post('/generate-program', auth, generateFullProgram);
// PAID rolling pipeline: AI block plan + this-week build from plan + latest feedback, through the guards.
router.post('/rolling-week', auth, generateRollingWeek);
// Dev/self-serve: set own tier (until billing exists); regenerate + store this week via the tier's pipeline.
router.post('/set-tier', auth, setTier);
router.post('/regenerate', auth, regenerateWeek);
// Log activity (update weight/reps/completion for a day)
router.patch('/log', auth, logActivity);

// Custom sets (user-added sets to existing exercises)
router.post('/week/custom-set', auth, addCustomSet);
router.delete('/week/custom-set', auth, deleteCustomSet);

module.exports = router;
