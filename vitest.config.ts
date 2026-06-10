import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Resolve api-workspace packages that pnpm only exposes under apps/api/node_modules.
const apiNodeModules = path.resolve(__dirname, "apps/api/node_modules");

// Resolve web-workspace packages that pnpm only exposes under apps/web/node_modules.
const webNodeModules = path.resolve(__dirname, "apps/web/node_modules");

// Resolve landing-workspace packages.
const landingNodeModules = path.resolve(__dirname, "apps/landing/node_modules");

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: {
      forks: {
        // Parallel forks; each fork gets an isolated DB + workspace via
        // tests/setup/per-fork-env.ts. CI runners have 4 vCPUs.
        maxForks: process.env.CI ? 4 : Math.max(2, Math.floor(os.availableParallelism() / 2)),
      },
    },
    setupFiles: ["tests/setup/per-fork-env.ts"],
    exclude: [
      "tests/e2e/**",
      "tests/e2e-docs/**",
      "tests/e2e-editor/**",
      "tests/e2e-landing/**",
      "tests/e2e-docker/**",
      "tests/e2e-analytics/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      ".worktrees/**",
      ".claude/**",
    ],
    env: {
      AUTH_ENABLED: "true",
      DEFAULT_USERNAME: "admin",
      DEFAULT_PASSWORD: "Adminpass1",
      // DB_PATH and WORKSPACE_PATH are set per-fork in tests/setup/per-fork-env.ts
      MAX_UPLOAD_SIZE_MB: "10",
      MAX_BATCH_SIZE: "10",
      RATE_LIMIT_PER_MIN: "10000",
      MAX_USERS: "0",
      MAX_MEGAPIXELS: "100",
      CONCURRENT_JOBS: "3",
      FILE_MAX_AGE_HOURS: "1",
      CLEANUP_INTERVAL_MINUTES: "60",
      MAX_PIPELINE_STEPS: "0",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Ratchet: measured 2026-06-10 at lines 77.7 / branches 83.7 /
      // functions 86.5 over unit+integration. Raise when coverage rises;
      // never lower without a written reason.
      thresholds: {
        lines: 75,
        branches: 81,
        functions: 84,
        statements: 75,
      },
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
      "@/components/json-ld": path.resolve(__dirname, "apps/landing/src/components/json-ld"),
      "@/components/navbar": path.resolve(__dirname, "apps/landing/src/components/navbar"),
      "@": path.resolve(__dirname, "apps/web/src"),
      "framer-motion": path.join(landingNodeModules, "framer-motion"),
      "@snapotter/image-engine": path.resolve(__dirname, "packages/image-engine/src/index.ts"),
      "@snapotter/shared/i18n": path.resolve(__dirname, "packages/shared/src/i18n"),
      "@snapotter/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      fastify: path.join(apiNodeModules, "fastify"),
      "@fastify/cookie": path.join(apiNodeModules, "@fastify/cookie"),
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
      "openid-client": path.join(apiNodeModules, "openid-client"),
      "opentype.js": path.join(apiNodeModules, "opentype.js"),
      "posthog-node": path.join(apiNodeModules, "posthog-node"),
      "@sentry/node": path.join(apiNodeModules, "@sentry/node"),
      "@aws-sdk/client-s3": path.join(apiNodeModules, "@aws-sdk/client-s3"),
      react: path.join(webNodeModules, "react"),
      "react-dom": path.join(webNodeModules, "react-dom"),
      "react-router-dom": path.join(webNodeModules, "react-router-dom"),
      zustand: path.join(webNodeModules, "zustand"),
      "posthog-js": path.join(webNodeModules, "posthog-js"),
      "@sentry/react": path.join(webNodeModules, "@sentry/react"),
    },
  },
});
