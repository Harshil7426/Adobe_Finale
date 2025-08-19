# ---------------------------
# Stage 1: Build frontend
# ---------------------------
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files and install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# ---------------------------
# Stage 2: Backend runtime
# ---------------------------
FROM --platform=linux/amd64 python:3.11-slim

# Set working directory to backend to fix imports
WORKDIR /app/backend

# Create necessary directories
RUN mkdir -p /app/frontend/dist
RUN mkdir -p /app/task

# Copy frontend build from builder stage
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy backend code and install dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./  # backend code goes into /app/backend

# Set environment variables
ENV FRONTEND_BUILD_DIR=/app/frontend/dist
ENV TASK_DIR=/app/task

# Expose port 8080 for FastAPI
EXPOSE 8080

# Run FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
