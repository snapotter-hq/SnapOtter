import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import pino from "pino";
import { env } from "../config.js";
import { traceMixin } from "./log-trace-mixin.js";

let instance: pino.Logger | undefined;

function createLogger(): pino.Logger {
  if (typeof env.LOG_DIR !== "string" || typeof env.LOG_LEVEL !== "string") {
    // env.ts defaults both, so only a test's partial stub of config.js lands
    // here. Say so, instead of letting pino or path.join fail obscurely.
    throw new Error(
      "logger: LOG_DIR or LOG_LEVEL is missing from config. A suite that stubs config.js and reaches a log call must add both to the stub or mock lib/logger.js (#1418).",
    );
  }
  return pino({
    level: env.LOG_LEVEL,
    mixin: traceMixin,
    transport: {
      targets: [
        { target: "pino/file", options: { destination: 1 } },
        {
          target: "pino-roll",
          options: {
            file: join(env.LOG_DIR, "snapotter"),
            extension: ".log",
            size: "10m",
            limit: { count: 5 },
            mkdir: true,
          },
        },
      ],
    },
    redact: ["req.headers.authorization", "req.headers.cookie"],
  });
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
