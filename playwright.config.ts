import { randomBytes, randomInt } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightBackingState } from "./tests/playwright-backing-state.mjs";

function resolveRunId(): string {
  const runId = process.env.PLAYWRIGHT_RUN_ID ?? `${process.pid}_${randomBytes(4).toString("hex")}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(runId)) {
    throw new Error(
      `PLAYWRIGHT_RUN_ID must be 1-64 letters, digits, underscores, or hyphens and start with a letter or digit, received ${JSON.stringify(runId)}`,
    );
  }
  process.env.PLAYWRIGHT_RUN_ID = runId;
  return runId;
}

const runId = resolveRunId();
const runRoot = path.join(__dirname, "test-results", "e2e-runs", runId);
const authFile = path.join(runRoot, "auth", "user.json");
const webDistDir = path.join(runRoot, "web-dist");
process.env.PLAYWRIGHT_RUN_ROOT = runRoot;
process.env.PLAYWRIGHT_AUTH_FILE = authFile;

type E2eEndpoint = {
  host: string;
  port: number;
  url: string;
};

function parsePort(value: string, envName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${envName} must be an integer port, received "${value}"`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${envName} must be between 1024 and 65535, received "${value}"`);
  }
  return port;
}

function randomPort(min: number): number {
  return randomInt(min, min + 10_000);
}

function resolveEndpoint(kind: "API" | "WEB", defaultPortFloor: number): E2eEndpoint {
  const portEnvName = `PLAYWRIGHT_${kind}_PORT`;
  const urlEnvName = `PLAYWRIGHT_${kind}_URL`;
  const urlOverride = process.env[urlEnvName] ?? (kind === "API" ? process.env.API_URL : undefined);
  const parsedOverride = urlOverride ? new URL(urlOverride) : undefined;
  const port = process.env[portEnvName]
    ? parsePort(process.env[portEnvName], portEnvName)
    : parsedOverride?.port
      ? parsePort(parsedOverride.port, urlEnvName)
      : randomPort(defaultPortFloor);
  const parsedUrl = parsedOverride ?? new URL(`http://127.0.0.1:${port}`);

  if (parsedUrl.protocol !== "http:") {
    throw new Error(`${urlEnvName} must use http, received "${parsedUrl.protocol}"`);
  }
  if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
    throw new Error(`${urlEnvName} must use a loopback host, received "${parsedUrl.hostname}"`);
  }
  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(`${urlEnvName} must be an origin without credentials, path, query, or hash`);
  }
  if (parsePort(parsedUrl.port || "80", urlEnvName) !== port) {
    throw new Error(`${portEnvName} must match the port in ${urlEnvName}`);
  }

  const url = parsedUrl.origin;
  process.env[portEnvName] = String(port);
  process.env[urlEnvName] = url;
  return { host: parsedUrl.hostname, port, url };
}

const apiEndpoint = resolveEndpoint("API", 20_000);
const webEndpoint = resolveEndpoint("WEB", 30_000);
const TEST_API_URL = apiEndpoint.url;
const TEST_WEB_URL = webEndpoint.url;
process.env.API_URL = TEST_API_URL;

const E2E_PG_BASE_URL =
  process.env.E2E_PG_BASE_URL || "postgres://snapotter:snapotter@localhost:5432/snapotter";
const backingState = resolvePlaywrightBackingState({
  postgresBaseUrl: E2E_PG_BASE_URL,
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  runId,
  scope: "main",
});

// Specs that mutate global server state (settings, users, roles, API keys)
// or assert on global lists/timing. These run in the chromium-serial project
// with --workers=1; everything else parallelizes safely.
const SERIAL_SPECS =
  /gui-settings-|settings\.spec|rbac|security|people|api\.spec|state-bleed|full-session|gui-file-carry|library-save-mode|i18n|theme|gui-performance/;

// Screenshot-comparison specs. Separate project because baselines are
// platform-specific: they run locally (darwin baselines) and via the
// update-visual-baselines workflow, but not in the nightly linux run until
// linux baselines are committed.
const VISUAL_SPECS = /gui-visual-/;
const LEGACY_VISUAL_SPECS = /visual-regression\.spec\.ts/;

// Stable, engine-neutral coverage shared by Firefox and WebKit. Broader specs
// remain Chromium-owned when they rely on engine-specific browser behavior.
const CROSS_BROWSER_SPECS =
  /(?:^|[/\\])(?:gui-cross-browser|smoke|navigation|home-page)\.spec\.ts$/;

// Exact CSS boundary and wide-screen ownership lives in one small project so
// these widths cannot disappear inside device presets or ad-hoc test overrides.
const WIDTH_SPECS = /viewport-widths\.spec\.ts/;

// Device-emulated specs (real touch, UA, DPR). Tagged @mobile or @tablet
// and routed to the dedicated device projects below.
const DEVICE_SPECS = /device-mobile|device-tablet|device-visual|device-a11y/;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
      caret: "hide",
    },
  },
  // Platform-suffixed baselines: darwin baselines serve local runs on macOS,
  // linux baselines (generated by the update-visual-baselines workflow) serve CI.
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  // Files run across workers; tests within a file stay ordered. The serial
  // bucket is pinned to --workers=1 by its run command. Default is 2: the
  // dev-mode webServers saturate beyond that and 30s-timeout tests start
  // flaking. Raise via PW_WORKERS on stronger setups.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 2,
  outputDir: path.join(runRoot, "playwright-output"),
  reporter: [["html", { open: "never", outputFolder: path.join(runRoot, "playwright-report") }]],
  use: {
    baseURL: TEST_WEB_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /(?:^|[/\\])auth\.setup\.ts$/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      testIgnore: [SERIAL_SPECS, VISUAL_SPECS, LEGACY_VISUAL_SPECS, DEVICE_SPECS, WIDTH_SPECS],
      dependencies: ["setup"],
    },
    {
      name: "chromium-serial",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      testMatch: SERIAL_SPECS,
      dependencies: ["setup"],
    },
    {
      name: "chromium-visual",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      testMatch: VISUAL_SPECS,
      dependencies: ["setup"],
    },
    {
      // The older broad screenshot matrix has no maintained platform baselines
      // yet. Keep it explicitly runnable and collectible without silently
      // skipping based on CI/DOCKER environment variables.
      name: "chromium-legacy-visual",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      testMatch: LEGACY_VISUAL_SPECS,
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        storageState: authFile,
      },
      testMatch: CROSS_BROWSER_SPECS,
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        storageState: authFile,
      },
      testMatch: CROSS_BROWSER_SPECS,
      dependencies: ["setup"],
    },
    {
      name: "chromium-widths",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      testMatch: WIDTH_SPECS,
      dependencies: ["setup"],
    },

    // ---- Real device-emulated projects (touch, UA, DPR, engine) ----
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        storageState: authFile,
      },
      testMatch: DEVICE_SPECS,
      grep: /@mobile/,
      dependencies: ["setup"],
    },
    {
      name: "mobile-webkit",
      use: {
        ...devices["iPhone 14"],
        storageState: authFile,
      },
      testMatch: DEVICE_SPECS,
      grep: /@mobile/,
      // @visual baselines are platform-suffixed but not browser-suffixed, so a
      // single baseline cannot match both chromium and webkit rendering. Visual
      // regression runs on the chromium device projects only; webkit covers the
      // functional device flows.
      grepInvert: /@visual/,
      dependencies: ["setup"],
    },
    {
      name: "tablet-webkit",
      use: {
        ...devices["iPad (gen 7)"],
        storageState: authFile,
      },
      testMatch: DEVICE_SPECS,
      grep: /@tablet/,
      grepInvert: /@visual/,
      dependencies: ["setup"],
    },
    {
      name: "tablet-chromium",
      use: {
        ...devices["Galaxy Tab S9"],
        storageState: authFile,
      },
      testMatch: DEVICE_SPECS,
      grep: /@tablet/,
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: `node tests/playwright-api-lifecycle.mjs ${runId} main -- pnpm --filter @snapotter/api exec tsx watch --import ./src/tracing.ts --import ./src/instrument.ts src/index.ts`,
      url: `${TEST_API_URL}/api/v1/health`,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
      env: {
        PORT: String(apiEndpoint.port),
        AUTH_ENABLED: "true",
        DEFAULT_USERNAME: "admin",
        DEFAULT_PASSWORD: "admin",
        RATE_LIMIT_PER_MIN: "50000",
        // The login route has its own per-minute attempt cap (default 10). The
        // RBAC/settings specs sign in many times in quick succession, so raise
        // it well above any single run to avoid 429s that cascade into
        // create-user 401s and login timeouts.
        LOGIN_ATTEMPT_LIMIT: "100000",
        // Several specs deliberately fail a login as "admin"; keep the
        // per-username failed-login throttle out of reach the same way.
        LOGIN_THROTTLE_MAX_FAILURES: "100000",
        SKIP_MUST_CHANGE_PASSWORD: "true",
        ANALYTICS_ENABLED: "false",
        // The api-keys management routes cap at 30/min per IP in production. The
        // serial api-keys specs hit the list endpoint far more than that on a
        // shared IP, so raise the cap well above any single run.
        API_KEYS_RATE_LIMIT_PER_MIN: "100000",
        DATABASE_URL: backingState.databaseUrl,
        E2E_PG_BASE_URL: backingState.postgresBaseUrl,
        REDIS_URL: backingState.redisUrl,
        BULLMQ_PREFIX: backingState.bullmqPrefix,
        // The in-repo docker/feature-manifest.json makes the API think it is
        // inside Docker and try to mkdir /data; point it somewhere writable.
        DATA_DIR: path.join(runRoot, "data"),
        FILES_STORAGE_PATH: path.join(runRoot, "files"),
        WORKSPACE_PATH: path.join(runRoot, "workspace"),
        // Point feature-manifest detection at a path that does not exist so the
        // API runs in native mode: it reports every AI bundle as available
        // (apps/api/src/routes/features.ts) instead of gating each AI tool
        // behind a multi-GB "requires an additional download" install prompt.
        // The e2e env never downloads the model bundles, so without this every
        // AI-tool GUI test is blocked before reaching a control. Real inference
        // still no-ops, but the AI GUI specs assert on settings only and the
        // processing specs skip when the sidecar is absent.
        FEATURE_MANIFEST_PATH: path.join(runRoot, ".no-feature-manifest.json"),
      },
      timeout: 30_000,
    },
    {
      // Production build + static preview: the dev server's on-demand
      // transform saturates under parallel workers and flakes 30s-timeout
      // tests. The build adds ~40s once per run and removes that whole class.
      //
      // The build output is run-scoped like every other mutable path here. The
      // default apps/web/dist is shared, and vite empties the output directory
      // before writing it, so a second run of this config deletes the assets
      // the first run's preview server is still serving. The first run then
      // fails with "Failed to fetch dynamically imported module" and lands on
      // the error boundary, which reads as a product defect anywhere the chunk
      // happened to load during that window.
      // The build runs as its two steps rather than the package's build script
      // because pnpm does not forward --outDir into a compound npm script.
      command: `pnpm --filter @snapotter/web exec tsc -b && pnpm --filter @snapotter/web exec vite build --outDir ${webDistDir} --emptyOutDir && pnpm --filter @snapotter/web exec vite preview --outDir ${webDistDir} --host ${webEndpoint.host} --port ${webEndpoint.port} --strictPort`,
      url: TEST_WEB_URL,
      reuseExistingServer: false,
      env: {
        PORT: String(webEndpoint.port),
        VITE_API_URL: TEST_API_URL,
      },
      timeout: 240_000,
    },
  ],
});

export { authFile };
