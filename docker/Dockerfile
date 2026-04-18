# syntax=docker/dockerfile:1
# ============================================
# ashim - Unified Production Dockerfile
# Tags: latest (cpu, amd64+arm64)  |  latest-cuda (NVIDIA)  |  latest-rocm (AMD)
# Build arg GPU_BACKEND=cpu|cuda|rocm controls GPU acceleration package set.
# Models are NOT baked in by default — downloaded on first container start.
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

# Copy source code
COPY . .

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
# ============================================
FROM node:22-bookworm AS base-linux-arm64
# amd64 uses a plain Ubuntu base for all variants (cpu/cuda/rocm).
# GPU libs are injected at runtime by the NVIDIA Container Toolkit or ROCm
# device plugin — no CUDA/ROCm base image required.
FROM ubuntu:24.04 AS base-linux-amd64

# Node.js donor: provides Node binaries for the amd64 image without
# relying on NodeSource apt repos or Ubuntu mirrors (which are flaky on CI).
FROM node:22-bookworm AS node-bins

# ============================================
# Stage 4: Production runtime
# ============================================
ARG TARGETOS
ARG TARGETARCH
FROM base-${TARGETOS}-${TARGETARCH} AS production

ARG TARGETARCH
# GPU acceleration backend: cpu (default) | cuda (NVIDIA) | rocm (AMD)
ARG GPU_BACKEND=cpu
# Set to "true" to bake models into the image at build time (large image, instant start).
# Default false: models download on first container start into a persistent volume.
ARG BAKE_MODELS=false
# Set to "true" in CI to skip model operations entirely (just test image structure).
ARG SKIP_MODEL_DOWNLOADS=false

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
    build-essential \
    libgl1 libglib2.0-0 \
    libegl1 libwayland-egl1 libwayland-client0 libwayland-cursor0 \
    libxkbcommon-x11-0 libxkbcommon0 libxcursor1 \
    && rm -rf /var/lib/apt/lists/*

# Caire binary (content-aware seam carving)
COPY --from=caire-builder /tmp/caire /usr/local/bin/caire

# Python venv - Layer 1: Base packages (rarely change, ~3 GB)
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install \
        Pillow==11.1.0 \
        numpy==1.26.4 \
        opencv-python-headless==4.10.0.84

# GPU-backend-conditional ONNX runtime
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "$GPU_BACKEND" = "cuda" ]; then \
        /opt/venv/bin/pip install onnxruntime-gpu==1.20.1; \
    elif [ "$GPU_BACKEND" = "rocm" ]; then \
        /opt/venv/bin/pip install onnxruntime-rocm==1.20.0; \
    else \
        /opt/venv/bin/pip install onnxruntime==1.20.1; \
    fi

# GPU-backend-conditional tool packages (~2 GB)
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "$GPU_BACKEND" = "cuda" ]; then \
        /opt/venv/bin/pip install rembg==2.0.62 && \
        /opt/venv/bin/pip install realesrgan==0.3.0 \
            --extra-index-url https://download.pytorch.org/whl/cu126 && \
        /opt/venv/bin/pip install "paddlepaddle-gpu>=3.2.1" \
            --extra-index-url https://www.paddlepaddle.org.cn/packages/stable/cu126/ && \
        /opt/venv/bin/pip install "paddleocr[doc-parser]>=3.4.0,<3.5.0"; \
    elif [ "$GPU_BACKEND" = "rocm" ]; then \
        /opt/venv/bin/pip install rembg==2.0.62 && \
        /opt/venv/bin/pip install realesrgan==0.3.0 \
            --extra-index-url https://download.pytorch.org/whl/rocm6.3 && \
        /opt/venv/bin/pip install paddlepaddle==3.0.0 "paddleocr[doc-parser]>=3.4.0,<3.5.0"; \
    else \
        /opt/venv/bin/pip install "rembg[cpu]==2.0.62" && \
        /opt/venv/bin/pip install realesrgan==0.3.0 && \
        /opt/venv/bin/pip install paddlepaddle==3.0.0 "paddleocr[doc-parser]>=3.4.0,<3.5.0"; \
    fi

# mediapipe 0.10.21 only has amd64 wheels; arm64 maxes out at 0.10.18
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "$TARGETARCH" = "amd64" ]; then \
    /opt/venv/bin/pip install mediapipe==0.10.21 \
; else \
    /opt/venv/bin/pip install mediapipe==0.10.18 \
; fi

# CodeFormer face enhancement (install with --no-deps to avoid numpy 2.x conflict)
RUN --mount=type=cache,target=/root/.cache/pip \
    /opt/venv/bin/pip install --no-deps codeformer-pip==0.0.4 lpips

# Re-pin numpy to 1.26.4 in case any transitive dep upgraded it
RUN --mount=type=cache,target=/root/.cache/pip \
    /opt/venv/bin/pip install numpy==1.26.4

# Re-align NCCL to match torch's requirement (CUDA only). paddlepaddle-gpu pins
# an older nvidia-nccl-cu12 which silently downgrades the version installed by
# torch, causing "undefined symbol: ncclCommShrink" at import time.
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "$GPU_BACKEND" = "cuda" ]; then \
        /opt/venv/bin/pip install $(/opt/venv/bin/python3 -c \
            "from importlib.metadata import requires; \
             print([r.split(';')[0].strip() for r in requires('torch') \
                    if 'nccl' in r][0])"); \
    fi

# Pin rembg model storage to a fixed path so models downloaded at build time
# (as root) are found at runtime (as the non-root ashim user, home=/app).
# Without this, rembg defaults to ~/.u2net which differs between users.
ENV U2NET_HOME=/opt/models/rembg

# Pre-download and verify all ML models
# Note: on amd64, paddlepaddle-gpu can't import without the CUDA driver (only
# available at runtime). The download script gracefully skips PaddleOCR model
# pre-download in this case; models download on first use at runtime instead.
# In CI (SKIP_MODEL_DOWNLOADS=true), skip downloads — the image structure is
# what matters for the build test; models are verified in integration tests.
# Keep download script in the image — used here when BAKE_MODELS=true and
# by entrypoint.sh on first container start when BAKE_MODELS=false (default).
COPY docker/download_models.py /opt/ashim/download_models.py
RUN if [ "$SKIP_MODEL_DOWNLOADS" = "true" ]; then \
        echo "Skipping model downloads (CI build)"; \
    elif [ "$BAKE_MODELS" = "true" ]; then \
        CUDA_VISIBLE_DEVICES="" /opt/venv/bin/python3 /opt/ashim/download_models.py && \
        touch /opt/models/.complete; \
    else \
        echo "BAKE_MODELS=false: models will download on first container start."; \
    fi && \
    # Symlink PaddleX model dir into both possible HOME locations so models are
    # found regardless of whether HOME=/root (build/root context) or HOME=/app
    # (runtime ashim user via gosu). Without this PaddleX re-downloads on every
    # fresh container start.
    mkdir -p /opt/models/paddlex/official_models /root/.paddlex /app/.paddlex && \
    ln -sf /opt/models/paddlex/official_models /root/.paddlex/official_models && \
    ln -sf /opt/models/paddlex/official_models /app/.paddlex/official_models

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

# Create required directories (including /opt/models so chown works even when
# SKIP_MODEL_DOWNLOADS=true skips the download script that would create it)
RUN mkdir -p /data /data/files /tmp/workspace /opt/models

# Symlink facexlib models for codeformer-pip (expects gfpgan/weights/ relative to CWD)
RUN mkdir -p /app/gfpgan/weights/CodeFormer && \
    ln -sf /opt/models/gfpgan/facelib /app/gfpgan/weights/facelib && \
    ln -sf /opt/models/codeformer/codeformer.pth /app/gfpgan/weights/CodeFormer/codeformer.pth

# Environment defaults
ENV PORT=1349 \
    NODE_ENV=production \
    STORAGE_MODE=local \
    DB_PATH=/data/ashim.db \
    WORKSPACE_PATH=/tmp/workspace \
    FILES_STORAGE_PATH=/data/files \
    PYTHON_VENV_PATH=/opt/venv \
    DEFAULT_THEME=light \
    DEFAULT_LOCALE=en \
    APP_NAME="ashim" \
    FILE_MAX_AGE_HOURS=24 \
    CLEANUP_INTERVAL_MINUTES=30 \
    MAX_UPLOAD_SIZE_MB=100 \
    MAX_BATCH_SIZE=200 \
    CONCURRENT_JOBS=3 \
    MAX_MEGAPIXELS=100 \
    RATE_LIMIT_PER_MIN=100 \
    LOG_LEVEL=debug

# NVIDIA Container Toolkit env vars (harmless on non-GPU systems)
ENV NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Suppress noisy ML library output in docker logs
ENV PYTHONWARNINGS=default \
    TF_CPP_MIN_LOG_LEVEL=3 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

# Create non-root user for runtime
RUN groupadd -r ashim && useradd -r -g ashim -d /app -s /sbin/nologin ashim
RUN chown -R ashim:ashim /app /data /tmp/workspace /opt/venv /opt/models

# Entrypoint fixes volume permissions then drops to ashim via gosu
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 1349

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:1349/api/v1/health || exit 1

# tini as PID 1 for zombie reaping + signal forwarding
ENTRYPOINT ["tini", "--", "entrypoint.sh"]
CMD ["pnpm", "--filter", "@ashim/api", "run", "start"]
