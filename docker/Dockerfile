# syntax=docker/dockerfile:1
# ============================================
# ashim - Unified Production Dockerfile
# Single image: GPU auto-detected on amd64, CPU on arm64
# ============================================

# ============================================
# Stage 1: Build the frontend (Vite + React)
# ============================================
# Run on the native build platform to avoid QEMU crashes with esbuild on
# Apple Silicon.  The output (HTML/CSS/JS) is architecture-agnostic so it
# is safe to build on arm64 and copy into the amd64 production layer.
FROM --platform=$BUILDPLATFORM node:22-bookworm AS builder

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

# Copy only frontend-relevant source (API/Python changes don't bust this cache)
COPY packages/shared/src ./packages/shared/src
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public

# Build only the web frontend (API runs from TS source via tsx)
RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    pnpm --filter @ashim/web build

# ============================================
# Stage 2: Build caire (content-aware resize)
# ============================================
# Run the Go toolchain on the native build platform to avoid QEMU crashes
# on Apple Silicon when cross-compiling for linux/amd64.
# caire imports gioui.org/app which requires CGO on Linux, so we use a
# proper C cross-compiler instead of CGO_ENABLED=0.
FROM --platform=$BUILDPLATFORM golang:1.23-bookworm AS caire-builder

ARG TARGETOS=linux
ARG TARGETARCH

# Install graphics libs and (for cross-arch builds) the appropriate C cross-compiler.
# Debian multi-arch lets us install target-arch headers alongside the native toolchain.
RUN set -e; \
    NATIVE=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/'); \
    if [ "$TARGETARCH" = "$NATIVE" ]; then \
        apt-get update && apt-get install -y --no-install-recommends \
            libwayland-dev libx11-dev libx11-xcb-dev libxkbcommon-x11-dev \
            libgles2-mesa-dev libegl1-mesa-dev libffi-dev libxcursor-dev \
            libxrandr-dev libxinerama-dev libxi-dev libxxf86vm-dev \
            libvulkan-dev libxfixes-dev pkg-config \
        && rm -rf /var/lib/apt/lists/*; \
    elif [ "$TARGETARCH" = "amd64" ]; then \
        dpkg --add-architecture amd64 && \
        apt-get update && apt-get install -y --no-install-recommends \
            crossbuild-essential-amd64 \
            libwayland-dev:amd64 libx11-dev:amd64 libx11-xcb-dev:amd64 \
            libxkbcommon-x11-dev:amd64 libgles2-mesa-dev:amd64 libegl1-mesa-dev:amd64 \
            libffi-dev:amd64 libxcursor-dev:amd64 libxrandr-dev:amd64 \
            libxinerama-dev:amd64 libxi-dev:amd64 libxxf86vm-dev:amd64 \
            libvulkan-dev:amd64 libxfixes-dev:amd64 pkg-config \
        && rm -rf /var/lib/apt/lists/*; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        dpkg --add-architecture arm64 && \
        apt-get update && apt-get install -y --no-install-recommends \
            crossbuild-essential-arm64 \
            libwayland-dev:arm64 libx11-dev:arm64 libx11-xcb-dev:arm64 \
            libxkbcommon-x11-dev:arm64 libgles2-mesa-dev:arm64 libegl1-mesa-dev:arm64 \
            libffi-dev:arm64 libxcursor-dev:arm64 libxrandr-dev:arm64 \
            libxinerama-dev:arm64 libxi-dev:arm64 libxxf86vm-dev:arm64 \
            libvulkan-dev:arm64 libxfixes-dev:arm64 pkg-config \
        && rm -rf /var/lib/apt/lists/*; \
    fi

# Build caire and stage to /tmp/caire (stable path for the COPY below).
# Cross-compiled CGO binaries land in $GOPATH/bin/${GOOS}_${GOARCH}/ not $GOPATH/bin/.
RUN set -e; \
    NATIVE=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/'); \
    if [ "$TARGETARCH" = "$NATIVE" ]; then \
        go install github.com/esimov/caire/cmd/caire@v1.5.0 && \
        cp /go/bin/caire /tmp/caire; \
    elif [ "$TARGETARCH" = "amd64" ]; then \
        CC=x86_64-linux-gnu-gcc \
        PKG_CONFIG_LIBDIR=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig \
        CGO_ENABLED=1 GOOS=$TARGETOS GOARCH=$TARGETARCH \
            go install github.com/esimov/caire/cmd/caire@v1.5.0 && \
        cp /go/bin/${TARGETOS}_${TARGETARCH}/caire /tmp/caire; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        CC=aarch64-linux-gnu-gcc \
        PKG_CONFIG_LIBDIR=/usr/lib/aarch64-linux-gnu/pkgconfig:/usr/share/pkgconfig \
        CGO_ENABLED=1 GOOS=$TARGETOS GOARCH=$TARGETARCH \
            go install github.com/esimov/caire/cmd/caire@v1.5.0 && \
        cp /go/bin/${TARGETOS}_${TARGETARCH}/caire /tmp/caire; \
    fi

# ============================================
# Stage 3: Platform-specific base images
# Pin tags to specific major.minor for reproducible builds.
# ============================================
FROM node:22-bookworm AS base-linux-arm64
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04 AS base-linux-amd64

# Node.js donor: provides Node binaries for the CUDA amd64 image without
# relying on NodeSource apt repos or Ubuntu mirrors (which are flaky on CI).
FROM node:22-bookworm AS node-bins

# ============================================
# Stage 4: Production runtime
# ============================================
ARG TARGETOS
ARG TARGETARCH
FROM base-${TARGETOS}-${TARGETARCH} AS production

ARG TARGETARCH

# Pin corepack's cache to a system-wide path so all users share the same pnpm
# binary without downloading it on each container start.
ENV COREPACK_HOME=/usr/local/share/corepack

# Install Node.js on amd64 by copying from the official node image.
# This avoids flaky Ubuntu/NodeSource apt mirrors that frequently fail on CI.
COPY --from=node-bins /usr/local/bin/node /usr/local/bin/
COPY --from=node-bins /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack && \
    ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate && \
    chmod -R a+rX /usr/local/share/corepack

# System dependencies (all platforms)
# Split into runtime deps and build deps to minimize final image size.
# Retry apt-get update with backoff — Ubuntu mirrors can be flaky on CI runners
RUN for i in 1 2 3; do apt-get -o Acquire::Retries=3 update && break || sleep $((i * 15)); done && \
    apt-get install -y --no-install-recommends \
    tini \
    imagemagick \
    libraw-dev \
    potrace \
    curl \
    gosu \
    libheif-examples \
    libimage-exiftool-perl \
    python3 python3-pip python3-venv python3-dev \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa \
    tesseract-ocr-chi-sim tesseract-ocr-jpn tesseract-ocr-kor \
    gcc g++ \
    libgl1 libglib2.0-0 \
    libegl1 libwayland-egl1 libwayland-client0 libwayland-cursor0 \
    libxkbcommon-x11-0 libxkbcommon0 libxcursor1 \
    && if apt-cache show libheif-plugin-x265 >/dev/null 2>&1; then \
         apt-get install -y --no-install-recommends libheif-plugin-x265; \
       fi \
    && if apt-cache show libcublas-12-6 >/dev/null 2>&1; then \
         apt-get install -y --no-install-recommends libcublas-12-6; \
       fi \
    && rm -rf /var/lib/apt/lists/*

# Caire binary (content-aware seam carving)
COPY --from=caire-builder /tmp/caire /usr/local/bin/caire

# Python venv - Base packages (rarely change, cached aggressively)
# Uses pre-built manylinux wheels where available; gcc/g++ above covers the rest.
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install \
        Pillow==11.1.0 \
        numpy==1.26.4 \
        opencv-python-headless==4.10.0.84

# On-demand AI feature installer and manifest
COPY docker/feature-manifest.json /app/docker/feature-manifest.json
COPY packages/ai/python/install_feature.py /app/packages/ai/python/install_feature.py

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
RUN mkdir -p /data /data/files /data/ai/models /data/ai/pip-cache /tmp/workspace

# Environment defaults
ENV PORT=1349 \
    NODE_ENV=production \
    STORAGE_MODE=local \
    DB_PATH=/data/ashim.db \
    WORKSPACE_PATH=/tmp/workspace \
    FILES_STORAGE_PATH=/data/files \
    PYTHON_VENV_PATH=/data/ai/venv \
    MODELS_PATH=/data/ai/models \
    DATA_DIR=/data \
    U2NET_HOME=/data/ai/models/rembg \
    DEFAULT_THEME=light \
    DEFAULT_LOCALE=en \
    APP_NAME="ashim" \
    FILE_MAX_AGE_HOURS=72 \
    CLEANUP_INTERVAL_MINUTES=60 \
    MAX_UPLOAD_SIZE_MB=0 \
    MAX_BATCH_SIZE=0 \
    CONCURRENT_JOBS=0 \
    MAX_MEGAPIXELS=0 \
    RATE_LIMIT_PER_MIN=0 \
    MAX_USERS=0 \
    MAX_WORKER_THREADS=0 \
    PROCESSING_TIMEOUT_S=0 \
    MAX_PIPELINE_STEPS=0 \
    MAX_CANVAS_PIXELS=0 \
    MAX_SVG_SIZE_MB=0 \
    MAX_LOGO_SIZE_KB=2048 \
    MAX_SPLIT_GRID=100 \
    MAX_PDF_PAGES=0 \
    SESSION_DURATION_HOURS=168 \
    LOGIN_ATTEMPT_LIMIT=10 \
    LOG_LEVEL=info \
    TRUST_PROXY=true

# NVIDIA Container Toolkit env vars (harmless on non-GPU systems)
ENV NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Suppress noisy ML library output in docker logs
ENV PYTHONWARNINGS=default \
    TF_CPP_MIN_LOG_LEVEL=3 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

# Create non-root user for runtime
RUN groupadd -r ashim && useradd -r -g ashim -d /app -s /sbin/nologin ashim
RUN chown -R ashim:ashim /app /data /tmp/workspace /opt/venv

# Entrypoint fixes volume permissions then drops to ashim via gosu
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 1349

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:1349/api/v1/health || exit 1

# tini as PID 1 for zombie reaping + signal forwarding
ENTRYPOINT ["tini", "--", "entrypoint.sh"]
CMD ["pnpm", "--filter", "@ashim/api", "run", "start"]
