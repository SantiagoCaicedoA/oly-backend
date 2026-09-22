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
      return user;
    } catch (error) {
      if (error.code === 11000) {
        const dupField = (error.keyPattern && Object.keys(error.keyPattern)[0]) ||
          (error.keyValue && Object.keys(error.keyValue)[0]);
        if (dupField === 'username') throw new AppError(409, 'That username is already taken. Please choose another.');
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
    if (!user || !(await user.matchPassword(password))) {
      throw new AppError(401, 'Invalid email or password');
    }
    // Deleted accounts keep their document, so they would otherwise still
    // authenticate. The tombstone email makes this unreachable in practice,
    // but do not depend on that.
    if (user.anonymizedAt) {
      throw new AppError(401, 'Invalid email or password');
    }
    return user;
  }

  /**
   * Update user by ID. Only name, email, password can be updated.
   * @param {string} userId
   * @param {Object} updateData - { name?, email?, password? }
   * @returns {Promise<Object>}
   */
  async updateUser(userId, updateData) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new AppError(404, 'User not found');
      }

      if (updateData.name !== undefined) user.name = updateData.name;
      if (updateData.email !== undefined) user.email = updateData.email;

      // Clearing a handle must UNSET the field. A sparse unique index still
      // indexes an explicit null, so writing null meant the SECOND user to
      // clear their username collided with the first and got a misleading
      // "that username is already taken".
      if (updateData.username !== undefined) {
        user.username =
          updateData.username !== '' ? updateData.username : undefined;
      }

      // Assign and save so userSchema.pre('save') hashes it. The previous
      // findByIdAndUpdate bypassed that hook and stored the password in
      // PLAINTEXT, after which bcrypt compare failed and the user was
      // locked out of their own account.
      if (updateData.password !== undefined) user.password = updateData.password;

      await user.save();

      const out = user.toObject();
      delete out.password;
      return out;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error.code === 11000) {
        const dupField = (error.keyPattern && Object.keys(error.keyPattern)[0]) ||
          (error.keyValue && Object.keys(error.keyValue)[0]);
        if (dupField === 'username') throw new AppError(409, 'That username is already taken. Please choose another.');
        throw new AppError(409, 'Email already exists');
      }
      if (error.name === 'ValidationError') {
        const msg = Object.values(error.errors).map((e) => e.message).join('. ');
        throw new AppError(400, msg || 'Validation failed');
      }
      throw error;
    }
  }

}

module.exports = new UserService();
