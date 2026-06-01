# Stage 1: Build the application assets and compiled CJS server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions for caching
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy all source files
COPY . .

# Run build to generate /dist/ (Vite frontend files and /dist/server.cjs)
RUN npm run build

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package.json and lock file to install production-only dependencies
COPY package*.json ./

# Install ONLY production dependencies to keep the image size minimal
RUN npm ci --only=production

# Copy built files from the compilation stage
COPY --from=builder /app/dist ./dist

# MindSpace server port configuration (Cloud Run will inject PORT automatically, usually 8080)
EXPOSE 8080

# Start command (runs 'node dist/server.cjs' directly for faster startup and proper signal propagation)
CMD ["node", "dist/server.cjs"]
