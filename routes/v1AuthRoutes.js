const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');

const { body } = require('express-validator');

const signinValidation = [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
];

const createUserValidation = [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
];

const validate = (req, res, next) => {
    const { validationResult } = require('express-validator');
    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(400).json({ success: false, errors: result.array() });
    }
    next();
};

router.post('/signin', authLimiter, signinValidation, validate, userController.signin.bind(userController));
router.post('/signup', authLimiter, createUserValidation, validate, userController.createUser.bind(userController));
router.post('/refresh', authLimiter, userController.refreshToken.bind(userController));

module.exports = router;
