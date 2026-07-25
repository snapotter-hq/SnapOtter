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
const packagePath = path.join(root, "package.json");
const e2eRunnerPath = path.join(root, "scripts", "run-main-e2e.mjs");
const turboPath = path.join(root, "turbo.json");

const isolationEnvKeys = [
  "API_URL",
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

test("Docker E2E specs collect with tracked fixture references", () => {
  const output = execFileSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", dockerPlaywrightConfigPath, "--list"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        BASE_URL: "http://127.0.0.1:1349",
        CI: "1",
        PLAYWRIGHT_RUN_ID: "docker_fixture_contract",
      },
      maxBuffer: 10 * 1024 * 1024,
      stdio: "pipe",
    },
  );

  expect(output).toMatch(/Total: \d+ tests in \d+ files/);
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
  expect(new Set(selectedProjects)).toEqual(new Set(configuredProjects));
  expect(selectedProjects).toHaveLength(configuredProjects?.length ?? 0);
  expect(linuxPlan.flat()).not.toContain("--project=chromium-visual");
  expect(linuxPlan[0]).toContain("--grep-invert=@visual");
  expect(linuxPlan[1]).toEqual(["test", "--project=chromium-serial", "--workers=1"]);
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
