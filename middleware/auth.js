// Simple auth middleware - reads userId from headers
// TODO: Replace with proper JWT authentication later
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        // Set token from Bearer token in header (handle any whitespace/newlines within or after Bearer)
        const parts = req.headers.authorization.split(/\s+/);
        if (parts.length > 1) {
            token = parts.slice(1).join('');
        }
    }

    // Make sure token exists
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route',
        });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'No user found with this id',
            });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('Auth Middleware Error:', err);
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route',
        });
    }
};

module.exports = auth;
