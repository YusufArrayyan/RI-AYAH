# Ri'ayah — satu image: frontend (Vite build) disajikan oleh backend FastAPI.

# ── 1. Build frontend ──────────────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx vite build

# ── 2. Backend ─────────────────────────────────────────────────────────────
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    RIAYAH_ENVIRONMENT=demo
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/app ./app
COPY --from=web /app/frontend/dist /app/frontend/dist

# Basis data SQLite dan data SIMULASI dibuat otomatis saat start.
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
