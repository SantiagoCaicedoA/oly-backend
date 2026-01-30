const AppError = require('../utils/AppError');

const notFound = (req, res, next) => {
  next(new AppError(404, 'Resource not found'));
};

module.exports = notFound;
