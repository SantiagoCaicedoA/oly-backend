const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const c = require('../controllers/notificationController');

router.use(auth);

// Literal paths before anything that could swallow them.
router.get('/unread-count', c.unreadCount);
router.get('/preferences', c.getPreferences);
router.put('/preferences', c.updatePreferences);
router.post('/devices', c.registerDevice);
router.delete('/devices/:token', c.unregisterDevice);
router.post('/read', c.markRead);
router.get('/', c.listNotifications);

module.exports = router;
