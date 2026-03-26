# syntax=docker/dockerfile:1
# ============================================
# Stirling Image - Production Dockerfile
# Multi-stage build for single-container deployment
# ============================================

# ============================================
# Stage 1: Build the frontend (Vite + React)
# ============================================
FROM --platform=linux/amd64 node:22-bookworm AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config first (for layer caching)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./

# Copy all package.json files for dependency install
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/
COPY apps/web/postcss.config.js ./apps/web/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/image-engine/package.json packages/image-engine/tsconfig.json ./packages/image-engine/
COPY packages/ai/package.json packages/ai/tsconfig.json ./packages/ai/

# Install ALL dependencies (dev + prod needed for building)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store/v3 \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build only the web frontend (API runs from TS source via tsx)
RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    pnpm --filter @stirling-image/web build

# ============================================
# Stage 2: Production runtime
# ============================================
FROM --platform=linux/amd64 node:22-bookworm AS production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Install system dependencies for image processing and AI
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev \
    imagemagick \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa \
    libraw-dev \
    potrace \
    curl \
    build-essential \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create Python venv and install ML packages
RUN python3 -m venv /opt/venv

COPY packages/ai/python/requirements.txt /tmp/requirements.txt

# Install Python packages - fail loudly for critical ones, warn for optional
RUN --mount=type=cache,id=pip-cache,target=/root/.cache/pip \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install \
    Pillow numpy opencv-python-headless onnxruntime && \
    (/opt/venv/bin/pip install rembg[cpu] || echo "WARNING: rembg not installed - background removal will be unavailable") && \
    (/opt/venv/bin/pip install realesrgan || echo "WARNING: realesrgan not installed - will fallback to Lanczos upscaling") && \
    (/opt/venv/bin/pip install paddlepaddle paddleocr || echo "WARNING: PaddleOCR not installed - will fallback to Tesseract") && \
    (/opt/venv/bin/pip install mediapipe || echo "WARNING: mediapipe not installed - face detection will be unavailable") && \
    (/opt/venv/bin/pip install lama-cleaner || echo "WARNING: lama-cleaner not installed - object eraser will be unavailable") && \
    rm /tmp/requirements.txt

# Pre-download ALL AI model weights into the image (no first-use download delays)
# This makes the Docker image fully self-contained — works offline
COPY docker/download_models.py /tmp/download_models.py
RUN /opt/venv/bin/python3 /tmp/download_models.py && rm /tmp/download_models.py

RUN /opt/venv/bin/python3 -c "\
try: \
    from paddleocr import PaddleOCR; \
    print('Downloading PaddleOCR models...'); \
    ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False); \
    print('PaddleOCR models ready'); \
except: print('PaddleOCR model pre-download skipped') \
" 2>/dev/null || echo "WARNING: Could not pre-download PaddleOCR models"

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./

# Copy ALL package manifests
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/image-engine/package.json packages/image-engine/tsconfig.json ./packages/image-engine/
COPY packages/ai/package.json packages/ai/tsconfig.json ./packages/ai/

# Install production dependencies (tsx is now in prod deps)
# Skip the root prepare script (husky is a devDep, not available in prod)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store/v3 \
    npm pkg delete scripts.prepare && \
    pnpm install --frozen-lockfile --prod

# Remove build tools no longer needed in production
RUN apt-get purge -y --auto-remove build-essential python3-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy source code for API (tsx runs TS directly - no build step needed)
COPY apps/api/src ./apps/api/src
COPY apps/api/drizzle ./apps/api/drizzle

# Copy workspace packages source (referenced by API at runtime)
COPY packages/shared/src ./packages/shared/src
COPY packages/image-engine/src ./packages/image-engine/src
COPY packages/ai/src ./packages/ai/src
COPY packages/ai/python ./packages/ai/python

# Copy built frontend from builder stage
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Create required directories
RUN mkdir -p /data /tmp/workspace

# Environment defaults (matching PRD Section 16.1)
ENV PORT=1349 \
    NODE_ENV=production \
    AUTH_ENABLED=true \
    DEFAULT_USERNAME=admin \
    DEFAULT_PASSWORD=admin \
    STORAGE_MODE=local \
    DB_PATH=/data/stirling.db \
    WORKSPACE_PATH=/tmp/workspace \
    PYTHON_VENV_PATH=/opt/venv \
    DEFAULT_THEME=light \
    DEFAULT_LOCALE=en \
    APP_NAME="Stirling Image" \
    FILE_MAX_AGE_HOURS=24 \
    CLEANUP_INTERVAL_MINUTES=30 \
    MAX_UPLOAD_SIZE_MB=100 \
    MAX_BATCH_SIZE=200 \
    CONCURRENT_JOBS=3 \
    MAX_MEGAPIXELS=100 \
    RATE_LIMIT_PER_MIN=100

# Run as non-root user for security
RUN groupadd -r stirling && useradd -r -g stirling -d /app -s /sbin/nologin stirling
RUN chown -R stirling:stirling /app /data /tmp/workspace /opt/venv
USER stirling

EXPOSE 1349

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:1349/api/v1/health || exit 1

# Use tsx to run TypeScript source directly (handles workspace package resolution)
CMD ["npx", "tsx", "apps/api/src/index.ts"]
