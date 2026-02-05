# ============================================
# TeamChat Server - Production Dockerfile
# ============================================
# Multi-stage build for optimized image size and security
# Uses non-root user and security best practices

# Stage 1: Dependencies & Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies needed for native modules (argon2 requires node-gyp build tools)
RUN apk add --no-cache python3 make g++ libc-dev

# Copy package files for caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY prisma ./prisma

# Install all dependencies (including dev for building)
RUN pnpm install --frozen-lockfile

# Force rebuild argon2 native module - npm rebuild properly sets gyp variables
RUN cd /app/node_modules/.pnpm/argon2@0.31.2/node_modules/argon2 && \
    npm rebuild

# Generate Prisma client
RUN pnpm db:generate

# Copy source code
COPY . .

# Build shared package first
RUN pnpm --filter @teamchat/shared build

# Build the application
RUN pnpm build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app

# Security: Add non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S teamchat -u 1001 -G nodejs

# Install pnpm (needed for running)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/

# Copy node_modules from builder (includes native modules built for alpine, prisma client)
# We keep all dependencies as pnpm prune breaks native module symlinks
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/prisma ./prisma

# Create uploads directory with correct permissions
RUN mkdir -p /app/uploads && chown -R teamchat:nodejs /app/uploads

# Security: Set restrictive permissions
RUN chmod -R 755 /app && \
    chown -R teamchat:nodejs /app

# Switch to non-root user
USER teamchat

# Environment variables (defaults for container)
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

# Expose the port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
