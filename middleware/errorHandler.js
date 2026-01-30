const AppError = require('../utils/AppError');

/**
 * Central error handler. Returns consistent format: { success: false, message } or { success: false, message, errors }.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors;

  // AppError (thrown by services/controllers with statusCode)
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }
  // Mongoose validation error (e.g. required field missing, enum invalid)
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    const details = Object.values(err.errors).map((e) => e.message);
    message = details.length > 0 ? details.join('. ') : 'Validation failed';
    errors = details;
  }
  // Mongoose CastError (e.g. invalid ObjectId)
  else if (err.name === 'CastError') {
    statusCode = 400;
    message = err.kind === 'ObjectId' ? 'Invalid ID' : 'Invalid value';
  }
  // Mongo duplicate key
  else if (err.code === 11000) {
    statusCode = 409;
    message = 'Email already exists';
  }
  // Use statusCode/message from error if set
  else if (err.statusCode) {
    statusCode = err.statusCode;
    message = err.message || message;
  } else if (err.message) {
    message = err.message;
  }

  const payload = {
    success: false,
    message,
  };
  if (errors && errors.length) payload.errors = errors;
  if (process.env.NODE_ENV === 'development' && err.stack) payload.stack = err.stack;

  res.status(statusCode).json(payload);
};

module.exports = errorHandler;
