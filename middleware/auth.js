// Simple auth middleware - reads userId from headers
// TODO: Replace with proper JWT authentication later
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        const userId = req.headers['x-user-id'];

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required. Please provide x-user-id header.'
            });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid authentication'
        });
    }
};

module.exports = auth;
