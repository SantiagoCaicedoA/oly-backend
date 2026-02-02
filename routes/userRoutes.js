const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

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

// Signup: only name, email, password
const createUserValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

const updateUserValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
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
router.get('/', userController.getAllUsers.bind(userController));
router.post('/signin', signinValidation, validate, userController.signin.bind(userController));
router.get('/me', auth, userController.getMe.bind(userController));
router.get('/:id', userController.getUserById.bind(userController));
// Signup: POST with name, email, password only
router.post(
  '/',
  createUserValidation,
  validate,
  userController.createUser.bind(userController)
);
router.put(
  '/:id',
  updateUserValidation,
  validate,
  userController.updateUser.bind(userController)
);
router.delete('/:id', userController.deleteUser.bind(userController));

module.exports = router;
