import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const root = process.cwd();
const envKeys = [
  "EDITOR_TEST_PORT",
  "PLAYWRIGHT_DEMO_PORT",
  "PLAYWRIGHT_DEMO_URL",
  "PLAYWRIGHT_DOCS_PORT",
  "PLAYWRIGHT_DOCS_URL",
  "PLAYWRIGHT_EDITOR_API_PORT",
  "PLAYWRIGHT_EDITOR_API_URL",
  "PLAYWRIGHT_EDITOR_WEB_PORT",
  "PLAYWRIGHT_EDITOR_WEB_URL",
  "PLAYWRIGHT_LANDING_PORT",
  "PLAYWRIGHT_LANDING_URL",
  "PLAYWRIGHT_RUN_ID",
  "PLAYWRIGHT_RUN_ROOT",
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.resetModules();
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function loadConfig(modulePath: string, overrides: Record<string, string>) {
  for (const key of envKeys) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
  vi.resetModules();
  return (await import(modulePath)).default;
}

function expectScopedArtifacts(
  config: { outputDir?: string; reporter?: unknown },
  runId: string,
  scope: string,
) {
  const reporters = config.reporter as Array<[string, Record<string, string>]>;
  const serialized = JSON.stringify(reporters);

  expect(config.outputDir).toContain(path.join("test-results", "e2e-runs", runId, scope));
  expect(serialized).toContain(path.join("test-results", "e2e-runs", runId, scope));
  expect(serialized).not.toContain(path.join("test-results", "qa-report"));
  expect(serialized).not.toContain(path.join("docs", "qa"));
}

describe("surface Playwright harness isolation", () => {
  test("landing and docs use owned IPv4 endpoints and run-scoped artifacts", async () => {
    const landing = await loadConfig("../../playwright.landing.config.js", {
      PLAYWRIGHT_LANDING_PORT: "44351",
      PLAYWRIGHT_RUN_ID: "landing_contract",
    });
    expectScopedArtifacts(landing, "landing_contract", "landing");
    expect(landing.use?.baseURL).toBe("http://127.0.0.1:44351");
    expect(landing.webServer).toMatchObject({
      reuseExistingServer: false,
      url: "http://127.0.0.1:44351",
    });
    expect(landing.webServer).not.toHaveProperty("port");
    expect(landing.webServer.command).toContain("&& exec pnpm exec astro preview");

    const docs = await loadConfig("../../playwright.docs.config.js", {
      PLAYWRIGHT_DOCS_PORT: "44173",
      PLAYWRIGHT_RUN_ID: "docs_contract",
    });
    expectScopedArtifacts(docs, "docs_contract", "docs");
    expect(docs.use?.baseURL).toBe("http://127.0.0.1:44173");
    expect(docs.webServer).toMatchObject({
      reuseExistingServer: false,
      url: "http://127.0.0.1:44173",
    });
    expect(docs.webServer).not.toHaveProperty("port");
    expect(docs.webServer.command).toContain("&& exec pnpm exec vitepress preview");
  });

  test("demo builds and previews on an owned dynamic endpoint", async () => {
    const config = await loadConfig("../../playwright.demo.config.js", {
      PLAYWRIGHT_DEMO_PORT: "44174",
      PLAYWRIGHT_RUN_ID: "demo_contract",
    });
    expectScopedArtifacts(config, "demo_contract", "demo");
    expect(config.use?.baseURL).toBe("http://127.0.0.1:44174");
    expect(config.webServer).toMatchObject({
      reuseExistingServer: false,
      url: "http://127.0.0.1:44174",
    });
    expect(config.webServer.command).toContain("@snapotter/demo build");
    expect(config.webServer.command).toContain("&& exec pnpm");
    expect(config.webServer.command).toContain("--strictPort");
  });

  test("editor owns fresh API, database, storage, and built web resources", async () => {
    const config = await loadConfig("../../playwright.editor.config.js", {
      PLAYWRIGHT_EDITOR_API_PORT: "44191",
      PLAYWRIGHT_EDITOR_WEB_PORT: "45149",
      PLAYWRIGHT_RUN_ID: "editor_contract",
    });
    expectScopedArtifacts(config, "editor_contract", "editor");
    expect(config.use?.baseURL).toBe("http://127.0.0.1:45149");

    const [api, web] = config.webServer as Array<{
      command: string;
      env: Record<string, string>;
      gracefulShutdown?: { signal: string; timeout: number };
      reuseExistingServer: boolean;
      url: string;
    }>;
    expect(api.url).toBe("http://127.0.0.1:44191/api/v1/health");
    expect(api.reuseExistingServer).toBe(false);
    const databaseName = new URL(api.env.DATABASE_URL).pathname.slice(1);
    expect(databaseName).toMatch(/^snapotter_e2e_editor_[a-f0-9]{24}$/);
    expect(api.env.BULLMQ_PREFIX).toBe(databaseName);
    expect(api.command).toContain(
      "node tests/playwright-api-lifecycle.mjs editor_contract editor -- pnpm",
    );
    expect(api.command).not.toContain("e2e-pg-create-db.cjs");
    expect(api.gracefulShutdown).toEqual({ signal: "SIGTERM", timeout: 30_000 });
    for (const key of ["DATA_DIR", "FILES_STORAGE_PATH", "WORKSPACE_PATH"]) {
      expect(api.env[key]).toContain(path.join("editor_contract", "editor"));
    }
    expect(web.url).toBe("http://127.0.0.1:45149");
    expect(web.reuseExistingServer).toBe(false);
    expect(web.command).toContain("@snapotter/web build");
    expect(web.command).toContain("&& exec pnpm");
    expect(web.command).toContain("--strictPort");
    expect(web.env.VITE_API_URL).toBe("http://127.0.0.1:44191");
  });

  test("rejects path-traversing run identities", async () => {
    await expect(
      loadConfig("../../playwright.landing.config.js", {
        PLAYWRIGHT_LANDING_PORT: "44352",
        PLAYWRIGHT_RUN_ID: "../shared",
      }),
    ).rejects.toThrow(/PLAYWRIGHT_RUN_ID/);
  });
});

test("production QA configs keep all reports and output inside their run scope", async () => {
  const qa = await loadConfig("../qa/playwright.qa.config.js", {
    PLAYWRIGHT_RUN_ID: "production_qa_contract",
  });
  expectScopedArtifacts(qa, "production_qa_contract", "production-qa");

  const editorQa = await loadConfig("../qa/playwright.editor-qa.config.js", {
    PLAYWRIGHT_RUN_ID: "production_editor_contract",
  });
  expectScopedArtifacts(editorQa, "production_editor_contract", "production-editor-qa");
});

test("editor diagnostic screenshots use Playwright-owned test output", () => {
  const source = fs.readFileSync(
    path.join(root, "tests/e2e-editor/editor-full-gui-test.spec.ts"),
    "utf8",
  );
  expect(source).toContain("testInfo.outputPath");
  expect(source).not.toContain('path.join(__dirname, "screenshots")');
});

test("docs Playwright collection includes explicit Axe coverage", () => {
  const output = execFileSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", "playwright.docs.config.ts", "--list"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PLAYWRIGHT_RUN_ID: "docs_a11y_contract" },
      maxBuffer: 10 * 1024 * 1024,
      stdio: "pipe",
    },
  );

  expect(output).toContain("a11y.spec.ts");
  for (const pageName of ["homepage", "getting started", "configuration", "REST API"]) {
    expect(output).toContain(`${pageName} has no Axe violations`);
  }
  expect(output).toContain("Total: 53 tests in 6 files");
});

test("Turbo passes surface harness overrides through task boundaries", () => {
  const turbo = JSON.parse(fs.readFileSync(path.join(root, "turbo.json"), "utf8")) as {
    globalPassThroughEnv: string[];
  };
  expect(turbo.globalPassThroughEnv).toEqual(
    expect.arrayContaining([
      "EDITOR_TEST_PORT",
      "PLAYWRIGHT_DEMO_PORT",
      "PLAYWRIGHT_DEMO_URL",
      "PLAYWRIGHT_DOCS_PORT",
      "PLAYWRIGHT_DOCS_URL",
      "PLAYWRIGHT_EDITOR_API_PORT",
      "PLAYWRIGHT_EDITOR_API_URL",
      "PLAYWRIGHT_EDITOR_WEB_PORT",
      "PLAYWRIGHT_EDITOR_WEB_URL",
      "PLAYWRIGHT_LANDING_PORT",
      "PLAYWRIGHT_LANDING_URL",
      "QA_RETRIES",
      "QA_WORKERS",
    ]),
  );
});
