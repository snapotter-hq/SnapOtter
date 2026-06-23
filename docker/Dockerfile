# syntax=docker/dockerfile:1
# ============================================
# SnapOtter - Unified Production Dockerfile
# Single image: GPU auto-detected on amd64, CPU on arm64
# ============================================

# ============================================
# Stage 0: Static FFmpeg/FFprobe binaries
# ============================================
# Multi-arch (amd64 + arm64) static builds for video/audio processing.
FROM mwader/static-ffmpeg:8.1.2 AS ffmpeg

# ============================================
# Stage 0b: Static pdfcpu binary (pure Go, no CGO)
# ============================================
# CGO_ENABLED=0 produces a fully static binary; no cross-compiler needed.
FROM --platform=$BUILDPLATFORM golang:1.25-bookworm@sha256:a1ae6b6c564f3e0072d70081036827a2705dbcf6b38aaa6d97f5de97fe9abdb4 AS pdfcpu-builder
ARG TARGETOS=linux
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go install github.com/pdfcpu/pdfcpu/cmd/pdfcpu@v0.13.0 \
    && cp "$(find /go/bin -type f -name pdfcpu | head -1)" /tmp/pdfcpu

# ============================================
# Stage 1: Build the frontend (Vite + React)
# ============================================
# Run on the native build platform to avoid QEMU crashes with esbuild on
# Apple Silicon.  The output (HTML/CSS/JS) is architecture-agnostic so it
# is safe to build on arm64 and copy into the amd64 production layer.
FROM --platform=$BUILDPLATFORM node:22-bookworm@sha256:e0d149b4727ac0c20d9774e801e423d7a946a0bffced886f42cfe9cd3c67820a AS builder

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
COPY packages/media-engine/package.json packages/media-engine/tsconfig.json ./packages/media-engine/
COPY packages/doc-engine/package.json packages/doc-engine/tsconfig.json ./packages/doc-engine/
COPY packages/ai/package.json packages/ai/tsconfig.json ./packages/ai/

# pnpm patchedDependencies (package.json) needs the patch files present before
# install, or `pnpm install` aborts with ENOENT on the patch.
COPY patches/ ./patches/

# Install ALL dependencies (dev + prod needed for building)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store/v3 \
    pnpm install --frozen-lockfile

# Copy only frontend-relevant source (API/Python changes don't bust this cache)
COPY packages/shared/src ./packages/shared/src
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public

# Build only the web frontend (API runs from TS source via tsx)
RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    pnpm --filter @snapotter/web build

# ============================================
# Stage 2: Build caire (content-aware resize)
# ============================================
# Run the Go toolchain on the native build platform to avoid QEMU crashes
# on Apple Silicon when cross-compiling for linux/amd64.
# caire imports gioui.org/app which requires CGO on Linux, so we use a
# proper C cross-compiler instead of CGO_ENABLED=0.
FROM --platform=$BUILDPLATFORM golang:1.25-bookworm@sha256:a1ae6b6c564f3e0072d70081036827a2705dbcf6b38aaa6d97f5de97fe9abdb4 AS caire-builder

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
# Stage 2b: Build libheif (HEIC/HEIF tools)
# ============================================
# Distro packages ship libheif 1.15-1.17 which cannot decode iPhone HEIC
# files with multiple auxiliary images (depth maps, HDR gain maps).
# Build libheif >= 1.19 from source for the fix (GitHub #183).
# Base images match production to avoid shared-library ABI mismatches.
FROM debian:bookworm@sha256:49ba348354a28e39c70beffd6cf43bdb8d55d81ce4b746b0428717d054b8bbc4 AS libheif-base-arm64
FROM ubuntu:24.04@sha256:786a8b558f7be160c6c8c4a54f9a57274f3b4fb1491cf65146521ae77ff1dc54 AS libheif-base-amd64

ARG TARGETARCH
FROM libheif-base-${TARGETARCH} AS libheif-builder

ARG LIBHEIF_VERSION=1.21.2

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake pkg-config gcc g++ make curl ca-certificates \
    libde265-dev libx265-dev libjpeg-dev libpng-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL --retry 3 --retry-delay 5 "https://github.com/strukturag/libheif/releases/download/v${LIBHEIF_VERSION}/libheif-${LIBHEIF_VERSION}.tar.gz" \
      | tar xz \
    && cmake -B build -S "libheif-${LIBHEIF_VERSION}" \
      -DCMAKE_INSTALL_PREFIX=/opt/libheif \
      -DWITH_EXAMPLES=ON \
      -DWITH_GDK_PIXBUF=OFF \
      -DWITH_AOM_DECODER=OFF \
      -DWITH_AOM_ENCODER=OFF \
      -DWITH_DAV1D=OFF \
    && cmake --build build -j$(nproc) \
    && cmake --install build

# ============================================
# Stage 3: Platform-specific base images
# Pin tags to specific major.minor for reproducible builds.
# ============================================
FROM node:22-bookworm@sha256:e0d149b4727ac0c20d9774e801e423d7a946a0bffced886f42cfe9cd3c67820a AS base-linux-arm64
# CUDA base must match the AI bundles' wheels (torch/paddle/onnxruntime-gpu are all
# cu126) and the libcublas-12-6 install below. It also sets the NVIDIA_REQUIRE_CUDA
# driver gate enforced by nvidia-container-toolkit at container start: a 12.6 base
# needs driver R560+, vs 12.9 which needs R575+ and fails to start on common
# production drivers (e.g. 570.x / CUDA 12.8). Keep this at 12.6.x.
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04@sha256:8aef630a54bc5c5146ae5ce68e6af5caa3df0fb690bb91544175c91f307e4356 AS base-linux-amd64

# Node.js donor: provides Node binaries for the CUDA amd64 image without
# relying on NodeSource apt repos or Ubuntu mirrors (which are flaky on CI).
FROM node:22-bookworm@sha256:e0d149b4727ac0c20d9774e801e423d7a946a0bffced886f42cfe9cd3c67820a AS node-bins

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
# `apt-get upgrade` pulls security patches for base-image packages (e.g.
# libgnutls30t64, libgcrypt20, liblzma5) that the pinned base digest ships at an
# outdated patch level -- closes the Trivy OS-package CVEs on every rebuild.
RUN for i in 1 2 3; do apt-get -o Acquire::Retries=3 update && break || sleep $((i * 15)); done && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    tini \
    imagemagick \
    libjxl-tools \
    libraw-dev libraw-bin \
    libopenexr-dev \
    potrace \
    ghostscript \
    libopenjp2-tools \
    curl \
    gosu \
    libde265-0 \
    libimage-exiftool-perl \
    python3 python3-pip python3-venv python3-dev \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa \
    tesseract-ocr-chi-sim tesseract-ocr-jpn tesseract-ocr-kor \
    # Document engine: qpdf + LibreOffice headless + pandoc + WeasyPrint runtime deps
    # calibre deferred (5.2 GB ruling; pandoc covers epub/markdown families)
    pandoc \
    qpdf \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    fonts-dejavu-core \
    libreoffice-calc libreoffice-impress libreoffice-writer \
    gcc g++ \
    libgl1 libglib2.0-0 libgles2 \
    libegl1 libwayland-egl1 libwayland-client0 libwayland-cursor0 \
    libxkbcommon-x11-0 libxkbcommon0 libxcursor1 \
    && if apt-cache show libmagickcore-6.q16-7-extra >/dev/null 2>&1; then \
         apt-get install -y --no-install-recommends libmagickcore-6.q16-7-extra; \
       elif apt-cache show libmagickcore-6.q16-6-extra >/dev/null 2>&1; then \
         apt-get install -y --no-install-recommends libmagickcore-6.q16-6-extra; \
       fi \
    && if apt-cache show libx265-199 >/dev/null 2>&1; then \
         apt-get install -y --no-install-recommends libx265-199; \
       elif apt-cache show libx265-209 >/dev/null 2>&1; then \
         apt-get install -y --no-install-recommends libx265-209; \
       fi \
    && if apt-cache show libcublas-12-6 >/dev/null 2>&1; then \
         apt-get install -y --no-install-recommends libcublas-12-6; \
       fi \
    && rm -rf /var/lib/apt/lists/*

# Allow ImageMagick to use Ghostscript delegate for EPS (read for decode,
# write for the convert tool's EPS output). PS/PDF/XPS stay read-only.
RUN POLICY_FILE=$(find /etc/ImageMagick* -name policy.xml 2>/dev/null | head -1) && \
    if [ -n "$POLICY_FILE" ]; then \
      sed -i 's/<policy domain="coder" rights="none" pattern="EPS"/<policy domain="coder" rights="read|write" pattern="EPS"/' "$POLICY_FILE" && \
      sed -i 's/<policy domain="coder" rights="none" pattern="PS"/<policy domain="coder" rights="read" pattern="PS"/' "$POLICY_FILE" && \
      sed -i 's/<policy domain="coder" rights="none" pattern="PDF"/<policy domain="coder" rights="read" pattern="PDF"/' "$POLICY_FILE" && \
      sed -i 's/<policy domain="coder" rights="none" pattern="XPS"/<policy domain="coder" rights="read" pattern="XPS"/' "$POLICY_FILE"; \
    fi

# Caire binary (content-aware seam carving)
COPY --from=caire-builder /tmp/caire /usr/local/bin/caire

# FFmpeg + FFprobe static binaries (video/audio engine)
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe

# pdfcpu static binary (PDF layout: crop, n-up, booklet, stamps)
COPY --from=pdfcpu-builder /tmp/pdfcpu /usr/local/bin/pdfcpu

# libheif tools (heif-convert, heif-dec, heif-enc) built from source.
# LD_LIBRARY_PATH ensures our custom 1.21.2 libs take precedence over distro libheif1.
COPY --from=libheif-builder /opt/libheif/bin/ /usr/local/bin/
COPY --from=libheif-builder /opt/libheif/lib/ /usr/local/lib/
ENV LD_LIBRARY_PATH=/usr/local/lib
RUN ldconfig

# Python venv - Base packages (rarely change, cached aggressively)
# Uses pre-built manylinux wheels where available; gcc/g++ above covers the rest.
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade "pip==26.1.2" && \
    /opt/venv/bin/pip install wheel setuptools && \
    /opt/venv/bin/pip install \
        Pillow==12.2.0 \
        numpy==1.26.4 \
        opencv-python-headless==4.10.0.84 \
        pikepdf==10.8.0 \
        PyMuPDF==1.27.2.3 \
        weasyprint==69.0 \
        pdf2docx==0.5.13 \
        markdown==3.10.2

# Stamp the venv so the entrypoint can detect base-package upgrades.
# If the frozen package list changes, the hash changes, and containers
# with a stale /data/ai/venv will get a fresh copy on next start.
RUN /opt/venv/bin/pip freeze | sha256sum | cut -d' ' -f1 > /opt/venv/.venv-version

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
COPY packages/media-engine/package.json packages/media-engine/tsconfig.json ./packages/media-engine/
COPY packages/doc-engine/package.json packages/doc-engine/tsconfig.json ./packages/doc-engine/
COPY packages/ai/package.json packages/ai/tsconfig.json ./packages/ai/

# pnpm patchedDependencies (package.json) needs the patch files present before
# install, or `pnpm install` aborts with ENOENT on the patch.
COPY patches/ ./patches/

# Install production dependencies (tsx is now in prod deps)
# Skip the root prepare script (husky is a devDep, not available in prod)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store/v3 \
    npm pkg delete scripts.prepare && \
    pnpm install --frozen-lockfile --prod

# Install Playwright Chromium for HTML-to-Image tool.
# PLAYWRIGHT_BROWSERS_PATH puts browsers in a shared location so the
# non-root snapotter user can find and execute them at runtime.
# Use the workspace's pinned Playwright (not `npx playwright`, which fetches a
# NEWER version and installs a chromium build the runtime playwright cannot
# resolve) so the installed browser matches chromium.executablePath().
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN pnpm --filter @snapotter/api exec playwright install chromium --with-deps && \
    chmod -R a+rX /opt/playwright-browsers && \
    rm -rf /tmp/*

# Copy source code for API (tsx runs TS directly - no build step needed)
COPY apps/api/src ./apps/api/src
COPY apps/api/drizzle ./apps/api/drizzle
COPY apps/api/static ./apps/api/static

# Copy workspace packages source (referenced by API at runtime)
COPY packages/shared/src ./packages/shared/src
COPY packages/image-engine/src ./packages/image-engine/src
COPY packages/media-engine/src ./packages/media-engine/src
COPY packages/doc-engine/src ./packages/doc-engine/src
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
    WORKSPACE_PATH=/tmp/workspace \
    FILES_STORAGE_PATH=/data/files \
    PYTHON_VENV_PATH=/data/ai/venv \
    MODELS_PATH=/data/ai/models \
    DATA_DIR=/data \
    U2NET_HOME=/data/ai/models/rembg \
    DEFAULT_THEME=light \
    DEFAULT_LOCALE=en \
    DEFAULT_TOOL_VIEW=sidebar \
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
    MAX_PIPELINE_STEPS=20 \
    MAX_CANVAS_PIXELS=0 \
    MAX_SVG_SIZE_MB=50 \
    MAX_SPLIT_GRID=100 \
    MAX_PDF_PAGES=0 \
    SESSION_DURATION_HOURS=168 \
    LOGIN_ATTEMPT_LIMIT=30 \
    LOG_LEVEL=info \
    LOG_DIR=/data/logs \
    TRUST_PROXY=true \
    OIDC_ENABLED=false \
    EXTERNAL_URL=

# COOKIE_SECRET is intentionally not baked in: the app auto-generates and persists one
# on first boot if unset (see apps/api/src/index.ts). Override via runtime env to pin it.

# NVIDIA Container Toolkit env vars (harmless on non-GPU systems)
ENV NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Suppress noisy ML library output in docker logs
ENV PYTHONWARNINGS=default \
    TF_CPP_MIN_LOG_LEVEL=3 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

# Create non-root user for runtime
RUN groupadd -r snapotter && useradd -r -g snapotter -d /app -s /sbin/nologin snapotter
# /app and /opt/venv are read-only at runtime -> owned by snapotter.
# /data and /tmp/workspace are written at runtime: make them group-0 (root group)
# owned and group-writable with the setgid bit so the app can still write when the
# container is launched under an arbitrary/foreign UID (Kubernetes runAsUser,
# OpenShift, TrueNAS), which always lands in the root (GID 0) supplementary group.
# The root entrypoint re-chowns these to snapotter for the default gosu path.
RUN chown -R snapotter:snapotter /app /opt/venv && \
    chmod -R a+rX /opt/venv && \
    chown -R snapotter:0 /data /tmp/workspace && \
    chmod -R g+rwX /data /tmp/workspace && \
    find /data /tmp/workspace -type d -exec chmod g+s {} +

# Entrypoint fixes volume permissions then drops to snapotter via gosu.
# entrypoint-lib.sh holds the writability helpers it sources at startup.
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/entrypoint-lib.sh /usr/local/bin/entrypoint-lib.sh
COPY docker/wait-for-postgres.mjs /app/docker/wait-for-postgres.mjs
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 1349

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -sf --max-time 5 http://localhost:1349/api/v1/health || exit 1

# tini as PID 1 for zombie reaping + signal forwarding
ENTRYPOINT ["tini", "--", "entrypoint.sh"]
CMD ["pnpm", "--filter", "@snapotter/api", "run", "start"]
