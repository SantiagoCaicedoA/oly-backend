# Oly Backend - Dockerfile
# Uses Node.js 20 LTS on Alpine for a small, secure image

FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy application source
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose the port the app runs on
EXPOSE 8080

# Health check (optional - helps orchestrators know app is healthy)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start the application
CMD ["npm", "start"]
