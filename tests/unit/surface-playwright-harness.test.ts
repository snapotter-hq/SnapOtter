import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const root = process.cwd();
const envKeys = [
  "API_URL",
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
  "PLAYWRIGHT_NOAUTH_API_PORT",
  "PLAYWRIGHT_NOAUTH_API_URL",
  "PLAYWRIGHT_NOAUTH_WEB_PORT",
  "PLAYWRIGHT_NOAUTH_WEB_URL",
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
    expect(landing.webServer.command).toContain("--host 127.0.0.1 --port 44351 --strictPort");

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
    expect(docs.webServer.command).toContain("--host 127.0.0.1 --port 44173 --strictPort");
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

  test("noauth owns fresh API, database, storage, and built web resources with AUTH_ENABLED=false", async () => {
    const config = await loadConfig("../../playwright.noauth.config.js", {
      PLAYWRIGHT_NOAUTH_API_PORT: "44192",
      PLAYWRIGHT_NOAUTH_WEB_PORT: "45150",
      PLAYWRIGHT_RUN_ID: "noauth_contract",
    });
    expectScopedArtifacts(config, "noauth_contract", "noauth");
    expect(config.use?.baseURL).toBe("http://127.0.0.1:45150");
    expect(process.env.API_URL).toBe("http://127.0.0.1:44192");

    const [api, web] = config.webServer as Array<{
      command: string;
      env: Record<string, string>;
      gracefulShutdown?: { signal: string; timeout: number };
      reuseExistingServer: boolean;
      url: string;
    }>;
    expect(api.url).toBe("http://127.0.0.1:44192/api/v1/health");
    expect(api.reuseExistingServer).toBe(false);
    expect(api.env.AUTH_ENABLED).toBe("false");
    const databaseName = new URL(api.env.DATABASE_URL).pathname.slice(1);
    expect(databaseName).toMatch(/^snapotter_e2e_noauth_[a-f0-9]{24}$/);
    expect(api.env.BULLMQ_PREFIX).toBe(databaseName);
    expect(api.command).toContain(
      "node tests/playwright-api-lifecycle.mjs noauth_contract noauth -- pnpm",
    );
    expect(api.gracefulShutdown).toEqual({ signal: "SIGTERM", timeout: 30_000 });
    for (const key of ["DATA_DIR", "FILES_STORAGE_PATH", "WORKSPACE_PATH"]) {
      expect(api.env[key]).toContain(path.join("noauth_contract", "noauth"));
    }
    expect(web.url).toBe("http://127.0.0.1:45150");
    expect(web.reuseExistingServer).toBe(false);
    const webBuildAt = web.command.indexOf("vite build");
    const webServeAt = web.command.indexOf("vite preview");
    expect(webBuildAt).toBeGreaterThanOrEqual(0);
    expect(webServeAt).toBeGreaterThan(webBuildAt);
    expect(web.command).toContain("--strictPort");
    expect(web.env.VITE_API_URL).toBe("http://127.0.0.1:44192");
  });

  test("keeps default ports disjoint and below the Linux ephemeral range (32768) across all surface configs", async () => {
    const actualCrypto = await import("node:crypto");
    const randomIntCalls: Array<[number, number]> = [];
    vi.doMock("node:crypto", () => ({
      ...actualCrypto,
      randomInt: (min: number, max: number) => {
        randomIntCalls.push([min, max]);
        return max - 1;
      },
    }));
    try {
      const editorConfig = await loadConfig("../../playwright.editor.config.js", {});
      expect(process.env.PLAYWRIGHT_EDITOR_API_PORT).toBe("21999");
      expect(process.env.PLAYWRIGHT_EDITOR_WEB_PORT).toBe("29999");
      expect(process.env.EDITOR_TEST_PORT).toBe("29999");
      expect(process.env.API_URL).toBe("http://127.0.0.1:21999");
      expect(editorConfig.use?.baseURL).toBe("http://127.0.0.1:29999");

      const noauthConfig = await loadConfig("../../playwright.noauth.config.js", {});
      expect(process.env.PLAYWRIGHT_NOAUTH_API_PORT).toBe("21999");
      expect(process.env.PLAYWRIGHT_NOAUTH_WEB_PORT).toBe("29999");
      expect(process.env.API_URL).toBe("http://127.0.0.1:21999");
      expect(noauthConfig.use?.baseURL).toBe("http://127.0.0.1:29999");

      const landingConfig = await loadConfig("../../playwright.landing.config.js", {});
      expect(process.env.PLAYWRIGHT_LANDING_PORT).toBe("29999");
      expect(landingConfig.use?.baseURL).toBe("http://127.0.0.1:29999");

      const docsConfig = await loadConfig("../../playwright.docs.config.js", {});
      expect(process.env.PLAYWRIGHT_DOCS_PORT).toBe("29999");
      expect(docsConfig.use?.baseURL).toBe("http://127.0.0.1:29999");

      const demoConfig = await loadConfig("../../playwright.demo.config.js", {});
      expect(process.env.PLAYWRIGHT_DEMO_PORT).toBe("29999");
      expect(demoConfig.use?.baseURL).toBe("http://127.0.0.1:29999");

      expect(randomIntCalls).toEqual([
        [15_000, 22_000],
        [23_000, 30_000],
        [15_000, 22_000],
        [23_000, 30_000],
        [23_000, 30_000],
        [23_000, 30_000],
        [23_000, 30_000],
      ]);
    } finally {
      vi.doUnmock("node:crypto");
    }

    for (let i = 0; i < 25; i += 1) {
      for (const [modulePath, apiPortKey, apiUrlKey, webPortKey, webUrlKey] of [
        [
          "../../playwright.editor.config.js",
          "PLAYWRIGHT_EDITOR_API_PORT",
          "PLAYWRIGHT_EDITOR_API_URL",
          "PLAYWRIGHT_EDITOR_WEB_PORT",
          "PLAYWRIGHT_EDITOR_WEB_URL",
        ],
        [
          "../../playwright.noauth.config.js",
          "PLAYWRIGHT_NOAUTH_API_PORT",
          "PLAYWRIGHT_NOAUTH_API_URL",
          "PLAYWRIGHT_NOAUTH_WEB_PORT",
          "PLAYWRIGHT_NOAUTH_WEB_URL",
        ],
      ] as const) {
        const config = await loadConfig(modulePath, {});
        const apiPort = Number(process.env[apiPortKey]);
        const webPort = Number(process.env[webPortKey]);

        expect(apiPort).toBeGreaterThanOrEqual(15_000);
        expect(apiPort).toBeLessThan(22_000);
        expect(webPort).toBeGreaterThanOrEqual(23_000);
        expect(webPort).toBeLessThan(30_000);
        expect(webPort).toBeLessThan(32_768);
        expect(process.env[apiUrlKey]).toBe(`http://127.0.0.1:${apiPort}`);
        expect(process.env[webUrlKey]).toBe(`http://127.0.0.1:${webPort}`);
        expect(config.use?.baseURL).toBe(`http://127.0.0.1:${webPort}`);
      }

      for (const [modulePath, portKey, urlKey] of [
        ["../../playwright.landing.config.js", "PLAYWRIGHT_LANDING_PORT", "PLAYWRIGHT_LANDING_URL"],
        ["../../playwright.docs.config.js", "PLAYWRIGHT_DOCS_PORT", "PLAYWRIGHT_DOCS_URL"],
        ["../../playwright.demo.config.js", "PLAYWRIGHT_DEMO_PORT", "PLAYWRIGHT_DEMO_URL"],
      ] as const) {
        const config = await loadConfig(modulePath, {});
        const port = Number(process.env[portKey]);

        expect(port).toBeGreaterThanOrEqual(23_000);
        expect(port).toBeLessThan(30_000);
        expect(port).toBeLessThan(32_768);
        expect(process.env[urlKey]).toBe(`http://127.0.0.1:${port}`);
        expect(config.use?.baseURL).toBe(`http://127.0.0.1:${port}`);
      }
    }
  });

  test("derives surface endpoint ports from URL overrides and rejects malformed overrides", async () => {
    const legacyEditorPort = await loadConfig("../../playwright.editor.config.js", {
      EDITOR_TEST_PORT: "29150",
      PLAYWRIGHT_EDITOR_API_PORT: "19150",
    });
    expect(process.env.PLAYWRIGHT_EDITOR_WEB_PORT).toBe("29150");
    expect(legacyEditorPort.use?.baseURL).toBe("http://127.0.0.1:29150");

    const urlOverrideConfig = await loadConfig("../../playwright.noauth.config.js", {
      PLAYWRIGHT_NOAUTH_API_URL: "http://localhost:19151",
      PLAYWRIGHT_NOAUTH_WEB_URL: "http://localhost:29151",
    });
    expect(process.env.PLAYWRIGHT_NOAUTH_API_PORT).toBe("19151");
    expect(process.env.PLAYWRIGHT_NOAUTH_WEB_PORT).toBe("29151");
    expect(urlOverrideConfig.use?.baseURL).toBe("http://localhost:29151");

    const matchingPortAndUrlConfig = await loadConfig("../../playwright.landing.config.js", {
      PLAYWRIGHT_LANDING_PORT: "28150",
      PLAYWRIGHT_LANDING_URL: "http://localhost:28150",
    });
    expect(process.env.PLAYWRIGHT_LANDING_PORT).toBe("28150");
    expect(process.env.PLAYWRIGHT_LANDING_URL).toBe("http://localhost:28150");
    expect(matchingPortAndUrlConfig.use?.baseURL).toBe("http://localhost:28150");

    await expect(
      loadConfig("../../playwright.landing.config.js", { PLAYWRIGHT_LANDING_PORT: "not-a-port" }),
    ).rejects.toThrow(/PLAYWRIGHT_LANDING_PORT must be an integer port/);
    await expect(
      loadConfig("../../playwright.docs.config.js", { PLAYWRIGHT_DOCS_PORT: "1023" }),
    ).rejects.toThrow(/PLAYWRIGHT_DOCS_PORT must be between 1024 and 65535/);
    await expect(
      loadConfig("../../playwright.docs.config.js", { PLAYWRIGHT_DOCS_PORT: "65536" }),
    ).rejects.toThrow(/PLAYWRIGHT_DOCS_PORT must be between 1024 and 65535/);
    await expect(
      loadConfig("../../playwright.demo.config.js", {
        PLAYWRIGHT_DEMO_URL: "https://127.0.0.1:28150",
      }),
    ).rejects.toThrow(/PLAYWRIGHT_DEMO_URL must use http/);
    await expect(
      loadConfig("../../playwright.landing.config.js", {
        PLAYWRIGHT_LANDING_URL: "http://192.168.1.10:28150",
      }),
    ).rejects.toThrow(/PLAYWRIGHT_LANDING_URL must use a loopback host/);
    await expect(
      loadConfig("../../playwright.docs.config.js", {
        PLAYWRIGHT_DOCS_URL: "http://127.0.0.1:28150/subpath",
      }),
    ).rejects.toThrow(
      /PLAYWRIGHT_DOCS_URL must be an origin without credentials, path, query, or hash/,
    );
    await expect(
      loadConfig("../../playwright.demo.config.js", { PLAYWRIGHT_DEMO_URL: "http://localhost" }),
    ).rejects.toThrow(/PLAYWRIGHT_DEMO_URL must be between 1024 and 65535, received "80"/);
    await expect(
      loadConfig("../../playwright.landing.config.js", {
        PLAYWRIGHT_LANDING_PORT: "28150",
        PLAYWRIGHT_LANDING_URL: "http://127.0.0.1:28151",
      }),
    ).rejects.toThrow(/PLAYWRIGHT_LANDING_PORT must match the port in PLAYWRIGHT_LANDING_URL/);
  });

  test("rejects path-traversing run identities and invalid scopes", async () => {
    await expect(
      loadConfig("../../playwright.landing.config.js", {
        PLAYWRIGHT_LANDING_PORT: "44352",
        PLAYWRIGHT_RUN_ID: "../shared",
      }),
    ).rejects.toThrow(/PLAYWRIGHT_RUN_ID/);

    delete process.env.PLAYWRIGHT_RUN_ID;
    const { resolvePlaywrightRun } = await import("../playwright-run.js");
    expect(() => resolvePlaywrightRun(root, "../bad-scope")).toThrow(
      /Playwright run scope is invalid/,
    );
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
