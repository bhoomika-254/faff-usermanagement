# Build frontend
FROM node:18-alpine as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production
COPY frontend/ ./
RUN npm run build

# Main application
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY database/ ./database/
COPY src/ ./src/
COPY input_jsons/ ./input_jsons/

# Copy built frontend to where FastAPI expects it
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Set Python path so imports work correctly
ENV PYTHONPATH=/app

# Expose port
EXPOSE 7860

# Start FastAPI with debug logging
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "7860", "--log-level", "debug"]