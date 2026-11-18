import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The support bundle zips LOG_DIR, and console.* never writes there (#4178).
// These pin the startup, shutdown and one-off API lines to the pino logger.

const root = resolve(import.meta.dirname, "../../..");

// playwright is a dependency of apps/api only, so the bare specifier does not
// resolve from this file and a vi.doMock("playwright") would silently miss.
const playwrightEntry = resolve(
  dirname(
    realpathSync(createRequire(resolve(root, "apps/api/package.json")).resolve("playwright")),
  ),
  "index.mjs",
);

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  for (const fn of Object.values(loggerMock)) fn.mockClear();
  vi.doMock("../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));
});

afterEach(() => {
  for (const mod of [
    "pg",
    playwrightEntry,
    "drizzle-orm/node-postgres",
    "drizzle-orm/node-postgres/migrator",
    "../../../apps/api/src/config.js",
    "../../../apps/api/src/db/index.js",
    "../../../apps/api/src/db/migrate-from-sqlite.js",
    "../../../apps/api/src/lib/settings-helpers.js",
  ]) {
    vi.doUnmock(mod);
  }
  vi.restoreAllMocks();
});

describe("index.ts console use", () => {
  const source = readFileSync(resolve(root, "apps/api/src/index.ts"), "utf8");

  it("leaves only FATAL exits on the console once LOG_DIR has been checked", () => {
    // Everything before the storage check stays on the console: it runs before
    // LOG_DIR is known to be writable. After it, the only console lines left
    // are the FATAL messages printed right before process.exit(1).
    const anchor = source.indexOf('console.log("Storage and log directories writable");');
    expect(anchor).toBeGreaterThan(0);
    const after = source.slice(anchor + 1);
    const calls = [...after.matchAll(/console\.\w+\([\s\S]*?\);/g)].map((m) =>
      m[0].replace(/\s+/g, " "),
    );

    expect(calls.length).toBeGreaterThan(0);
    // Either the FATAL message itself, or the error printed right after it.
    for (const call of calls) {
      expect(call, call).toMatch(/^console\.error\((\s*[`"]\[?FATAL|err\);$)/);
    }
  });

  it("logs every shutdown step through the logger, with errors in the err field", () => {
    const start = source.indexOf("async function shutdown(signal: string)");
    const end = source.indexOf('process.on("SIGTERM"', start);
    const shutdown = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(shutdown).not.toContain("console.");
    for (const step of ["HTTP server", "workers", "Redis connections", "database"]) {
      expect(shutdown).toContain(`logger.error({ err }, "Error closing ${step}");`);
    }
  });
});

describe("db/index.ts idle client errors", () => {
  it("logs an idle Postgres client error with the error in the err field", async () => {
    const handlers = new Map<string, (err: Error) => void>();
    vi.doMock("pg", () => ({
      default: {
        Pool: class {
          on(event: string, handler: (err: Error) => void) {
            handlers.set(event, handler);
            return this;
          }
        },
      },
    }));
    await import("../../../apps/api/src/db/index.js");

    const boom = new Error("terminating connection due to administrator command");
    handlers.get("error")?.(boom);

    expect(loggerMock.error).toHaveBeenCalledWith(
      { err: boom },
      "Unexpected idle Postgres client error",
    );
  });
});

describe("browser-service crash limit", () => {
  it("logs once when repeated launch failures disable the browser service", async () => {
    vi.doMock(playwrightEntry, () => ({
      chromium: {
        launch: vi.fn().mockRejectedValue(new Error("chromium missing")),
        executablePath: () => "/nonexistent/chromium",
      },
    }));
    const { captureHtml } = await import("../../../apps/api/src/lib/browser-service.js");
    const options = {
      format: "png" as const,
      quality: 80,
      fullPage: false,
      viewportWidth: 800,
      viewportHeight: 600,
    };

    // The first failure starts a backoff, and every call inside it counts as
    // another crash, so five calls in a row reach the limit.
    for (let i = 0; i < 5; i++) {
      await expect(captureHtml("<p>hi</p>", options)).rejects.toThrow();
    }

    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Browser service permanently disabled after 5 crashes in 60s",
    );
  });
});

describe("db/migrate.ts single-role warning", () => {
  it("warns through the logger when both URLs name the same role", async () => {
    const release = vi.fn();
    vi.doMock("../../../apps/api/src/config.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../../apps/api/src/config.js")>();
      return {
        ...actual,
        env: {
          ...actual.env,
          DATABASE_URL: "postgres://snapotter:pw@db:5432/snapotter",
          DATABASE_MIGRATION_URL: "postgres://snapotter:pw@db:5432/snapotter",
        },
      };
    });
    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      pool: { connect: vi.fn().mockResolvedValue({ release }) },
    }));
    vi.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: () => ({ execute: vi.fn().mockResolvedValue(undefined) }),
    }));
    vi.doMock("drizzle-orm/node-postgres/migrator", () => ({
      migrate: vi.fn().mockResolvedValue(undefined),
    }));
    const { runMigrations } = await import("../../../apps/api/src/db/migrate.js");

    await runMigrations();

    expect(release).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "DATABASE_MIGRATION_URL names the same role as DATABASE_URL, so the privilege split is NOT active. Running single-role.",
    );
  });
});

describe("db/sqlite-import.ts boot import", () => {
  const migrate = vi.hoisted(() => {
    class TargetNonEmptyError extends Error {}
    return { migrateFromSqlite: vi.fn(), TargetNonEmptyError };
  });

  async function loadBootImport(opts: { usersCount: number; marker?: object }) {
    vi.doMock("../../../apps/api/src/db/index.js", () => ({
      db: { execute: vi.fn().mockResolvedValue({ rows: [{ n: opts.usersCount }] }) },
    }));
    vi.doMock("../../../apps/api/src/lib/settings-helpers.js", () => ({
      getSettingString: vi.fn().mockResolvedValue(opts.marker ? JSON.stringify(opts.marker) : ""),
      upsertSetting: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../../apps/api/src/db/migrate-from-sqlite.js", () => ({
      MIGRATED_TABLES: [],
      migrateFromSqlite: migrate.migrateFromSqlite,
      TargetNonEmptyError: migrate.TargetNonEmptyError,
    }));
    const { runBootImport } = await import("../../../apps/api/src/db/sqlite-import.js");
    return runBootImport;
  }

  function emptySqliteFile(): string {
    const path = join(mkdtempSync(join(tmpdir(), "boot-import-log-")), "snapotter.db");
    new Database(path).close();
    return path;
  }

  function bootEnv(source: string) {
    return { SQLITE_MIGRATE_PATH: source, DATA_DIR: dirname(source), FILES_STORAGE_PATH: "/nope" };
  }

  beforeEach(() => {
    migrate.migrateFromSqlite.mockReset();
  });

  it("logs a completed import, and routes the import's own warnings, through the logger", async () => {
    migrate.migrateFromSqlite.mockImplementation(
      async (_path: string, opts: { warn?: (message: string) => void }) => {
        opts.warn?.("detached u-twin-a");
        return { tables: { users: 2 }, detached: [{}] };
      },
    );
    const consoleSpies = ["log", "warn", "error"].map((m) =>
      vi.spyOn(console, m as "log").mockImplementation(() => {}),
    );
    const runBootImport = await loadBootImport({ usersCount: 0 });

    expect(await runBootImport(bootEnv(emptySqliteFile()))).toBe("import");

    expect(loggerMock.info).toHaveBeenCalledWith(
      'Imported 1.x SQLite database: {"tables":{"users":2},"blobs":{"present":0,"missing":0}}; 1 user imported without their SSO identity',
    );
    expect(loggerMock.warn).toHaveBeenCalledWith("detached u-twin-a");
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("logs a lost import race through the logger", async () => {
    migrate.migrateFromSqlite.mockRejectedValue(new migrate.TargetNonEmptyError("non-empty"));
    const runBootImport = await loadBootImport({ usersCount: 0 });

    expect(await runBootImport(bootEnv("/data/snapotter.db"))).toBe("leftover");

    expect(loggerMock.info).toHaveBeenCalledWith(
      "1.x import skipped: another instance populated the database first.",
    );
  });

  it("warns through the logger when the instance already has data", async () => {
    const runBootImport = await loadBootImport({ usersCount: 3 });

    expect(await runBootImport(bootEnv("/data/snapotter.db"))).toBe("locked");

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("a 1.x database was found at /data/snapotter.db"),
    );
    expect(migrate.migrateFromSqlite).not.toHaveBeenCalled();
  });

  it("logs a leftover source through the logger", async () => {
    const runBootImport = await loadBootImport({ usersCount: 3, marker: { status: "completed" } });

    expect(await runBootImport(bootEnv("/data/snapotter.db"))).toBe("leftover");

    expect(loggerMock.info).toHaveBeenCalledWith(
      "1.x import already applied; you may delete /data/snapotter.db.",
    );
  });

  it("keeps the FATAL line on the console before exiting", async () => {
    migrate.migrateFromSqlite.mockRejectedValue(new Error("disk on fire"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const runBootImport = await loadBootImport({ usersCount: 0 });

    await runBootImport(bootEnv("/data/snapotter.db"));

    expect(errorSpy).toHaveBeenCalledWith(
      "FATAL: 1.x SQLite import failed from /data/snapotter.db: disk on fire. No partial data was written.",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
