/**
 * Runs the real @sentry/node SDK against the real Postgres and Redis the
 * integration suite starts, drives background work outside any request (a pg
 * query, Redis commands, an idle BullMQ worker), and records the exact
 * sampling context the SDK hands buildTracesSampler for each root span (#4154).
 * The SDK sets its instrumentation up once per process, so each test file
 * starts one probe.
 */
import { createRequire } from "node:module";
import * as Sentry from "@sentry/node";
import { buildTracesSampler } from "../../apps/api/src/lib/sentry-tracing.js";

export interface SeenSpan {
  name: string;
  attributes: Record<string, unknown>;
  rate: number;
}

type Integrations = NonNullable<Parameters<typeof Sentry.init>[0]>["integrations"];

// The OpenTelemetry hooks patch a module as it is required, after Sentry.init
// has run, so the drivers are loaded through require rather than imported.
const nodeRequire = createRequire(import.meta.url);

export function startSamplerProbe(integrations: Integrations): SeenSpan[] {
  const seen: SeenSpan[] = [];
  const sampler = buildTracesSampler(1);
  Sentry.init({
    dsn: "https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1",
    integrations,
    tracesSampler: ((ctx: Parameters<typeof sampler>[0]) => {
      const rate = sampler(ctx);
      seen.push({ name: ctx.name ?? "", attributes: { ...(ctx.attributes ?? {}) }, rate });
      return rate;
    }) as never,
    transport: () => ({ send: async () => ({}) as never, flush: async () => true }),
  });
  return seen;
}

export async function driveBackgroundWork(): Promise<void> {
  const { Client } = nodeRequire("pg") as typeof import("pg");
  const IORedis = nodeRequire("ioredis") as typeof import("ioredis").default;
  const { Queue, Worker } = nodeRequire("bullmq") as typeof import("bullmq");

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  await pg.query("SELECT 1");
  await pg.end();

  const connection = new IORedis(process.env.REDIS_URL as string, { maxRetriesPerRequest: null });
  const prefix = `${process.env.BULLMQ_PREFIX}_probe`;
  const queue = new Queue("probe", { connection, prefix });
  const worker = new Worker("probe", async () => undefined, { connection, prefix });
  await worker.waitUntilReady();
  await queue.add("noop", {});
  // Long enough for the worker's blocking poll (BZPOPMIN) to start.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await worker.close();
  await queue.close();
  connection.disconnect();
  await Sentry.flush(500);
}

export async function stopSamplerProbe(): Promise<void> {
  await Sentry.close(0);
}
