import { createRequire } from "node:module";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import pino from "pino";
import { env } from "../config.js";
import { traceMixin } from "./log-trace-mixin.js";

let instance: pino.Logger | undefined;

/** The slice of pino-roll's SonicBoom this module uses (pino-roll ships no types). */
interface RollingFile {
  write(line: string): boolean;
  flushSync(): void;
  on(event: "error", listener: (err: Error) => void): void;
}

type PinoRoll = (options: Record<string, unknown>) => Promise<RollingFile>;

// Lines logged while pino-roll opens the file. Opening is a couple of stat
// calls, so this only guards against a log dir that never answers.
const MAX_PENDING_LINES = 10_000;

/**
 * Adds the rolling log file to `streams`, written in this thread.
 *
 * It used to be a pino transport. Its worker died on a full disk and took the
 * API with it, twice over: the ENOSPC came back as an "error" event nobody
 * listened for, and thread-stream then threw a RangeError from its own flush
 * timer (Sentry NODE-4B, #4203). Now a failed write drops the file stream, says
 * so once on stderr, and stdout logging carries on.
 */
function attachLogFile(streams: pino.MultiStreamRes<string>, file: string): void {
  const pending: string[] = [];
  let target: RollingFile | undefined;
  let failed = false;

  // Once the file fails, writes land nowhere: `failed` is set and `target` is
  // cleared, so this entry stays in `streams` as a no-op.
  streams.add({
    level: "trace",
    stream: {
      write(line: string) {
        if (target) target.write(line);
        else if (!failed && pending.length < MAX_PENDING_LINES) pending.push(line);
      },
    },
  });

  const fail = (err: unknown) => {
    if (failed) return;
    failed = true;
    target = undefined;
    pending.length = 0;
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `[logger] log file writes stopped, logging to stdout only until restart: ${reason}`,
    );
  };

  const pinoRoll = createRequire(import.meta.url)("pino-roll") as PinoRoll;
  pinoRoll({ file, extension: ".log", size: "10m", limit: { count: 5 }, mkdir: true }).then(
    (dest) => {
      dest.on("error", fail);
      if (failed) return;
      for (const line of pending) dest.write(line);
      pending.length = 0;
      target = dest;
      // The file is written asynchronously; push out what is buffered when the
      // process exits, as the transport's own exit hook used to.
      process.once("exit", () => {
        try {
          if (target) target.flushSync();
        } catch {
          // Nothing left to report to at exit.
        }
      });
    },
    fail,
  );
}

function createLogger(): pino.Logger {
  if (typeof env.LOG_DIR !== "string" || typeof env.LOG_LEVEL !== "string") {
    // env.ts defaults both, so only a test's partial stub of config.js lands
    // here. Say so, instead of letting pino or path.join fail obscurely.
    throw new Error(
      "logger: LOG_DIR or LOG_LEVEL is missing from config. A suite that stubs config.js and reaches a log call must add both to the stub or mock lib/logger.js (#1418).",
    );
  }
  // Stream levels sit at the floor so the logger's own level decides.
  const streams = pino.multistream([
    { level: "trace", stream: pino.destination({ dest: 1, sync: false }) },
  ]);
  attachLogFile(streams, join(env.LOG_DIR, "snapotter"));
  return pino(
    {
      level: env.LOG_LEVEL,
      mixin: traceMixin,
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    streams,
  );
}

function real(): pino.Logger {
  instance ??= createLogger();
  return instance;
}

type LogMethod = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

function forward(method: LogMethod): pino.LogFn {
  const fn: pino.LogFn = (...args: unknown[]) => {
    (real()[method] as (...a: unknown[]) => void)(...args);
  };
  return fn;
}

/**
 * The process logger, shared by Fastify (`loggerInstance`) and the lib helpers
 * that log outside a request (auto-orient, animated-image, image-error).
 *
 * pino is built on first use, not at import. Constructing it here used to read
 * `env.LOG_DIR` and open the pino-roll transport the moment any module that
 * happens to log was imported, so a unit suite that stubbed `config.js` with a
 * partial env crashed at collection with "The path argument must be of type
 * string" as soon as its import graph reached one of those helpers (#1418).
 * Now importing costs nothing; the config is read when something is logged.
 *
 * This is a plain object with own methods rather than a Proxy, so `vi.spyOn`
 * (which installs spies with `defineProperty`) intercepts calls and restores
 * cleanly. Fastify only needs the seven methods to be functions; it builds its
 * own child from this and every request logger descends from that child.
 */
export const logger: FastifyBaseLogger = {
  get level() {
    return real().level;
  },
  set level(value: pino.LevelWithSilentOrString) {
    real().level = value;
  },
  fatal: forward("fatal"),
  error: forward("error"),
  warn: forward("warn"),
  info: forward("info"),
  debug: forward("debug"),
  trace: forward("trace"),
  silent: forward("silent"),
  child: (bindings, options) => real().child(bindings, options),
};
