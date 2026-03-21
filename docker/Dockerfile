# ============================================
# Stage 1: Build
# ============================================
FROM node:22-bookworm AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./

# Copy all package.json files for dependency install
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/postcss.config.js apps/web/index.html ./apps/web/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/image-engine/package.json packages/image-engine/tsconfig.json ./packages/image-engine/
COPY packages/ai/package.json packages/ai/tsconfig.json ./packages/ai/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build everything
RUN pnpm build

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-bookworm-slim AS production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    imagemagick \
    tesseract-ocr tesseract-ocr-eng \
    libraw-dev \
    potrace \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create Python venv and install ML packages
RUN python3 -m venv /opt/venv
COPY packages/ai/python/requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt || echo "Some Python packages may not be available for this arch - continuing" && rm /tmp/requirements.txt

WORKDIR /app

# Copy package files and install production deps only
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/image-engine/package.json ./packages/image-engine/
COPY packages/ai/package.json ./packages/ai/

RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/packages/shared/src ./packages/shared/src
COPY --from=builder /app/packages/image-engine/src ./packages/image-engine/src
COPY --from=builder /app/packages/ai/src ./packages/ai/src

# Create required directories
RUN mkdir -p /data /tmp/workspace

# Environment defaults
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
    APP_NAME="Stirling Image"

EXPOSE 1349

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:1349/api/v1/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
