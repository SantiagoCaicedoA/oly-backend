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

// Debug: see exactly what path/method the server receives (helps when 404 on live – call GET /api/debug-request)
app.get('/api/debug-request', (req, res) => {
  res.json({
    path: req.path,
    url: req.url,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    method: req.method,
    'content-type': req.headers['content-type'],
  });
});

// Routes (support /api, /api/api, and root so /profile/upload-image works if proxy strips /api)
app.use('/api', routes);
app.use('/api/api', routes);
app.use('/', routes);

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
    const { runDailyCompletionCron } = require('./jobs/dailyCompletionCron');

    // Sunday midnight cron - generate next week's training
    cron.schedule('0 0 * * 0', () => {
      runSundayCron().then((r) => console.log('Sunday cron done', r)).catch((e) => console.error('Sunday cron error', e));
    });
    console.log('Sunday training cron scheduled (0 0 * * 0)');

    // Daily 4 AM cron - mark training days complete
    cron.schedule('0 4 * * *', () => {
      runDailyCompletionCron().then((r) => console.log('Daily completion cron done', r)).catch((e) => console.error('Daily completion cron error', e));
    });
    console.log('Daily completion cron scheduled (0 4 * * *)');
  }
});

module.exports = app;
