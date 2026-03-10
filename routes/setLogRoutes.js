const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const setLogController = require('../controllers/setLogController');
const auth = require('../middleware/auth');

// Validation middleware
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

// Apply auth middleware to all routes
router.use(auth);

// Validation rules for logging a set
const logSetValidation = [
  body('set_number')
    .isInt({ min: 1 })
    .withMessage('set_number must be a positive integer'),
  body('exercise_name')
    .trim()
    .notEmpty()
    .withMessage('exercise_name is required')
    .isLength({ max: 200 })
    .withMessage('exercise_name must be less than 200 characters'),
  body('time')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('time must be less than 50 characters'),
  body('day')
    .trim()
    .notEmpty()
    .withMessage('day is required')
    .isIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
    .withMessage('day must be one of: monday, tuesday, wednesday, thursday, friday, saturday, sunday'),
];

// Routes
router.post('/', logSetValidation, validate, setLogController.logSet);
router.get('/', setLogController.getSetLogs);
router.delete('/:id', setLogController.deleteSetLog);

module.exports = router;
