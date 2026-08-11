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
const { globalLimiter } = require('./middleware/rateLimiters');

// Fail fast on missing secrets — a server with no JWT_SECRET must never boot.
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('WARNING: JWT_SECRET is shorter than 32 characters — use a longer random secret.');
}

// Behind the ALB: trust one proxy hop so req.ip is the real client IP (rate limiting depends on this).
app.set('trust proxy', 1);

// Ensure local uploads dir exists (for post images – local testing)
const uploadsDir = path.join(process.cwd(), 'uploads', 'images');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(globalLimiter); // Backstop rate limit (strict per-endpoint limits live in the routers)
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve uploaded files (local testing – replace with S3 URLs later)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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

// Start server — connect to MongoDB first so no request ever hits an unconnected DB.
const PORT = process.env.PORT || 8080;

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);

    // Crons need *an* LLM key — Anthropic (preferred by llmClient) or OpenAI.
    // Gating on OPENAI_API_KEY alone silently killed training generation on an Anthropic-only setup.
    if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
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
    } else {
      console.warn('No LLM API key set (ANTHROPIC_API_KEY / OPENAI_API_KEY) — training crons NOT scheduled.');
    }
  });
}

start().catch((err) => {
  console.error('FATAL: failed to start server:', err);
  process.exit(1);
});

module.exports = app;
