/**
 * Dependency-free in-memory rate limiters (fixed-window per IP).
 *
 * Deliberately simple: no new npm packages, works for a single-instance MVP.
 * If the ECS service ever scales past one task, swap for a shared store
 * (e.g. express-rate-limit + Redis) — each instance currently counts alone.
 *
 * Requires `app.set('trust proxy', 1)` in server.js so req.ip reflects the
 * client behind the ALB, not the load balancer itself.
 */

function createLimiter({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, windowStart }

  // Prune stale entries so the map can't grow forever.
  const prune = () => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (now - entry.windowStart > windowMs) hits.delete(ip);
    }
  };
  const pruneTimer = setInterval(prune, windowMs);
  if (pruneTimer.unref) pruneTimer.unref(); // don't keep the process alive

  return function limiter(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
      hits.set(ip, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        message: message || 'Too many requests, please try again later.',
      });
    }
    next();
  };
}

// Strict: login/signup/refresh — protects against credential brute-forcing.
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: 'Too many authentication attempts. Please try again in a few minutes.',
});

// Loose global backstop: generous enough to never bother a real user.
const globalLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
});

module.exports = { authLimiter, globalLimiter, createLimiter };
