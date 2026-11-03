import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const LOGGER_PATH = "../../../apps/api/src/lib/logger.js";
const CONFIG_PATH = "../../../apps/api/src/config.js";

const PARTIAL_ENV = { env: { WORKSPACE_PATH: "/tmp/snapotter-logger-test" } };

let logDir: string | undefined;

function stubConfig(env: Record<string, unknown>) {
  vi.doMock(CONFIG_PATH, () => ({ env }));
  vi.resetModules();
}

function fullEnv() {
  logDir = mkdtempSync(join(tmpdir(), "snapotter-logger-"));
  // "debug" rather than pino's default "info", so reading it back proves the
  // stubbed config was what built the instance.
  return { LOG_DIR: logDir, LOG_LEVEL: "debug" };
}

afterEach(() => {
  vi.doUnmock(CONFIG_PATH);
  vi.resetModules();
  if (logDir) rmSync(logDir, { recursive: true, force: true });
  logDir = undefined;
});

describe("logger module load (#1418)", () => {
  it("can be imported under a config stub that has no LOG_DIR", async () => {
    // The partial-env shape ~40 unit suites use. Importing the logger used to
    // run join(env.LOG_DIR, ...) at module scope and throw on undefined.
    stubConfig(PARTIAL_ENV.env);

    await expect(import(LOGGER_PATH)).resolves.toHaveProperty("logger");
  });

  it("names the missing config on the first log call under a partial stub", async () => {
    stubConfig(PARTIAL_ENV.env);
    const { logger } = await import(LOGGER_PATH);

    expect(() => logger.info("first call")).toThrow(/LOG_DIR or LOG_LEVEL.*#1418/);
  });

  it("passes child options through, so a child can swap the err serializer (#1504)", async () => {
    // logErrorWithCauses relies on this to keep AggregateError causes.
    stubConfig(fullEnv());
    const { logger } = await import(LOGGER_PATH);
    const pino = (await import("pino")).default;

    const child = logger.child({}, { serializers: { err: pino.stdSerializers.errWithCause } });

    const serializers = (child as unknown as Record<symbol, Record<string, unknown>>)[
      pino.symbols.serializersSym
    ];
    expect(serializers.err).toBe(pino.stdSerializers.errWithCause);
  });

  it("builds a working pino logger on first use that Fastify accepts as loggerInstance", async () => {
    stubConfig(fullEnv());
    const { logger } = await import(LOGGER_PATH);

    for (const method of ["info", "error", "debug", "fatal", "warn", "trace", "child"] as const) {
      expect(typeof logger[method]).toBe("function");
    }
    expect(logger.level).toBe("debug");
    logger.level = "warn";
    expect(logger.level).toBe("warn");
    logger.level = "debug";

    const child = logger.child({ scope: "test" });
    expect(typeof child.info).toBe("function");

    const app = Fastify({ loggerInstance: logger });
    await app.ready();
    app.log.info("logger-lazy-import test line");
    await app.close();

    // The transport is a worker thread that has to load pino-roll before the
    // first write, so give it room on a loaded host. pino-roll 4 names the
    // first file <LOG_DIR>/snapotter.1.log (its own ".log" fallback; it ignores
    // the configured extension, which happens to be the same).
    const dir = logDir as string;
    await vi.waitFor(
      () => {
        expect(readFileSync(join(dir, "snapotter.1.log"), "utf8")).toContain(
          "logger-lazy-import test line",
        );
      },
      { timeout: 10_000, interval: 100 },
    );
  });

  it("keeps running when the log file cannot be opened (#4203)", async () => {
    // A log file fault used to reach an EventEmitter with no "error" listener
    // and take the whole API down as an uncaught exception (Sentry NODE-4B).
    // A LOG_DIR that is a file fails the open, portably.
    const env = fullEnv();
    const blocked = join(env.LOG_DIR, "not-a-dir");
    writeFileSync(blocked, "");
    stubConfig({ ...env, LOG_DIR: blocked });

    const uncaught: unknown[] = [];
    const onUncaught = (err: unknown) => uncaught.push(err);
    process.on("uncaughtException", onUncaught);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { logger } = await import(LOGGER_PATH);
      logger.info("first line");

      // Wait for whichever way the failure surfaces, a crash or the warning.
      await vi.waitFor(
        () => {
          expect(uncaught.length + errSpy.mock.calls.length).toBeGreaterThan(0);
        },
        { timeout: 10_000, interval: 50 },
      );
      expect(uncaught).toEqual([]);
      expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[logger\] log file .*EEXIST/));

      // Writes after the failure still reach stdout, never throw, and never
      // reach the uncaught path or repeat the warning.
      expect(() => logger.error("after the failure")).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
      expect(uncaught).toEqual([]);
      expect(errSpy).toHaveBeenCalledTimes(1);
    } finally {
      process.off("uncaughtException", onUncaught);
      errSpy.mockRestore();
    }
  });

  // /dev/full fails every write with ENOSPC, the full-disk case from the field.
  it.skipIf(!existsSync("/dev/full"))(
    "keeps running when log file writes fail with ENOSPC (#4203)",
    async () => {
      const env = fullEnv();
      symlinkSync("/dev/full", join(env.LOG_DIR, "snapotter.1.log"));
      stubConfig(env);

      const uncaught: unknown[] = [];
      const onUncaught = (err: unknown) => uncaught.push(err);
      process.on("uncaughtException", onUncaught);
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const { logger } = await import(LOGGER_PATH);
        logger.info("first line");

        await vi.waitFor(
          () => {
            expect(uncaught.length + errSpy.mock.calls.length).toBeGreaterThan(0);
          },
          { timeout: 10_000, interval: 50 },
        );
        // Let any flush timer still queued behind the failure run.
        for (let i = 0; i < 5; i++) logger.info(`after the failure ${i}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(uncaught).toEqual([]);
        expect(errSpy).toHaveBeenCalledTimes(1);
        expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[logger\] log file .*ENOSPC/));
      } finally {
        process.off("uncaughtException", onUncaught);
        errSpy.mockRestore();
      }
    },
  );

  it("lets vi.spyOn intercept calls made through the shared export", async () => {
    // The export has to stay a plain object with own, configurable methods:
    // vi.spyOn installs spies with defineProperty, and
    // tests/integration/platform/engine-unavailable-reporting.test.ts spies on
    // this logger to see the worker's "tool job failed" line.
    stubConfig(fullEnv());
    const { logger } = await import(LOGGER_PATH);

    // mockImplementation keeps the call from reaching pino, so this test
    // doesn't build a transport it never reads.
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    logger.warn({ probe: 1 }, "spied line");
    expect(warnSpy).toHaveBeenCalledWith({ probe: 1 }, "spied line");
    warnSpy.mockRestore();
    expect(vi.isMockFunction(logger.warn)).toBe(false);
  });
});
