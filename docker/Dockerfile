# syntax=docker/dockerfile:1
# ============================================
# Stirling Image - Production Dockerfile
# Multi-stage build for single-container deployment
# ============================================

ARG VARIANT=full
ARG GPU=false

# ============================================
# Stage 1: Build the frontend (Vite + React)
# ============================================
FROM node:22-bookworm AS builder

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
# Stage 2: Base image selection
# ============================================
FROM node:22-bookworm AS base-cpu
FROM nvidia/cuda:12.6.3-runtime-ubuntu24.04 AS base-gpu

# Select base: GPU=false -> base-cpu, GPU=true -> base-gpu
FROM base-cpu AS production-base-false
FROM base-gpu AS production-base-true

# ============================================
# Stage 3: Production runtime
# ============================================
FROM production-base-${GPU} AS production

ARG VARIANT
ARG GPU

# Install Node.js when using CUDA base (node:22-bookworm already has it)
RUN if [ "$GPU" = "true" ]; then \
    apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | \
        gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > \
        /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/* \
; fi

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# System dependencies shared by all variants
RUN apt-get update && apt-get install -y --no-install-recommends \
    imagemagick \
    libraw-dev \
    potrace \
    curl \
    gosu \
    libheif-examples \
    && rm -rf /var/lib/apt/lists/*

# Python/ML system dependencies (full variant only)
RUN if [ "$VARIANT" = "full" ]; then \
    apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv python3-dev \
        tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa \
        build-essential \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
; fi

# Python venv + ML packages + model weights (full variant only)
COPY packages/ai/python/requirements.txt /tmp/requirements.txt
COPY packages/ai/python/requirements-gpu.txt /tmp/requirements-gpu.txt
RUN if [ "$VARIANT" = "full" ]; then \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    if [ "$GPU" = "true" ]; then \
        /opt/venv/bin/pip install \
            Pillow numpy opencv-python-headless onnxruntime-gpu && \
        (/opt/venv/bin/pip install rembg || echo "WARNING: rembg not installed") && \
        (/opt/venv/bin/pip install realesrgan \
            --extra-index-url https://download.pytorch.org/whl/cu126 \
            || echo "WARNING: realesrgan not installed") && \
        (/opt/venv/bin/pip install paddlepaddle-gpu paddleocr || echo "WARNING: PaddleOCR not installed") && \
        (/opt/venv/bin/pip install mediapipe || echo "WARNING: mediapipe not installed") && \
        (/opt/venv/bin/pip install lama-cleaner || echo "WARNING: lama-cleaner not installed") && \
        (/opt/venv/bin/pip install seam-carving || echo "WARNING: seam-carving not installed") \
    ; else \
        /opt/venv/bin/pip install \
            Pillow numpy opencv-python-headless onnxruntime && \
        (/opt/venv/bin/pip install "rembg[cpu]" || echo "WARNING: rembg not installed") && \
        (/opt/venv/bin/pip install realesrgan || echo "WARNING: realesrgan not installed") && \
        (/opt/venv/bin/pip install paddlepaddle paddleocr || echo "WARNING: PaddleOCR not installed") && \
        (/opt/venv/bin/pip install mediapipe || echo "WARNING: mediapipe not installed") && \
        (/opt/venv/bin/pip install lama-cleaner || echo "WARNING: lama-cleaner not installed") && \
        (/opt/venv/bin/pip install seam-carving || echo "WARNING: seam-carving not installed") \
    ; fi \
; fi && rm -f /tmp/requirements.txt /tmp/requirements-gpu.txt

COPY docker/download_models.py /tmp/download_models.py
RUN if [ "$VARIANT" = "full" ]; then \
    /opt/venv/bin/python3 /tmp/download_models.py && \
    /opt/venv/bin/python3 -c "\
try: \
    from paddleocr import PaddleOCR; \
    print('Downloading PaddleOCR models...'); \
    ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False); \
    print('PaddleOCR models ready'); \
except: print('PaddleOCR model pre-download skipped') \
" 2>/dev/null || echo "WARNING: Could not pre-download PaddleOCR models" \
; fi && rm -f /tmp/download_models.py

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
RUN if [ "$VARIANT" = "full" ]; then \
    apt-get purge -y --auto-remove build-essential python3-dev && \
    rm -rf /var/lib/apt/lists/* \
; fi

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
    RATE_LIMIT_PER_MIN=100 \
    STIRLING_VARIANT=${VARIANT}

# Create non-root user for runtime
RUN groupadd -r stirling && useradd -r -g stirling -d /app -s /sbin/nologin stirling
RUN chown -R stirling:stirling /app /data /tmp/workspace && \
    ([ -d /opt/venv ] && chown -R stirling:stirling /opt/venv || true)

# Entrypoint fixes volume permissions then drops to stirling via gosu
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 1349

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:1349/api/v1/health || exit 1

ENTRYPOINT ["entrypoint.sh"]
CMD ["npx", "tsx", "apps/api/src/index.ts"]
