import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import pino from "pino";
import { env } from "../config.js";
import { traceMixin } from "./log-trace-mixin.js";

export const logger: FastifyBaseLogger = pino({
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
