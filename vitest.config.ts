import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Resolve api-workspace packages that pnpm only exposes under apps/api/node_modules.
const apiNodeModules = path.resolve(__dirname, "apps/api/node_modules");

// Resolve web-workspace packages that pnpm only exposes under apps/web/node_modules.
const webNodeModules = path.resolve(__dirname, "apps/web/node_modules");

// Resolve landing-workspace packages.
const landingNodeModules = path.resolve(__dirname, "apps/landing/node_modules");

// @opentelemetry/core is a transitive dep (via sdk-node) not hoisted by pnpm.
// Find it in the pnpm store so tests can import W3CTraceContextPropagator.
function findPnpmPackage(scope: string, name: string): string {
  const pnpmDir = path.resolve(__dirname, "node_modules/.pnpm");
  const prefix = `${scope}+${name}@`;
  const entries = readdirSync(pnpmDir)
    .filter((e) => e.startsWith(prefix))
    .sort();
  if (entries.length === 0) {
    throw new Error(`${scope}/${name} not found in pnpm store`);
  }
  return path.join(pnpmDir, entries[entries.length - 1], "node_modules", scope, name);
}

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
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup/per-fork-env.ts"],
    exclude: [
      "tests/e2e/**",
      "tests/e2e-docs/**",
      "tests/e2e-editor/**",
      "tests/e2e-landing/**",
      "tests/e2e-docker/**",
      "tests/e2e-analytics/**",
      // tests/qa/* are Playwright QA-sweep specs (and .mts harnesses), not
      // vitest tests; they import @playwright/test and break a bare `vitest run`.
      "tests/qa/**",
      // Stale: the landing app migrated from Next.js to Astro, so these React
      // unit tests import @landing/app/* and @landing/components/* modules that
      // no longer exist (components are now .astro). Excluded until rewritten.
      "tests/unit/landing/**",
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
      // DATABASE_URL and WORKSPACE_PATH are set per-fork in tests/setup/per-fork-env.ts
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
      "@snapotter/ai": path.resolve(__dirname, "packages/ai/src/index.ts"),
      "@snapotter/enterprise": path.resolve(__dirname, "packages/enterprise/src/index.ts"),
      "@snapotter/image-engine": path.resolve(__dirname, "packages/image-engine/src/index.ts"),
      "@snapotter/media-engine": path.resolve(__dirname, "packages/media-engine/src/index.ts"),
      "@snapotter/doc-engine": path.resolve(__dirname, "packages/doc-engine/src/index.ts"),
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
      pg: path.join(apiNodeModules, "pg"),
      "drizzle-orm": path.join(apiNodeModules, "drizzle-orm"),
      archiver: path.join(apiNodeModules, "archiver"),
      "p-queue": path.join(apiNodeModules, "p-queue"),
      dotenv: path.join(apiNodeModules, "dotenv"),
      potrace: path.join(apiNodeModules, "potrace"),
      qrcode: path.join(apiNodeModules, "qrcode"),
      jsqr: path.join(apiNodeModules, "jsqr"),
      pdfkit: path.join(apiNodeModules, "pdfkit"),
      pino: path.join(apiNodeModules, "pino"),
      sharp: path.join(apiNodeModules, "sharp"),
      ioredis: path.join(apiNodeModules, "ioredis"),
      bullmq: path.join(apiNodeModules, "bullmq"),
      otpauth: path.join(apiNodeModules, "otpauth"),
      "openid-client": path.join(apiNodeModules, "openid-client"),
      "opentype.js": path.join(apiNodeModules, "opentype.js"),
      "posthog-node": path.join(apiNodeModules, "posthog-node"),
      "@sentry/node": path.join(apiNodeModules, "@sentry/node"),
      "@aws-sdk/client-s3": path.join(
        path.resolve(__dirname, "packages/enterprise/node_modules"),
        "@aws-sdk/client-s3",
      ),
      react: path.join(webNodeModules, "react"),
      "react-dom": path.join(webNodeModules, "react-dom"),
      "react-router-dom": path.join(webNodeModules, "react-router-dom"),
      zustand: path.join(webNodeModules, "zustand"),
      "posthog-js": path.join(webNodeModules, "posthog-js"),
      "@sentry/react": path.join(webNodeModules, "@sentry/react"),
      "@opentelemetry/api": path.join(apiNodeModules, "@opentelemetry/api"),
      "@opentelemetry/core": findPnpmPackage("@opentelemetry", "core"),
      "@opentelemetry/sdk-node": path.join(apiNodeModules, "@opentelemetry/sdk-node"),
      "@opentelemetry/sdk-trace-base": path.join(apiNodeModules, "@opentelemetry/sdk-trace-base"),
      "@opentelemetry/exporter-trace-otlp-http": path.join(
        apiNodeModules,
        "@opentelemetry/exporter-trace-otlp-http",
      ),
      "@opentelemetry/resources": path.join(apiNodeModules, "@opentelemetry/resources"),
      "@opentelemetry/semantic-conventions": path.join(
        apiNodeModules,
        "@opentelemetry/semantic-conventions",
      ),
      "@opentelemetry/instrumentation-http": path.join(
        apiNodeModules,
        "@opentelemetry/instrumentation-http",
      ),
      "@opentelemetry/instrumentation-fastify": path.join(
        apiNodeModules,
        "@opentelemetry/instrumentation-fastify",
      ),
      "@opentelemetry/instrumentation-pg": path.join(
        apiNodeModules,
        "@opentelemetry/instrumentation-pg",
      ),
      "@opentelemetry/instrumentation-ioredis": path.join(
        apiNodeModules,
        "@opentelemetry/instrumentation-ioredis",
      ),
      "@opentelemetry/instrumentation-aws-sdk": path.join(
        apiNodeModules,
        "@opentelemetry/instrumentation-aws-sdk",
      ),
    },
  },
});
