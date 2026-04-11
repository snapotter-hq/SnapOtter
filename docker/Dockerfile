# syntax=docker/dockerfile:1
# ============================================
# Stirling Image - Unified Production Dockerfile
# Single image: GPU auto-detected on amd64, CPU on arm64
# ============================================

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
# Stage 2: Build caire (content-aware resize)
# ============================================
FROM golang:1.23-bookworm AS caire-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    libwayland-dev libx11-dev libx11-xcb-dev libxkbcommon-x11-dev \
    libgles2-mesa-dev libegl1-mesa-dev libffi-dev libxcursor-dev \
    libxrandr-dev libxinerama-dev libxi-dev libxxf86vm-dev \
    libvulkan-dev libxfixes-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN go install github.com/esimov/caire/cmd/caire@v1.5.0

# ============================================
# Stage 3: Platform-specific base images
# ============================================
FROM node:22-bookworm AS base-linux-arm64
FROM nvidia/cuda:12.6.3-runtime-ubuntu24.04 AS base-linux-amd64

# ============================================
# Stage 4: Production runtime
# ============================================
ARG TARGETOS
ARG TARGETARCH
FROM base-${TARGETOS}-${TARGETARCH} AS production

ARG TARGETARCH

# Install Node.js on amd64 (CUDA base has no Node; arm64 base already has it)
RUN if [ "$TARGETARCH" = "amd64" ]; then \
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

# System dependencies (all platforms)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    imagemagick \
    libraw-dev \
    potrace \
    curl \
    gosu \
    libheif-examples \
    python3 python3-pip python3-venv python3-dev \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa \
    build-essential \
    libgl1 libglib2.0-0 \
    libegl1 libwayland-egl1 libwayland-client0 libwayland-cursor0 \
    libxkbcommon-x11-0 libxkbcommon0 libxcursor1 \
    && rm -rf /var/lib/apt/lists/*

# Caire binary (content-aware seam carving)
COPY --from=caire-builder /go/bin/caire /usr/local/bin/caire

# Python venv - Layer 1: Base packages (rarely change, ~3 GB)
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install \
        Pillow==11.1.0 \
        numpy==1.26.4 \
        opencv-python-headless==4.10.0.84

# Platform-conditional ONNX runtime
RUN if [ "$TARGETARCH" = "amd64" ]; then \
    /opt/venv/bin/pip install onnxruntime-gpu==1.20.1 \
; else \
    /opt/venv/bin/pip install onnxruntime==1.20.1 \
; fi

# Python venv - Layer 2: Tool packages (change occasionally, ~2 GB)
RUN if [ "$TARGETARCH" = "amd64" ]; then \
    /opt/venv/bin/pip install rembg==2.0.62 && \
    /opt/venv/bin/pip install realesrgan==0.3.0 \
        --extra-index-url https://download.pytorch.org/whl/cu126 && \
    /opt/venv/bin/pip install paddlepaddle-gpu==3.0.0 \
        --extra-index-url https://www.paddlepaddle.org.cn/packages/stable/cu126/ && \
    /opt/venv/bin/pip install paddleocr==2.9.1 \
; else \
    /opt/venv/bin/pip install "rembg[cpu]==2.0.62" && \
    /opt/venv/bin/pip install realesrgan==0.3.0 && \
    /opt/venv/bin/pip install paddlepaddle==3.0.0 paddleocr==2.9.1 \
; fi

# mediapipe 0.10.21 only has amd64 wheels; arm64 maxes out at 0.10.18
RUN if [ "$TARGETARCH" = "amd64" ]; then \
    /opt/venv/bin/pip install mediapipe==0.10.21 \
; else \
    /opt/venv/bin/pip install mediapipe==0.10.18 \
; fi

# Pre-download and verify all ML models
# Note: on amd64, paddlepaddle-gpu can't import without the CUDA driver (only
# available at runtime). The download script gracefully skips PaddleOCR model
# pre-download in this case; models download on first use at runtime instead.
COPY docker/download_models.py /tmp/download_models.py
RUN /opt/venv/bin/python3 /tmp/download_models.py && rm -f /tmp/download_models.py

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
RUN mkdir -p /data /data/files /tmp/workspace

# Environment defaults
ENV PORT=1349 \
    NODE_ENV=production \
    AUTH_ENABLED=true \
    DEFAULT_USERNAME=admin \
    DEFAULT_PASSWORD=admin \
    STORAGE_MODE=local \
    DB_PATH=/data/stirling.db \
    WORKSPACE_PATH=/tmp/workspace \
    FILES_STORAGE_PATH=/data/files \
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
    LOG_LEVEL=info

# NVIDIA Container Toolkit env vars (harmless on non-GPU systems)
ENV NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Suppress noisy ML library output in docker logs
ENV PYTHONWARNINGS=ignore \
    TF_CPP_MIN_LOG_LEVEL=3 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

# Create non-root user for runtime
RUN groupadd -r stirling && useradd -r -g stirling -d /app -s /sbin/nologin stirling
RUN chown -R stirling:stirling /app /data /tmp/workspace /opt/venv

# Entrypoint fixes volume permissions then drops to stirling via gosu
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 1349

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:1349/api/v1/health || exit 1

# tini as PID 1 for zombie reaping + signal forwarding
ENTRYPOINT ["tini", "--", "entrypoint.sh"]
CMD ["npx", "tsx", "apps/api/src/index.ts"]
