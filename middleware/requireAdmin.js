/**
 * Admin gate for review endpoints. Sits AFTER auth (req.user is loaded).
 * isAdmin is a manual flag on the User document — there is exactly one
 * reviewer today; a roles system is deliberately premature.
 */
module.exports = function requireAdmin(req, res, next) {
  if (!req.user || req.user.isAdmin !== true) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};
