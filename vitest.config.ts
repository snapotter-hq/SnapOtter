import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Resolve api-workspace packages that pnpm only exposes under apps/api/node_modules.
const apiNodeModules = path.resolve(__dirname, "apps/api/node_modules");

// Resolve web-workspace packages that pnpm only exposes under apps/web/node_modules.
const webNodeModules = path.resolve(__dirname, "apps/web/node_modules");

// Resolve landing-workspace packages.
const landingNodeModules = path.resolve(__dirname, "apps/landing/node_modules");

// Temp dir for integration test DB + workspace (set BEFORE any app code loads)
const testDir = path.join(os.tmpdir(), `SnapOtter-test-${crypto.randomUUID().slice(0, 8)}`);

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run all test files in a single forked process so integration tests share
    // the same SQLite connection and avoid SQLITE_BUSY races on WAL setup.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    exclude: [
      "tests/e2e/**",
      "tests/e2e-docker/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      ".worktrees/**",
      ".claude/**",
    ],
    // These env vars are injected into process.env BEFORE test files are
    // imported, ensuring apps/api/src/config.ts picks them up correctly.
    env: {
      AUTH_ENABLED: "true",
      DEFAULT_USERNAME: "admin",
      DEFAULT_PASSWORD: "Adminpass1",
      DB_PATH: path.join(testDir, "test.db"),
      WORKSPACE_PATH: path.join(testDir, "workspace"),
      MAX_UPLOAD_SIZE_MB: "10",
      MAX_BATCH_SIZE: "10",
      RATE_LIMIT_PER_MIN: "10000",
      MAX_USERS: "50",
      MAX_MEGAPIXELS: "100",
      CONCURRENT_JOBS: "3",
      FILE_MAX_AGE_HOURS: "1",
      CLEANUP_INTERVAL_MINUTES: "60",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "packages/image-engine/src/**",
        "apps/api/src/**",
        "apps/web/src/stores/**",
        "apps/web/src/lib/**",
      ],
      exclude: [
        "**/*.d.ts",
        "**/node_modules/**",
        "**/dist/**",
        "apps/api/src/db/migrate.ts",
        "apps/api/src/index.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@landing": path.resolve(__dirname, "apps/landing/src"),
      // Landing page components that don't exist in web but are imported via @/
      "@/components/fade-in": path.resolve(__dirname, "apps/landing/src/components/fade-in"),
      "@/components/footer": path.resolve(__dirname, "apps/landing/src/components/footer"),
      "@/components/navbar": path.resolve(__dirname, "apps/landing/src/components/navbar"),
      "@": path.resolve(__dirname, "apps/web/src"),
      "framer-motion": path.join(landingNodeModules, "framer-motion"),
      "@snapotter/image-engine": path.resolve(__dirname, "packages/image-engine/src/index.ts"),
      "@snapotter/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      fastify: path.join(apiNodeModules, "fastify"),
      "@fastify/cors": path.join(apiNodeModules, "@fastify/cors"),
      "@fastify/multipart": path.join(apiNodeModules, "@fastify/multipart"),
      "@fastify/rate-limit": path.join(apiNodeModules, "@fastify/rate-limit"),
      "@fastify/static": path.join(apiNodeModules, "@fastify/static"),
      "@fastify/swagger": path.join(apiNodeModules, "@fastify/swagger"),
      "@fastify/swagger-ui": path.join(apiNodeModules, "@fastify/swagger-ui"),
      "better-sqlite3": path.join(apiNodeModules, "better-sqlite3"),
      "drizzle-orm": path.join(apiNodeModules, "drizzle-orm"),
      archiver: path.join(apiNodeModules, "archiver"),
      "p-queue": path.join(apiNodeModules, "p-queue"),
      dotenv: path.join(apiNodeModules, "dotenv"),
      potrace: path.join(apiNodeModules, "potrace"),
      qrcode: path.join(apiNodeModules, "qrcode"),
      jsqr: path.join(apiNodeModules, "jsqr"),
      pdfkit: path.join(apiNodeModules, "pdfkit"),
      sharp: path.join(apiNodeModules, "sharp"),
      react: path.join(webNodeModules, "react"),
      "react-dom": path.join(webNodeModules, "react-dom"),
      zustand: path.join(webNodeModules, "zustand"),
    },
  },
});
