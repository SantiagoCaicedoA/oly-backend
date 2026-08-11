const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');
const { body, validationResult } = require('express-validator');

// Only the account owner may modify/delete an account.
const requireSelf = (req, res, next) => {
  if (String(req.user._id) !== String(req.params.id)) {
    return res.status(403).json({
      success: false,
      message: 'You can only modify your own account.',
    });
  }
  next();
};

// Validation middleware – returns consistent { success: false, message, errors }
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array();
    const message = errors.map((e) => e.msg).join('. ') || 'Validation failed';
    return res.status(400).json({
      success: false,
      message,
      errors: errors.map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// Signup: name, email, password; username optional (distinct from display_name)
const createUserValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('username').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Username must be 1–50 characters'),
];

const updateUserValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('username').optional().trim().isLength({ max: 50 }).withMessage('Username max 50 characters'),
  body('email').optional().isEmail().withMessage('Please provide a valid email'),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

// Signin: email + password
const signinValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Routes
router.get('/', auth, userController.getAllUsers.bind(userController));
router.post('/signin', authLimiter, signinValidation, validate, userController.signin.bind(userController));
router.get('/me', auth, userController.getMe.bind(userController));
router.get('/check-username', userController.checkUsername.bind(userController));
router.get('/:id', auth, userController.getUserById.bind(userController));
// Signup: POST with name, email, password only (public, rate-limited)
router.post(
  '/',
  authLimiter,
  createUserValidation,
  validate,
  userController.createUser.bind(userController)
);
// Update/delete: owner only
router.put(
  '/:id',
  auth,
  requireSelf,
  updateUserValidation,
  validate,
  userController.updateUser.bind(userController)
);
router.delete('/:id', auth, requireSelf, userController.deleteUser.bind(userController));

module.exports = router;
