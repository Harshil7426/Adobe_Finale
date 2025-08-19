# ---------------------------
# Stage 1: Build frontend
# ---------------------------
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ---------------------------
# Stage 2: Backend runtime
# ---------------------------
FROM --platform=linux/amd64 python:3.11-slim

WORKDIR /app/backend

RUN mkdir -p /app/frontend/dist
RUN mkdir -p /app/task

COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

ENV FRONTEND_BUILD_DIR=/app/frontend/dist
ENV TASK_DIR=/app/task

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
