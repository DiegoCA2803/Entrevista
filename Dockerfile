# Multi-stage Dockerfile para Despliegue de Control de Flota Minera

# Stage 1: Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:22-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
COPY backend/tsconfig.json ./backend/
RUN npm ci
COPY backend/ ./backend/
RUN npx tsc -p backend/tsconfig.json

# Stage 3: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled backend and schema
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY backend/src/repositories/schema.sql ./backend/dist/repositories/schema.sql

# Copy built frontend assets
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 4000

CMD ["node", "backend/dist/server.js"]
