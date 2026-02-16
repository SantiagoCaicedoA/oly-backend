const userService = require('../services/userService');
const { formatUserResponse } = require('../utils/profileResponse');

class UserController {
  /**
   * Get all users
   * @param {Object} req
   * @param {Object} res
   * @param {Function} next
   */
  async getAllUsers(req, res, next) {
    try {
      const users = await userService.getAllUsers();
      res.status(200).json({
        success: true,
        count: users.length,
        data: users.map((u) => formatUserResponse(u)),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/me – Current user with profile in one response (requires x-user-id).
   */
  async getMe(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        data: formatUserResponse(req.user),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user by ID
   * @param {Object} req
   * @param {Object} res
   * @param {Function} next
   */
  async getUserById(req, res, next) {
    try {
      const { id } = req.params;
      const user = await userService.getUserById(id);
      res.status(200).json({
        success: true,
        data: formatUserResponse(user),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Signin: email + password, returns user (use data._id as x-user-id for profile APIs)
   */
  async signin(req, res, next) {
    try {
      const user = await userService.signin(req.body.email, req.body.password);
      const token = user.getSignedJwtToken();
      const refreshToken = user.getSignedRefreshToken();
      res.status(200).json({
        success: true,
        token,
        refresh_token: refreshToken,
        data: formatUserResponse(user),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new user (signup)
   * @param {Object} req
   * @param {Object} res
   * @param {Function} next
   */
  async createUser(req, res, next) {
    try {
      const user = await userService.createUser(req.body);
      const token = user.getSignedJwtToken();
      const refreshToken = user.getSignedRefreshToken();
      res.status(201).json({
        success: true,
        token,
        refresh_token: refreshToken,
        data: formatUserResponse(user),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user by ID
   * @param {Object} req
   * @param {Object} res
   * @param {Function} next
   */
  async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const user = await userService.updateUser(id, req.body);
      res.status(200).json({
        success: true,
        data: formatUserResponse(user),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh token: takes a valid refresh_token (from body or header) and returns a new access token
   */
  async refreshToken(req, res, next) {
    try {
      let refreshToken = req.body.refresh_token || req.headers['x-refresh-token'];

      // Also check Authorization header if desired (as fallback)
      if (!refreshToken && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        refreshToken = req.headers.authorization.split(' ')[1];
      }

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
      }

      try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Invalid refresh token',
          });
        }

        const token = user.getSignedJwtToken();
        const newRefreshToken = user.getSignedRefreshToken();

        res.status(200).json({
          success: true,
          token,
          refresh_token: newRefreshToken,
        });
      } catch (err) {
        console.error('Refresh Token Error:', err);
        return res.status(401).json({
          success: false,
          message: 'Refresh token expired or invalid',
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete user by ID
   * @param {Object} req
   * @param {Object} res
   * @param {Function} next
   */
  async deleteUser(req, res, next) {
    try {
      const { id } = req.params;
      await userService.deleteUser(id);
      res.status(200).json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();