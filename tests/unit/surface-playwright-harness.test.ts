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

/**
 * The release contract is that a public-surface suite tests the artifact we ship,
 * which is the emitted static output. A dev server applies its own transforms and
 * serves routes the build never writes, so a suite pointed at one can pass over a
 * broken build. The landing harness ran `astro dev` until a QA sweep caught it.
 */
describe("surface harnesses serve built output, never a dev server", () => {
  const DEV_SERVERS = ["astro dev", "vitepress dev", "vite dev", "vite serve", "pnpm dev"];

  test.each([
    ["landing", "../../playwright.landing.config.js", "PLAYWRIGHT_LANDING_PORT", "44361", "build"],
    ["docs", "../../playwright.docs.config.js", "PLAYWRIGHT_DOCS_PORT", "44362", "docs:build"],
    ["demo", "../../playwright.demo.config.js", "PLAYWRIGHT_DEMO_PORT", "44363", "build"],
  ])("%s builds before it serves", async (scope, modulePath, portKey, port, buildScript) => {
    const config = await loadConfig(modulePath, {
      [portKey]: port,
      PLAYWRIGHT_RUN_ID: `${scope}_built_output`,
    });
    const command = (config.webServer as { command: string }).command;

    for (const dev of DEV_SERVERS) {
      expect(command, `${scope} harness must not run "${dev}"`).not.toContain(dev);
    }
    // Order matters, not just presence: serving has to come after building.
    const buildAt = command.indexOf(buildScript);
    const serveAt = command.indexOf("preview");
    expect(buildAt, `${scope} harness never builds`).toBeGreaterThanOrEqual(0);
    expect(serveAt, `${scope} harness never serves a preview`).toBeGreaterThan(buildAt);
    expect(command).toContain("&&");
  });

  /**
   * Building before serving only helps if the harness waits long enough for the
   * build to finish. `vitepress build` over ~3,800 pages plus Pagefind indexing
   * runs about two minutes on a warm machine, so a 120s startup budget failed the
   * whole docs suite with "Timed out waiting 120000ms from config.webServer"
   * before a single test ran. This is a startup ceiling, not a per-test timeout,
   * so a generous value costs nothing when the server comes up quickly.
   */
  test("each harness allows enough startup time to finish its build", async () => {
    const budgets: Array<[string, string, string, string, number]> = [
      [
        "landing",
        "../../playwright.landing.config.js",
        "PLAYWRIGHT_LANDING_PORT",
        "44371",
        120_000,
      ],
      ["docs", "../../playwright.docs.config.js", "PLAYWRIGHT_DOCS_PORT", "44372", 300_000],
      ["demo", "../../playwright.demo.config.js", "PLAYWRIGHT_DEMO_PORT", "44373", 60_000],
    ];
    for (const [scope, modulePath, portKey, port, minimum] of budgets) {
      const config = await loadConfig(modulePath, {
        [portKey]: port,
        PLAYWRIGHT_RUN_ID: `${scope}_startup_budget`,
      });
      const { timeout } = config.webServer as { timeout: number };
      expect(timeout, `${scope} harness startup budget`).toBeGreaterThanOrEqual(minimum);
    }
  });

  /**
   * A docs fixture once did `rm -rf` on the German locale and regenerated it, so
   * running the suite rewrote 182 tracked translation files. A harness that edits
   * tracked content cannot be trusted to report on it.
   */
  test("the docs harness runs no fixture script that could rewrite tracked content", async () => {
    const config = await loadConfig("../../playwright.docs.config.js", {
      PLAYWRIGHT_DOCS_PORT: "44364",
      PLAYWRIGHT_RUN_ID: "docs_no_seed",
    });
    const command = (config.webServer as { command: string }).command;
    expect(command).not.toMatch(/seed-|fixtures\//);
    expect(command).not.toMatch(/\brm\b/);
    expect(fs.existsSync(path.join(root, "tests/e2e-docs/fixtures"))).toBe(false);
  });
});

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
    // Intent, not the script name: the editor harness has to build the web app and
    // then preview what it built. Pinning the literal "@snapotter/web build" broke
    // the moment the command moved to an explicit `vite build --outDir`, which was
    // an isolation improvement rather than a regression.
    const webBuildAt = web.command.indexOf("vite build");
    const webServeAt = web.command.indexOf("vite preview");
    expect(webBuildAt, "editor harness never builds the web app").toBeGreaterThanOrEqual(0);
    expect(webServeAt, "editor harness never previews its build").toBeGreaterThan(webBuildAt);
    expect(web.command).not.toContain("vite dev");
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
  expect(output).toContain("Total: 100 tests in 7 files");
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
