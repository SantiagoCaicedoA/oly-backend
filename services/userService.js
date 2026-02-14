const User = require('../models/User');
const AppError = require('../utils/AppError');

class UserService {
  /**
   * Get all users
   * @returns {Promise<Array>}
   */
  async getAllUsers() {
    const users = await User.find({}).select('-password');
    return users;
  }

  /**
   * Get user by ID
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async getUserById(userId) {
    const user = await User.findById(userId).select('-password');
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    return user;
  }

  /**
   * Create a new user (signup). Only name, email, password are accepted.
   * @param {Object} userData - { name, email, password }
   * @returns {Promise<Object>}
   */
  async createUser(userData) {
    try {
      const { name, email, password, username } = userData;
      const doc = { name, email, password };
      if (username != null && String(username).trim() !== '') doc.username = String(username).trim();
      const user = new User(doc);
      await user.save();
      const userObject = user.toObject();
      delete userObject.password;
      return userObject;
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError(409, 'Email already exists');
      }
      if (error.name === 'ValidationError') {
        const msg = Object.values(error.errors).map((e) => e.message).join('. ');
        throw new AppError(400, msg || 'Validation failed');
      }
      throw error;
    }
  }

  /**
   * Signin: find user by email and validate password. Returns user without password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>}
   */
  async signin(email, password) {
    const user = await User.findOne({ email: email?.toLowerCase?.() || email });
    if (!user || user.password !== password) {
      throw new AppError(401, 'Invalid email or password');
    }
    const userObject = user.toObject();
    delete userObject.password;
    return userObject;
  }

  /**
   * Update user by ID. Only name, email, password can be updated.
   * @param {string} userId
   * @param {Object} updateData - { name?, email?, password? }
   * @returns {Promise<Object>}
   */
  async updateUser(userId, updateData) {
    try {
      const allowed = {};
      if (updateData.name !== undefined) allowed.name = updateData.name;
      if (updateData.username !== undefined) allowed.username = updateData.username !== '' ? updateData.username : null;
      if (updateData.email !== undefined) allowed.email = updateData.email;
      if (updateData.password !== undefined) allowed.password = updateData.password;

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: allowed },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new AppError(404, 'User not found');
      }
      return user;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error.code === 11000) throw new AppError(409, 'Email already exists');
      if (error.name === 'ValidationError') {
        const msg = Object.values(error.errors).map((e) => e.message).join('. ');
        throw new AppError(400, msg || 'Validation failed');
      }
      throw error;
    }
  }

  /**
   * Delete user by ID
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async deleteUser(userId) {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    return { message: 'User deleted successfully' };
  }
}

module.exports = new UserService();
