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
FROM --platform=$BUILDPLATFORM node:22-bookworm@sha256:c601a46abb4d2ab80a9dc3da208d50d1122642d53f17a101926ace71e5a9bf1c AS builder

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

# Bake analytics config into the shared package before building the frontend.
# The published image ships with analytics ON; self-builders can override:
#   docker compose build --build-arg SNAPOTTER_ANALYTICS=off
# The real Sentry DSN + PostHog browser config are supplied as build args (public values,
# sourced from CI secrets in the official build); a build without them stays
# silent, so building from source never phones home.
ARG SNAPOTTER_ANALYTICS=on
ARG SNAPOTTER_POSTHOG_PROJECT_ID=
ARG SNAPOTTER_SENTRY_DSN=
ARG SNAPOTTER_SENTRY_DSN_WEB=
COPY scripts/bake-analytics.mjs ./scripts/
RUN SNAPOTTER_POSTHOG_PROJECT_ID="${SNAPOTTER_POSTHOG_PROJECT_ID}" \
    SNAPOTTER_SENTRY_DSN="${SNAPOTTER_SENTRY_DSN}" \
    SNAPOTTER_SENTRY_DSN_WEB="${SNAPOTTER_SENTRY_DSN_WEB}" \
    node scripts/bake-analytics.mjs ${SNAPOTTER_ANALYTICS}

# Build only the web frontend (API runs from TS source via tsx). When a
# SENTRY_AUTH_TOKEN build secret is supplied (the published image build does),
# the Sentry Vite plugin uploads source maps for SENTRY_RELEASE; without it the
# plugin is a no-op and no maps are emitted.
ARG SENTRY_RELEASE=
RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    --mount=type=secret,id=sentry_auth_token,required=false \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    SENTRY_RELEASE="${SENTRY_RELEASE}" \
    VITE_SENTRY_RELEASE="${SENTRY_RELEASE}" \
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
FROM debian:bookworm@sha256:30482e873082e906a4908c10529180aefb6f77620aea7404b909829fadc5d168 AS libheif-base-arm64
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
FROM node:22-bookworm@sha256:c601a46abb4d2ab80a9dc3da208d50d1122642d53f17a101926ace71e5a9bf1c AS base-linux-arm64
# CUDA base must match the AI bundles' wheels (torch/paddle/onnxruntime-gpu are all
# cu126) and the libcublas-12-6 install below. It also sets the NVIDIA_REQUIRE_CUDA
# driver gate enforced by nvidia-container-toolkit at container start: a 12.6 base
# needs driver R560+, vs 12.9 which needs R575+ and fails to start on common
# production drivers (e.g. 570.x / CUDA 12.8). Keep this at 12.6.x.
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04@sha256:8aef630a54bc5c5146ae5ce68e6af5caa3df0fb690bb91544175c91f307e4356 AS base-linux-amd64

# Node.js donor: provides Node binaries for the CUDA amd64 image without
# relying on NodeSource apt repos or Ubuntu mirrors (which are flaky on CI).
FROM node:22-bookworm@sha256:c601a46abb4d2ab80a9dc3da208d50d1122642d53f17a101926ace71e5a9bf1c AS node-bins

# ============================================
# Stage 4: Production runtime
# ============================================
ARG TARGETOS
ARG TARGETARCH
FROM base-${TARGETOS}-${TARGETARCH} AS production

ARG TARGETARCH
ARG PANDOC_VERSION=3.10

# Pin corepack's cache during image build. It is removed after dependency and
# browser installation so pnpm is not part of the production runtime surface.
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
    xz-utils \
    libde265-0 \
    libimage-exiftool-perl \
    python3 python3-pip python3-venv python3-dev \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-spa \
    tesseract-ocr-chi-sim tesseract-ocr-jpn tesseract-ocr-kor \
    # Document engine: qpdf + LibreOffice headless + WeasyPrint runtime deps
    # calibre deferred (5.2 GB ruling; pandoc covers epub/markdown families)
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
    && case "$TARGETARCH" in \
         amd64) PANDOC_ARCH=amd64 ;; \
         arm64) PANDOC_ARCH=arm64 ;; \
         *) echo "unsupported TARGETARCH=$TARGETARCH" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-1-${PANDOC_ARCH}.deb" -o /tmp/pandoc.deb \
    && apt-get install -y --no-install-recommends /tmp/pandoc.deb \
    && rm -f /tmp/pandoc.deb \
    && pandoc --version \
    && rm -rf /var/lib/apt/lists/*

# Embedded-mode databases: PostgreSQL 17 (PGDG) + Redis 8 (packages.redis.io),
# each pinned to the same major the Compose stack runs (postgres:17 / redis:8)
# so embedded and external deployments behave identically and data hands off
# cleanly. Distro repos would silently downgrade Redis to 7.x. Shipped in every
# image (single tag); unused in external/Compose mode, ~tens of MB against the
# multi-GB base. They enter the Trivy CVE surface and ride the existing
# apt-get upgrade patching.
RUN install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
         -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && curl -fsSL https://packages.redis.io/gpg \
         -o /usr/share/keyrings/redis-archive-keyring.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.asc] https://packages.redis.io/deb ${VERSION_CODENAME} main" \
         > /etc/apt/sources.list.d/redis.list \
    && for i in 1 2 3; do apt-get -o Acquire::Retries=3 update && break || sleep $((i * 15)); done \
    && apt-get install -y --no-install-recommends postgresql-17 postgresql-client-17 redis-server \
    && redis-server --version | grep -q 'v=8\.' \
    && rm -f /etc/ssl/private/ssl-cert-snakeoil.key /etc/ssl/certs/ssl-cert-snakeoil.pem \
    && rm -rf /var/lib/apt/lists/*

# s6-overlay supervises the embedded service tree (postgres + redis + app).
# Pinned and checksum-verified against the upstream-published .sha256, consistent
# with the repo's digest-pinning posture. For stricter supply-chain pinning,
# replace the .sha256 fetch with a literal hash checked via
# `echo "<hash>  <file>" | sha256sum -c -`.
ARG S6_OVERLAY_VERSION=3.2.0.2
RUN set -e; \
    case "$TARGETARCH" in \
      amd64) S6_ARCH=x86_64 ;; \
      arm64) S6_ARCH=aarch64 ;; \
      *) echo "unsupported TARGETARCH=$TARGETARCH" >&2; exit 1 ;; \
    esac; \
    cd /tmp; \
    base="https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}"; \
    for f in "s6-overlay-noarch.tar.xz" "s6-overlay-${S6_ARCH}.tar.xz"; do \
      curl -fsSL -O "${base}/${f}"; \
      curl -fsSL -O "${base}/${f}.sha256"; \
      sha256sum -c "${f}.sha256"; \
      tar -C / -Jxpf "${f}"; \
    done; \
    rm -f /tmp/s6-overlay-*

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
    SITE_PACKAGES=$(/opt/venv/bin/python -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])') && \
    /opt/venv/bin/pip install --upgrade "pip==26.1.2" && \
    /opt/venv/bin/pip install --upgrade "wheel==0.47.0" "setuptools==78.1.1" "jaraco.context==6.1.0" && \
    /opt/venv/bin/pip install \
        Pillow==12.2.0 \
        numpy==1.26.4 \
        opencv-python-headless==4.10.0.84 \
        "huggingface-hub[hf_xet,hf_transfer]==0.36.2" \
        pikepdf==10.8.0 \
        PyMuPDF==1.27.2.3 \
        weasyprint==69.0 \
        pdf2docx==0.5.13 \
        markdown==3.10.2 && \
    # Trivy scans setuptools' vendored dist-info metadata, so replace the
    # vulnerable vendored copies with the fixed packages pinned above.
    rm -rf "$SITE_PACKAGES/setuptools/_vendor/wheel" \
        "$SITE_PACKAGES"/setuptools/_vendor/wheel-*.dist-info \
        "$SITE_PACKAGES/setuptools/_vendor/jaraco/context.py" \
        "$SITE_PACKAGES/setuptools/_vendor/jaraco/context" \
        "$SITE_PACKAGES"/setuptools/_vendor/jaraco.context-*.dist-info \
        "$SITE_PACKAGES"/setuptools/_vendor/jaraco_context-*.dist-info && \
    cp -a "$SITE_PACKAGES/wheel" "$SITE_PACKAGES/setuptools/_vendor/wheel" && \
    cp -a "$SITE_PACKAGES"/wheel-0.47.0.dist-info "$SITE_PACKAGES/setuptools/_vendor/" && \
    cp -a "$SITE_PACKAGES/jaraco/context" "$SITE_PACKAGES/setuptools/_vendor/jaraco/context" && \
    cp -a "$SITE_PACKAGES"/jaraco_context-6.1.0.dist-info "$SITE_PACKAGES/setuptools/_vendor/"

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
# packages/enterprise is required for ALL commercial features (license validation,
# SAML/SCIM/MFA gates, S3 storage, OTel tracing gate, GDPR/audit/SIEM routes).
# Without it, apps/api's `@snapotter/enterprise: workspace:*` link dangles and every
# `import("@snapotter/enterprise")` throws (silently caught) -> enterprise.active=false
# regardless of license. Manifest copied before install so pnpm wires the workspace link.
COPY packages/enterprise/package.json packages/enterprise/tsconfig.json ./packages/enterprise/

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

# Remove build-time package managers and native build headers from the runtime
# image after all dependency/browser installs are complete.
RUN apt-get purge -y --auto-remove \
        autotools-dev \
        dpkg-dev \
        gcc \
        g++ \
        python3-dev \
        libraw-dev \
        libopenexr-dev \
        libcurl4-openssl-dev \
        libdb-dev \
        libdb5.3-dev \
        libevent-dev \
        libffi-dev \
        libgcc-12-dev \
        libgmp-dev \
        liblzma-dev \
        libmaxminddb-dev \
        libwebp-dev \
        libyaml-dev \
        libc6-dev \
        linux-libc-dev \
        libpq-dev \
        libssl-dev \
        zlib1g-dev \
        uuid-dev \
        libcrypt-dev \
        libnsl-dev \
        libtirpc-dev \
        rpcsvc-proto \
    && (corepack disable pnpm || true) \
    && rm -rf /usr/local/share/corepack /root/.cache/node/corepack /root/.cache/pip \
    && rm -f /usr/local/bin/pnpm /usr/local/bin/pnpx \
    && rm -rf /var/lib/apt/lists/* /tmp/*

# Copy source code for API (tsx runs TS directly - no build step needed)
COPY apps/api/src ./apps/api/src
COPY apps/api/drizzle ./apps/api/drizzle
COPY apps/api/static ./apps/api/static

# Copy workspace packages source (referenced by API at runtime)
COPY packages/shared/src ./packages/shared/src
# The builder stage ran scripts/bake-analytics.mjs to bake the analytics config
# (driven by SNAPOTTER_ANALYTICS). The line above re-copies the committed baked.ts
# from the build context, which would clobber that bake and leave the API runtime
# with analytics permanently off -- so SNAPOTTER_ANALYTICS had no effect on the API
# (and, since the SPA reads /api/v1/config/analytics, no effect anywhere). Pull the
# baked version from the builder so the build arg actually controls runtime analytics.
COPY --from=builder /app/packages/shared/src/analytics/baked.ts ./packages/shared/src/analytics/baked.ts
COPY packages/image-engine/src ./packages/image-engine/src
COPY packages/media-engine/src ./packages/media-engine/src
COPY packages/doc-engine/src ./packages/doc-engine/src
COPY packages/ai/src ./packages/ai/src
COPY packages/ai/python ./packages/ai/python
COPY packages/enterprise/src ./packages/enterprise/src

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
    # Unlike its neighbors, this one is never 0/unlimited: it's the only
    # knob here that guards against an external attacker rather than just
    # limiting the owner's own usage, so the one-liner (no compose file to
    # harden it) needs a real, if generous, ceiling out of the box.
    RATE_LIMIT_PER_MIN=1000 \
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

# Sentry release for the API runtime, matching the source maps the web build
# uploaded. Empty for non-image builds, where the API falls back to APP_VERSION.
ARG SENTRY_RELEASE=
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

# COOKIE_SECRET is intentionally not baked in: the app auto-generates and persists one
# on first boot if unset (see apps/api/src/index.ts). Override via runtime env to pin it.

# NVIDIA Container Toolkit env vars (harmless on non-GPU systems)
ENV NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

# s6-overlay (embedded mode): propagate the runtime-exported environment (the
# 127.0.0.1 URLs, resolved _FILE secrets, auth defaults) into supervised
# services, and never time out waiting for first-boot readiness (initdb can take
# minutes). Inert in external mode, which never invokes s6.
ENV S6_KEEP_ENV=1 \
    S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0

# Suppress noisy ML library output in docker logs
ENV PYTHONWARNINGS=default \
    TF_CPP_MIN_LOG_LEVEL=3 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

# Create non-root user for runtime
# Home is /data/.home (created + chowned by the entrypoint at runtime). Runtime
# also exports HOME; this passwd entry is the writable fallback for any code that
# resolves ~ via getpwuid when HOME is unset (the old /app home was read-only).
RUN groupadd -r snapotter && useradd -r -g snapotter -d /data/.home -s /sbin/nologin snapotter
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
COPY docker/embedded-lib.sh /usr/local/bin/embedded-lib.sh
COPY docker/embedded/postgres-bootstrap.sh /usr/local/bin/embedded-postgres-bootstrap.sh
COPY docker/reseed-ai-venv.sh /usr/local/bin/reseed-ai-venv.sh
COPY docker/wait-for-postgres.mjs /app/docker/wait-for-postgres.mjs
# s6-overlay reads its service tree from /etc/s6-overlay/s6-rc.d (embedded mode)
COPY docker/s6/s6-rc.d /etc/s6-overlay/s6-rc.d
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/embedded-postgres-bootstrap.sh \
    /usr/local/bin/reseed-ai-venv.sh \
    && chmod +x /etc/s6-overlay/s6-rc.d/postgres/run /etc/s6-overlay/s6-rc.d/redis/run \
                /etc/s6-overlay/s6-rc.d/snapotter/run \
                /etc/s6-overlay/s6-rc.d/postgres-init/up /etc/s6-overlay/s6-rc.d/postgres-ready/up \
                /etc/s6-overlay/s6-rc.d/redis-ready/up

WORKDIR /app/apps/api

EXPOSE 1349

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD curl -sf --max-time 5 http://localhost:1349/api/v1/health || exit 1

# entrypoint.sh runs as PID 1 and re-execs the right init: `tini` for external
# mode (zombie reaping + signal forwarding for the gosu-dropped app, same end
# state as before), or s6-overlay's /init as PID 1 for embedded mode (which
# s6-overlay-suexec requires).
ENTRYPOINT ["entrypoint.sh"]
CMD ["./node_modules/.bin/tsx", "--import", "./src/tracing.ts", "--import", "./src/instrument.ts", "src/index.ts"]
