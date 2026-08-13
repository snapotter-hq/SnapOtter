import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const root = process.cwd();
const createDbPath = path.join(root, "tests", "e2e-pg-create-db.cjs");
const e2eDir = path.join(root, "tests", "e2e");
const authSetupPath = path.join(e2eDir, "auth.setup.ts");
const helpersPath = path.join(root, "tests", "e2e", "helpers.ts");
const dockerPlaywrightConfigPath = path.join(root, "playwright.analytics.config.ts");
const analyticsLocalConfigPath = path.join(root, "playwright.analytics-local.config.ts");
const dockerAuthSetupPath = path.join(root, "tests", "e2e-docker", "auth.setup.ts");
const dockerAnalyticsApiPath = path.join(root, "tests", "e2e-docker", "analytics-api.spec.ts");
const analyticsLocalAuthSetupPath = path.join(root, "tests", "e2e-analytics", "auth.setup.ts");
const embeddedModePath = path.join(root, "tests", "e2e-docker", "embedded-mode.mjs");
const packagePath = path.join(root, "package.json");
const e2eRunnerPath = path.join(root, "scripts", "run-main-e2e.mjs");
const turboPath = path.join(root, "turbo.json");
const vitestConfigPath = path.join(root, "vitest.config.ts");

const isolationEnvKeys = [
  "API_URL",
  "BASE_URL",
  "PLAYWRIGHT_API_PORT",
  "PLAYWRIGHT_API_URL",
  "PLAYWRIGHT_AUTH_FILE",
  "PLAYWRIGHT_RUN_ID",
  "PLAYWRIGHT_RUN_ROOT",
  "PLAYWRIGHT_WEB_PORT",
  "PLAYWRIGHT_WEB_URL",
] as const;

const originalEnv = new Map(isolationEnvKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.resetModules();
  for (const key of isolationEnvKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function loadConfig(overrides: Record<string, string>) {
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
  vi.resetModules();
  return (await import("../../playwright.config.js")).default;
}

async function loadDockerConfig(overrides: Record<string, string>) {
  for (const key of isolationEnvKeys) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
  vi.resetModules();
  return (await import("../../playwright.analytics.config.js")).default;
}

async function loadAnalyticsLocalConfig(overrides: Record<string, string>) {
  for (const key of isolationEnvKeys) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
  vi.resetModules();
  return (await import("../../playwright.analytics-local.config.js")).default;
}

function collectPlaywright(
  configPath: string,
  args: string[] = [],
  env: Record<string, string> = {},
): string {
  return execFileSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", configPath, ...args, "--list"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PLAYWRIGHT_RUN_ID: "collection_contract",
        ...env,
      },
      maxBuffer: 20 * 1024 * 1024,
      stdio: "pipe",
    },
  );
}

function mutablePaths(config: Awaited<ReturnType<typeof loadConfig>>) {
  const [apiServer] = config.webServer as Array<{ env: Record<string, string> }>;
  const chromium = config.projects?.find((project) => project.name === "chromium");
  const reporter = config.reporter as Array<[string, { outputFolder?: string }]>;

  return {
    authFile: chromium?.use?.storageState,
    dataDir: apiServer.env.DATA_DIR,
    filesStoragePath: apiServer.env.FILES_STORAGE_PATH,
    outputDir: config.outputDir,
    reportDir: reporter[0]?.[1]?.outputFolder,
    runRoot: process.env.PLAYWRIGHT_RUN_ROOT,
    workspacePath: apiServer.env.WORKSPACE_PATH,
  };
}

describe("main Playwright harness isolation", () => {
  test("binds exact backing state to the validated run and tears it down after API shutdown", async () => {
    const config = await loadConfig({
      PLAYWRIGHT_API_PORT: "18121",
      PLAYWRIGHT_API_URL: "http://127.0.0.1:18121",
      PLAYWRIGHT_RUN_ID: "main_backing_contract",
      PLAYWRIGHT_WEB_PORT: "28121",
      PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28121",
    });
    const [apiServer] = config.webServer as Array<{
      command: string;
      env: Record<string, string>;
      gracefulShutdown?: { signal: string; timeout: number };
    }>;
    const databaseName = new URL(apiServer.env.DATABASE_URL).pathname.slice(1);

    expect(databaseName).toMatch(/^snapotter_e2e_main_[a-f0-9]{24}$/);
    expect(apiServer.env.BULLMQ_PREFIX).toBe(databaseName);
    expect(apiServer.command).toContain(
      "node tests/playwright-api-lifecycle.mjs main_backing_contract main -- pnpm",
    );
    expect(apiServer.command).not.toContain("e2e-pg-create-db.cjs");
    expect(apiServer.gracefulShutdown).toEqual({ signal: "SIGTERM", timeout: 30_000 });
  });

  test("propagates the exact isolated API and web endpoints through every process", async () => {
    const apiUrl = "http://127.0.0.1:18123";
    const webUrl = "http://127.0.0.1:28123";
    const config = await loadConfig({
      PLAYWRIGHT_API_PORT: "18123",
      PLAYWRIGHT_API_URL: apiUrl,
      PLAYWRIGHT_WEB_PORT: "28123",
      PLAYWRIGHT_WEB_URL: webUrl,
    });

    expect(config.use?.baseURL).toBe(webUrl);
    expect(process.env.API_URL).toBe(apiUrl);

    const [apiServer, webServer] = config.webServer as Array<{
      command: string;
      env: Record<string, string>;
      reuseExistingServer: boolean;
      url?: string;
    }>;

    expect(apiServer.url).toBe(`${apiUrl}/api/v1/health`);
    expect(apiServer.reuseExistingServer).toBe(false);
    expect(apiServer.env.PORT).toBe("18123");
    expect(apiServer.command).not.toContain("@snapotter/api dev");

    expect(webServer.url).toBe(webUrl);
    expect(webServer.reuseExistingServer).toBe(false);
    expect(webServer.env.PORT).toBe("28123");
    expect(webServer.env.VITE_API_URL).toBe(apiUrl);
    expect(webServer.command).toContain("--port 28123");
    expect(webServer.command).toContain("--strictPort");
  });

  test("scopes the web build output to the run so concurrent runs cannot empty it", async () => {
    const config = await loadConfig({
      PLAYWRIGHT_API_PORT: "18130",
      PLAYWRIGHT_API_URL: "http://127.0.0.1:18130",
      PLAYWRIGHT_RUN_ID: "web_dist_contract",
      PLAYWRIGHT_WEB_PORT: "28130",
      PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28130",
    });
    const [, webServer] = config.webServer as Array<{ command: string }>;
    const distDir = path.join(root, "test-results", "e2e-runs", "web_dist_contract", "web-dist");

    // vite empties the output directory before writing it. Sharing the default
    // apps/web/dist means a second run deletes the chunks the first run's
    // preview server is still serving, and the first run then reports error
    // boundaries that look like product defects.
    expect(webServer.command).toContain(`vite build --outDir ${distDir} --emptyOutDir`);
    expect(webServer.command).toContain(`vite preview --outDir ${distDir}`);
    // pnpm does not forward extra args into a compound npm script, so routing
    // the build through `pnpm --filter @snapotter/web build` would silently
    // drop --outDir and write to the shared default again.
    expect(webServer.command).not.toContain("@snapotter/web build");
  });

  test("generates distinct endpoint pairs when no endpoint override is supplied", async () => {
    for (const key of isolationEnvKeys) delete process.env[key];
    const first = await loadConfig({});
    const firstApiUrl = process.env.API_URL;
    const firstWebUrl = first.use?.baseURL;

    for (const key of isolationEnvKeys) delete process.env[key];
    const second = await loadConfig({});

    expect(firstApiUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(firstWebUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect([process.env.API_URL, second.use?.baseURL]).not.toEqual([firstApiUrl, firstWebUrl]);
  });

  test("isolates every mutable path by a stable run identity", async () => {
    const firstConfig = await loadConfig({
      PLAYWRIGHT_API_PORT: "18125",
      PLAYWRIGHT_API_URL: "http://127.0.0.1:18125",
      PLAYWRIGHT_RUN_ID: "run_a",
      PLAYWRIGHT_WEB_PORT: "28125",
      PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28125",
    });
    const first = mutablePaths(firstConfig);

    const secondConfig = await loadConfig({
      PLAYWRIGHT_API_PORT: "18126",
      PLAYWRIGHT_API_URL: "http://127.0.0.1:18126",
      PLAYWRIGHT_RUN_ID: "run_b",
      PLAYWRIGHT_WEB_PORT: "28126",
      PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28126",
    });
    const second = mutablePaths(secondConfig);

    for (const key of Object.keys(first) as Array<keyof typeof first>) {
      expect(first[key], key).toContain("run_a");
      expect(second[key], key).toContain("run_b");
      expect(second[key], key).not.toBe(first[key]);
    }

    const reloaded = mutablePaths(
      await loadConfig({
        PLAYWRIGHT_API_PORT: "18126",
        PLAYWRIGHT_API_URL: "http://127.0.0.1:18126",
        PLAYWRIGHT_RUN_ID: "run_b",
        PLAYWRIGHT_WEB_PORT: "28126",
        PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28126",
      }),
    );
    expect(reloaded).toEqual(second);
  });

  test("rejects unsafe run identities", async () => {
    await expect(
      loadConfig({
        PLAYWRIGHT_API_PORT: "18127",
        PLAYWRIGHT_API_URL: "http://127.0.0.1:18127",
        PLAYWRIGHT_RUN_ID: "../shared",
        PLAYWRIGHT_WEB_PORT: "28127",
        PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28127",
      }),
    ).rejects.toThrow(/PLAYWRIGHT_RUN_ID/);
  });

  test("rejects unsupported IPv6 loopback URLs", async () => {
    await expect(
      loadConfig({
        PLAYWRIGHT_API_PORT: "18128",
        PLAYWRIGHT_API_URL: "http://127.0.0.1:18128",
        PLAYWRIGHT_RUN_ID: "ipv6_test",
        PLAYWRIGHT_WEB_PORT: "28128",
        PLAYWRIGHT_WEB_URL: "http://[::1]:28128",
      }),
    ).rejects.toThrow(/loopback host/);
  });

  test("matches only the canonical auth setup file", async () => {
    const config = await loadConfig({
      PLAYWRIGHT_API_PORT: "18124",
      PLAYWRIGHT_API_URL: "http://127.0.0.1:18124",
      PLAYWRIGHT_WEB_PORT: "28124",
      PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28124",
    });
    const setup = config.projects?.find((project) => project.name === "setup");
    const match = setup?.testMatch as RegExp;

    expect(match.test(path.join(root, "tests/e2e/auth.setup.ts"))).toBe(true);
    expect(match.test(path.join(root, "tests/e2e/qa-auth.setup.ts"))).toBe(false);
    expect(match.test(path.join(root, "tests/e2e/not-auth.setup.ts"))).toBe(false);
  });
});

describe("E2E database bootstrap safety", () => {
  test("rejects an unsafe target before attempting a database connection", () => {
    expect(() =>
      execFileSync(process.execPath, [createDbPath, "production"], {
        cwd: root,
        env: {
          ...process.env,
          E2E_PG_BASE_URL: "postgres://snapotter:snapotter@127.0.0.1:1/postgres",
        },
        encoding: "utf8",
        stdio: "pipe",
        timeout: 10_000,
      }),
    ).toThrow(/unsafe database name/i);
  });

  test("never enumerates or drops sibling E2E databases", () => {
    const source = fs.readFileSync(createDbPath, "utf8");

    expect(source).not.toContain("FROM pg_database");
    expect(source).not.toContain("LIKE 'snapotter_e2e_%'");
    expect(source).not.toContain("row.datname");
  });
});

test("loggedInPage does not mutate global settings for every test", () => {
  const source = fs.readFileSync(helpersPath, "utf8");
  const fixture = source.slice(
    source.indexOf("export const test = base.extend"),
    source.indexOf("// isAiSidecarRunning"),
  );

  expect(fixture).toContain('await page.goto("/")');
  expect(fixture).not.toContain("putSettings(");
  expect(fixture).not.toContain("settings heal");
});

describe("E2E navigation targets", () => {
  // Paths that are meant to land on the catch-all. Anything else that does not
  // resolve is a spec asserting against a 404 page it never intended to load,
  // which passes vacuously and reports coverage the suite does not have.
  const INTENTIONAL_NOT_FOUND = new Set([
    "/image/nonexistent-tool-abc123",
    "/image/nonexistent-tool-xyz",
    "/image/this-tool-does-not-exist",
    "/some/deep/nested/invalid/path",
    "/this-route-does-not-exist-404",
    "/this-tool-does-not-exist-xyz",
    "/tools/resize",
    "/zzz-nonexistent-tool-xyz",
  ]);

  function declaredStaticRoutes(): Set<string> {
    const app = fs.readFileSync(path.join(root, "apps", "web", "src", "App.tsx"), "utf8");
    const paths = [...app.matchAll(/\bpath="([^"]+)"/g)].map((match) => match[1]);
    expect(paths, "App.tsx declared no routes; the parser is broken").not.toHaveLength(0);
    return new Set(paths.filter((value) => value !== "*" && !value.includes(":")));
  }

  test("every literal e2e navigation resolves to a declared route", async () => {
    const { TOOLS } = await import("@snapotter/shared");
    const staticRoutes = declaredStaticRoutes();
    const toolRoutes = new Set(TOOLS.map((tool) => tool.route));
    const unresolved = new Map<string, string[]>();

    for (const entry of fs.readdirSync(e2eDir)) {
      if (!entry.endsWith(".ts")) continue;
      const source = fs.readFileSync(path.join(e2eDir, entry), "utf8");
      for (const match of source.matchAll(/\.goto\("(\/[^"]*)"/g)) {
        const target = match[1].split("?")[0];
        if (staticRoutes.has(target) || toolRoutes.has(target)) continue;
        if (INTENTIONAL_NOT_FOUND.has(target)) continue;
        // The a11y suite reaches the catch-all through a sentinel path.
        if (target.startsWith("/__a11y-")) continue;
        unresolved.set(target, [...(unresolved.get(target) ?? []), entry]);
      }
    }

    expect(
      Object.fromEntries(unresolved),
      "these e2e navigations hit the catch-all route, so their assertions run against the 404 page",
    ).toEqual({});
  });

  test("catalog-generated specs navigate by section route, not by modality", () => {
    const source = fs.readFileSync(path.join(e2eDir, "tools-all.spec.ts"), "utf8");

    // A tool's modality is not its URL section: "document" splits into pdf and
    // files, and "file" maps to files. Building a URL from modality silently
    // sends every document and file tool to the catch-all.
    expect(source).not.toMatch(/goto\(`\/\$\{tool\??\.?\.?modality/);
    expect(source).not.toContain("tool?.modality");
    expect(source).toContain("tool.route");
  });
});

test("main E2E consumers use the resolved run endpoint and artifact root", () => {
  const endpointOffenders: string[] = [];
  const artifactOffenders: string[] = [];

  for (const entry of fs.readdirSync(e2eDir)) {
    if (!entry.endsWith(".ts")) continue;
    const source = fs.readFileSync(path.join(e2eDir, entry), "utf8");
    if (/=\s*["']http:\/\/(?:localhost|127\.0\.0\.1):13490["']/.test(source)) {
      endpointOffenders.push(entry);
    }
    if (/path\.join\(\s*process\.cwd\(\),\s*["']test-results["']/.test(source)) {
      artifactOffenders.push(entry);
    }
  }

  expect.soft(endpointOffenders).toEqual([]);
  expect.soft(artifactOffenders).toEqual([]);

  const authSetup = fs.readFileSync(authSetupPath, "utf8");
  expect.soft(authSetup).toContain("PLAYWRIGHT_AUTH_FILE");
  expect.soft(authSetup).not.toContain(":13490");
  expect.soft(authSetup).not.toContain(":2349");
});

test("no spec pins storageState to a path outside the run", () => {
  // A literal auth path survives the run that wrote it. The token inside then
  // belongs to a database that no longer exists, so the block runs signed out
  // and drives the login page instead of the surface it claims to cover.
  const offenders: string[] = [];

  for (const entry of fs.readdirSync(e2eDir)) {
    if (!entry.endsWith(".ts")) continue;
    const source = fs.readFileSync(path.join(e2eDir, entry), "utf8");
    for (const match of source.matchAll(/storageState:\s*(["'][^"']+["'])/g)) {
      offenders.push(`${entry}: ${match[1]}`);
    }
  }

  expect(
    offenders,
    "use the authFile export from playwright.config.ts, or an explicit empty state",
  ).toEqual([]);
});

test("auth setup proves the web endpoint proxies to the run-owned API", () => {
  const authSetup = fs.readFileSync(authSetupPath, "utf8");

  // A health probe only shows that some API answered. The session token minted
  // through the web endpoint exists solely in the run-owned database, so
  // replaying it against process.env.API_URL is the identity check.
  expect(authSetup).toContain("/api/auth/session");
  expect(authSetup).toMatch(/authorization: `Bearer \$\{proxiedToken\}`/);
  expect(authSetup).toContain("Bearer not-a-real-session-token");
  expect(authSetup).toMatch(/forged\.status\(\)\s*!==\s*401/);

  // The preview server, not just the build, must take its proxy target from the
  // resolved endpoint. Configuring only the build leaves preview.proxy on its
  // hard-coded default, which is how an earlier sweep drove another instance.
  const viteConfig = fs.readFileSync(path.join(root, "apps", "web", "vite.config.ts"), "utf8");
  const preview = viteConfig.slice(
    viteConfig.indexOf("preview: {"),
    viteConfig.indexOf("build: {"),
  );
  expect(preview).toContain("process.env.VITE_API_URL");
});

test("canonical Docker commands collect the complete app and production release suites", () => {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
    scripts: Record<string, string>;
  };

  expect(packageJson.scripts["test:e2e:docker"]).toBe(
    "playwright test --config playwright.analytics.config.ts",
  );
  expect(packageJson.scripts["test:e2e:production"]).toBe(
    "playwright test --config tests/qa/playwright.qa.config.ts",
  );

  const dockerOutput = collectPlaywright(dockerPlaywrightConfigPath, [], {
    BASE_URL: "http://127.0.0.1:1349",
    CI: "1",
  });
  expect(dockerOutput).toContain("adjustment-tools.spec.ts");
  expect(dockerOutput).toContain("analytics-no-data-leak.spec.ts");
  expect(dockerOutput).toContain("pipeline-advanced.spec.ts");
  expect(dockerOutput).toContain("Total: 1072 tests in 30 files");

  const productionOutput = collectPlaywright(
    path.join(root, "tests", "qa", "playwright.qa.config.ts"),
  );
  expect(productionOutput).toContain("crosscutting.qa.spec.ts");
  expect(productionOutput).toContain("settings-extended.qa.spec.ts");
  expect(productionOutput).toContain("Total: 397 tests in 9 files");
});

test("embedded lifecycle tests use exact labeled resources and dynamic loopback ports", () => {
  const source = fs.readFileSync(embeddedModePath, "utf8");

  expect(source).toContain("SNAPOTTER_TEST_RUN_ID");
  expect(source).toContain("com.snapotter.e2e.run");
  expect(source).toContain('"--label"');
  expect(source).toContain('"127.0.0.1::1349"');
  expect(source).toContain('["port", NAME, "1349/tcp"]');
  expect(source).toContain("containerIsOwned");
  expect(source).toContain("volumeIsOwned");
  expect(source).not.toContain('const NAME = "so-embed-test"');
  expect(source).not.toContain('const VOL = "so-embed-test-data"');
  expect(source).not.toContain('|| "13492"');

  const cleanup = source.slice(source.indexOf("const cleanup"), source.indexOf("async function"));
  expect(cleanup).toContain("containerIsOwned");
  expect(cleanup).toContain("volumeIsOwned");
  expect(cleanup).toContain('["rm", "-f", NAME]');
  expect(cleanup).toContain('["volume", "rm", VOL]');
  expect(source).toContain('process.once("SIGINT"');
  expect(source).toContain('process.once("SIGTERM"');
  expect(source).toContain('process.once("exit", cleanup)');
  expect(source).toContain(".finally(cleanup)");
  expect(source).toContain("process.exitCode = exitCode");
  expect(source).toContain("const restartEmbeddedContainer = () =>");
  expect(source.match(/restartEmbeddedContainer\(\);/g)).toHaveLength(2);
});

describe("Docker analytics Playwright isolation", () => {
  test("isolates auth state, output, and reports under the validated run identity", async () => {
    const firstConfig = await loadDockerConfig({
      BASE_URL: "http://127.0.0.1:18491",
      PLAYWRIGHT_RUN_ID: "docker_run_a",
    });
    const firstChromium = firstConfig.projects?.find((project) => project.name === "chromium");
    const firstReporter = firstConfig.reporter as Array<[string, { outputFolder?: string }]>;
    const first = {
      authFile: firstChromium?.use?.storageState,
      envAuthFile: process.env.PLAYWRIGHT_AUTH_FILE,
      outputDir: firstConfig.outputDir,
      reportDir: firstReporter[0]?.[1]?.outputFolder,
      runRoot: process.env.PLAYWRIGHT_RUN_ROOT,
    };

    const secondConfig = await loadDockerConfig({
      BASE_URL: "http://127.0.0.1:18492",
      PLAYWRIGHT_RUN_ID: "docker_run_b",
    });
    const secondChromium = secondConfig.projects?.find((project) => project.name === "chromium");
    const secondReporter = secondConfig.reporter as Array<[string, { outputFolder?: string }]>;
    const second = {
      authFile: secondChromium?.use?.storageState,
      envAuthFile: process.env.PLAYWRIGHT_AUTH_FILE,
      outputDir: secondConfig.outputDir,
      reportDir: secondReporter[0]?.[1]?.outputFolder,
      runRoot: process.env.PLAYWRIGHT_RUN_ROOT,
    };

    for (const key of Object.keys(first) as Array<keyof typeof first>) {
      expect(first[key], key).toContain("docker_run_a");
      expect(second[key], key).toContain("docker_run_b");
      expect(second[key], key).not.toBe(first[key]);
    }
    expect(first.authFile).toBe(first.envAuthFile);
    expect(second.authFile).toBe(second.envAuthFile);
    expect(firstConfig.use?.baseURL).toBe("http://127.0.0.1:18491");
    expect(secondConfig.use?.baseURL).toBe("http://127.0.0.1:18492");
    expect(process.env.API_URL).toBe("http://127.0.0.1:18492");
  });

  test("rejects unsafe run identities and keeps consumers on resolved paths", async () => {
    await expect(
      loadDockerConfig({
        BASE_URL: "http://127.0.0.1:18493",
        PLAYWRIGHT_RUN_ID: "../shared",
      }),
    ).rejects.toThrow(/PLAYWRIGHT_RUN_ID/);

    const authSetup = fs.readFileSync(dockerAuthSetupPath, "utf8");
    const analyticsApi = fs.readFileSync(dockerAnalyticsApiPath, "utf8");
    expect(authSetup).toContain("PLAYWRIGHT_AUTH_FILE");
    expect(authSetup).not.toContain(".playwright");
    expect(analyticsApi).toContain("process.env.API_URL");
    expect(analyticsApi).not.toContain('const BASE_URL = "http://localhost:1349"');
  });
});

describe("local analytics Playwright isolation", () => {
  test("binds exact backing state to the validated run and tears it down after API shutdown", async () => {
    const config = await loadAnalyticsLocalConfig({
      PLAYWRIGHT_API_PORT: "18490",
      PLAYWRIGHT_API_URL: "http://127.0.0.1:18490",
      PLAYWRIGHT_RUN_ID: "analytics_backing_contract",
      PLAYWRIGHT_WEB_PORT: "28490",
      PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28490",
    });
    const [apiServer] = config.webServer as Array<{
      command: string;
      env: Record<string, string>;
      gracefulShutdown?: { signal: string; timeout: number };
    }>;
    const databaseName = new URL(apiServer.env.DATABASE_URL).pathname.slice(1);

    expect(databaseName).toMatch(/^snapotter_e2e_analytics_local_[a-f0-9]{24}$/);
    expect(apiServer.env.BULLMQ_PREFIX).toBe(databaseName);
    expect(apiServer.command).toContain(
      "node tests/playwright-api-lifecycle.mjs analytics_backing_contract analytics-local -- pnpm",
    );
    expect(apiServer.command).not.toContain("e2e-pg-create-db.cjs");
    expect(apiServer.gracefulShutdown).toEqual({ signal: "SIGTERM", timeout: 30_000 });
  });

  test("uses exact run-scoped endpoints and artifacts without reusing servers", async () => {
    const config = await loadAnalyticsLocalConfig({
      PLAYWRIGHT_API_PORT: "18494",
      PLAYWRIGHT_API_URL: "http://127.0.0.1:18494",
      PLAYWRIGHT_RUN_ID: "analytics_local_a",
      PLAYWRIGHT_WEB_PORT: "28494",
      PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28494",
    });
    const [apiServer, webServer] = config.webServer as Array<{
      env: Record<string, string>;
      reuseExistingServer: boolean;
      url?: string;
    }>;
    const chromium = config.projects?.find((project) => project.name === "chromium");
    const reporter = config.reporter as Array<[string, { outputFolder?: string }]>;

    for (const value of [
      chromium?.use?.storageState,
      process.env.PLAYWRIGHT_AUTH_FILE,
      process.env.PLAYWRIGHT_RUN_ROOT,
      config.outputDir,
      reporter[0]?.[1]?.outputFolder,
    ]) {
      expect(value).toContain("analytics_local_a");
    }
    expect(chromium?.use?.storageState).toBe(process.env.PLAYWRIGHT_AUTH_FILE);
    expect(config.use?.baseURL).toBe("http://127.0.0.1:28494");
    expect(process.env.API_URL).toBe("http://127.0.0.1:18494");
    expect(apiServer.url).toBe("http://127.0.0.1:18494/api/v1/health");
    expect(apiServer.env.PORT).toBe("18494");
    expect(apiServer.reuseExistingServer).toBe(false);
    expect(webServer.url).toBe("http://127.0.0.1:28494");
    expect(webServer.env.PORT).toBe("28494");
    expect(webServer.env.VITE_API_URL).toBe("http://127.0.0.1:18494");
    expect(webServer.reuseExistingServer).toBe(false);
  });

  test("generates unique endpoints, rejects unsafe IDs, and keeps auth setup run-scoped", async () => {
    const first = await loadAnalyticsLocalConfig({ PLAYWRIGHT_RUN_ID: "analytics_auto_a" });
    const firstEndpoints = [process.env.API_URL, first.use?.baseURL];
    const second = await loadAnalyticsLocalConfig({ PLAYWRIGHT_RUN_ID: "analytics_auto_b" });
    const secondEndpoints = [process.env.API_URL, second.use?.baseURL];

    expect(firstEndpoints[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(firstEndpoints[1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(secondEndpoints).not.toEqual(firstEndpoints);
    await expect(loadAnalyticsLocalConfig({ PLAYWRIGHT_RUN_ID: "../shared" })).rejects.toThrow(
      /PLAYWRIGHT_RUN_ID/,
    );

    const configSource = fs.readFileSync(analyticsLocalConfigPath, "utf8");
    const authSetup = fs.readFileSync(analyticsLocalAuthSetupPath, "utf8");
    expect(configSource).not.toMatch(/(?:TEST_API_PORT\s*=\s*13491|TEST_WEB_PORT\s*=\s*2350)/);
    expect(configSource).not.toContain("reuseExistingServer: !process.env.CI");
    expect(authSetup).toContain("PLAYWRIGHT_AUTH_FILE");
    expect(authSetup).not.toContain('"test-results", ".auth"');
  });
});

test("the canonical E2E command exactly covers every release browser and device project", async () => {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
    scripts: Record<string, string>;
  };
  expect(packageJson.scripts["test:e2e"]).toBe("node scripts/run-main-e2e.mjs");
  expect(packageJson.scripts["test:all"]).toContain("pnpm test:e2e");

  const darwinPlan = JSON.parse(
    execFileSync(process.execPath, [e2eRunnerPath, "--plan", "darwin"], { encoding: "utf8" }),
  ) as string[][];
  const linuxPlan = JSON.parse(
    execFileSync(process.execPath, [e2eRunnerPath, "--plan", "linux"], { encoding: "utf8" }),
  ) as string[][];
  const selectedProjects = darwinPlan
    .flat()
    .flatMap((arg) => (arg.startsWith("--project=") ? [arg.slice("--project=".length)] : []));
  const config = await loadConfig({
    PLAYWRIGHT_API_PORT: "18129",
    PLAYWRIGHT_API_URL: "http://127.0.0.1:18129",
    PLAYWRIGHT_RUN_ID: "project_contract",
    PLAYWRIGHT_WEB_PORT: "28129",
    PLAYWRIGHT_WEB_URL: "http://127.0.0.1:28129",
  });
  const configuredProjects = config.projects
    ?.map((project) => project.name)
    .filter((name) => name !== "setup");

  expect(packageJson.scripts["test:e2e:core"]).toBeTruthy();
  expect(packageJson.scripts["test:e2e:visual"]).toBe(
    "playwright test --project=chromium-visual --project=chromium-legacy-visual",
  );
  expect(new Set(selectedProjects)).toEqual(new Set(configuredProjects));
  expect(selectedProjects).toHaveLength(configuredProjects?.length ?? 0);

  // Visual lanes are filesystem-derived PER PROJECT. The maintained visual
  // baselines (gui-visual-*, device-visual) exist for darwin and, since the
  // #172 branch, linux. The legacy matrix (visual-regression.spec.ts) is
  // darwin-only on purpose: the update-visual-baselines workflow does not
  // regenerate it, so a platform with maintained baselines but no legacy
  // ones must run chromium-visual and skip chromium-legacy-visual instead
  // of failing every legacy comparison on a missing snapshot.
  expect(darwinPlan.flat()).toContain("--project=chromium-visual");
  expect(darwinPlan.flat()).toContain("--project=chromium-legacy-visual");
  expect(darwinPlan[0]).not.toContain("--grep-invert=@visual");
  expect(linuxPlan.flat()).toContain("--project=chromium-visual");
  expect(linuxPlan.flat()).not.toContain("--project=chromium-legacy-visual");
  expect(linuxPlan[0]).not.toContain("--grep-invert=@visual");
  expect(linuxPlan[1]).toEqual(["test", "--project=chromium-serial", "--workers=1"]);

  // A platform with no baselines at all (win32 today) skips every visual
  // comparison: @visual grep-inverted in the standard run, no visual lane.
  const win32Plan = JSON.parse(
    execFileSync(process.execPath, [e2eRunnerPath, "--plan", "win32"], { encoding: "utf8" }),
  ) as string[][];
  expect(win32Plan[0]).toContain("--grep-invert=@visual");
  expect(win32Plan.flat()).not.toContain("--project=chromium-visual");
  expect(win32Plan.flat()).not.toContain("--project=chromium-legacy-visual");
  expect(win32Plan).toHaveLength(2);
});

test("Vitest excludes every Playwright spec directory", () => {
  const config = fs.readFileSync(vitestConfigPath, "utf8");
  const playwrightDirs = fs
    .readdirSync(path.join(root, "tests"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^e2e(-|$)/.test(entry.name))
    .map((entry) => entry.name);

  // Reading the directory rather than listing names keeps this honest: adding
  // a new browser suite fails here until vitest.config.ts learns to skip it.
  // Without the exclusion a bare `vitest run` imports @playwright/test and the
  // whole unit lane dies on a spec it was never meant to collect.
  expect(playwrightDirs.length).toBeGreaterThan(0);
  for (const dir of playwrightDirs) {
    expect(config, `vitest.config.ts must exclude tests/${dir}`).toContain(`"tests/${dir}/**"`);
  }
});

test("Firefox and WebKit collect the supported cross-browser core suite", () => {
  for (const project of ["firefox", "webkit"]) {
    const output = collectPlaywright(path.join(root, "playwright.config.ts"), [
      `--project=${project}`,
    ]);

    expect(output, project).toContain("gui-cross-browser.spec.ts");
    expect(output, project).toContain("smoke.spec.ts");
    expect(output, project).toContain("navigation.spec.ts");
    expect(output, project).toContain("home-page.spec.ts");
    expect(output, project).toContain("Total: 57 tests in 5 files");
  }
});

test("the dedicated width project owns every required browser width", () => {
  const output = collectPlaywright(path.join(root, "playwright.config.ts"), [
    "--project=chromium-widths",
  ]);

  for (const width of [320, 768, 1024, 1536, 2560]) {
    expect(output).toContain(`${width}px viewport has no horizontal overflow`);
  }
  expect(output).toContain("Total: 6 tests in 2 files");
});

test("legacy visual coverage is runnable only through its dedicated collected project", () => {
  const output = execFileSync(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "tests/e2e/visual-regression.spec.ts",
      "--config",
      path.join(root, "playwright.config.ts"),
      "--project=chromium-legacy-visual",
      "--list",
      "--reporter=json",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PLAYWRIGHT_RUN_ID: "legacy_visual_contract" },
      maxBuffer: 20 * 1024 * 1024,
      stdio: "pipe",
    },
  );
  const report = JSON.parse(output) as { suites: unknown[] };
  const projectTests: Array<{ annotations?: Array<{ type?: string }>; projectName?: string }> = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.projectName === "chromium-legacy-visual") {
      projectTests.push(record as { annotations?: Array<{ type?: string }>; projectName?: string });
    }
    for (const entry of Object.values(record)) visit(entry);
  };
  visit(report.suites);

  expect(projectTests).toHaveLength(14);
  expect(
    projectTests.flatMap((entry) => entry.annotations ?? []).some((entry) => entry.type === "skip"),
  ).toBe(false);
});

test("Turbo passes every main harness endpoint override through task boundaries", () => {
  const turbo = JSON.parse(fs.readFileSync(turboPath, "utf8")) as {
    globalPassThroughEnv: string[];
  };

  expect(turbo.globalPassThroughEnv).toEqual(
    expect.arrayContaining([
      "API_URL",
      "E2E_PG_BASE_URL",
      "PLAYWRIGHT_API_PORT",
      "PLAYWRIGHT_API_URL",
      "PLAYWRIGHT_AUTH_FILE",
      "PLAYWRIGHT_RUN_ID",
      "PLAYWRIGHT_RUN_ROOT",
      "PLAYWRIGHT_WEB_PORT",
      "PLAYWRIGHT_WEB_URL",
      "PW_WORKERS",
      "REDIS_URL",
    ]),
  );
});
