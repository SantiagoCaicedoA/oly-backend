const userService = require('../services/userService');
const { profileWithMediaUrls } = require('../utils/profileResponse');

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
        data: users,
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
      const user = req.user.toObject();
      delete user.password;
      if (user.profile) {
        user.profile = profileWithMediaUrls(user.profile);
      }
      res.status(200).json({
        success: true,
        data: user,
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
        data: user,
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
      res.status(200).json({
        success: true,
        data: user,
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
      res.status(201).json({
        success: true,
        data: user,
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
        data: user,
      });
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