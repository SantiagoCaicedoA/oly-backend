const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

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

// Optional initial fields on POST (signup = name, email, password on POST /api/users)
const createProfileValidation = [
  body('display_name').optional().trim().isLength({ max: 100 }),
  body('country').optional().trim().isLength({ max: 100 }),
  body('age').optional().isInt({ min: 1, max: 120 }).toInt(),
];

// All profile routes require authentication
router.use(auth);

// POST – Create profile (call once after signup; optional display_name, country, age)
router.post('/', createProfileValidation, validate, profileController.createProfile);

// GET – Get current user's profile
router.get('/', profileController.getProfile);

// PUT – Update profile (call once on 9th screen with all 9 screens' data in one request)
router.put('/', profileController.updateProfile);

module.exports = router;
