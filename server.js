require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

// Initialize Express app
const app = express();
const path = require('path');
const fs = require('fs');

// Connect to MongoDB
connectDB();

// Ensure local uploads dir exists (for post images – local testing)
const uploadsDir = path.join(process.cwd(), 'uploads', 'images');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve uploaded files (local testing – replace with S3 URLs later)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api', routes);

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Oly Backend API',
    version: '1.0.0',
  });
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);

  if (process.env.OPENAI_API_KEY) {
    const cron = require('node-cron');
    const { runSundayCron } = require('./jobs/sundayTrainingCron');
    cron.schedule('0 0 * * 0', () => {
      runSundayCron().then((r) => console.log('Sunday cron done', r)).catch((e) => console.error('Sunday cron error', e));
    });
    console.log('Sunday training cron scheduled (0 0 * * 0)');
  }
});

module.exports = app;
