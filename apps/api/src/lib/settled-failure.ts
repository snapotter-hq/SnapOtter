// apps/api/src/lib/settled-failure.ts

import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { db, schema } from "../db/index.js";
import { STORAGE_FAULT_CODES } from "./object-storage.js";

/** Re-reads of a row still in flight, and the pause between them: half a second in all. */
const SETTLE_RETRIES = 10;
const SETTLE_RETRY_MS = 50;

export interface SettledFailureResponse {
  status: number;
  body: {
    error: string;
    code?: string;
    errors: Array<{ filename: string; error: string }>;
  };
}

/**
 * The answer for a batch or pipeline-batch parent whose finalize failed, or
 * null when its row is not settled as failed.
 *
 * A failed finalize commits its reason to the parent row before it rethrows,
 * but the rejection that reaches the route through BullMQ is a plain Error,
 * which the error handler would mask as "Internal server error". The row is
 * what the sync client and API consumers must see (#1161). Storage faults
 * answer 503 wherever they surface, so a client keys on one status and code
 * for "the instance can't store this" (#1161, #1421).
 *
 * A row that can't be read answers null as well, so the caller rethrows the
 * rejection it already holds instead of replacing it with a database error.
 *
 * A row still in flight is read again for a short while. A finalize that died
 * by stall or crash is settled only by the worker's failed handler, which
 * doesn't await its write, so its rejection can reach the route first (#2209).
 * The wait is bounded so a rejection with no reason behind it still rethrows
 * promptly.
 */
export async function settledFailureResponse(
  jobId: string,
  log: FastifyBaseLogger,
): Promise<SettledFailureResponse | null> {
  let row: typeof schema.jobs.$inferSelect | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    } catch (err) {
      log.warn({ err, jobId }, "Could not read the parent row of a failed batch");
      return null;
    }
    const inFlight = row?.status === "processing" || row?.status === "queued";
    if (!inFlight || attempt >= SETTLE_RETRIES) break;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_RETRY_MS));
  }
  if (row?.status !== "failed") return null;
  const error = row.error as { message?: string; code?: string; details?: unknown } | null;
  if (!error?.message) return null;
  const code = typeof error.code === "string" ? error.code : undefined;
  return {
    status: code && STORAGE_FAULT_CODES.has(code) ? 503 : 500,
    body: {
      error: error.message,
      ...(code ? { code } : {}),
      errors: Array.isArray(error.details)
        ? (error.details as Array<{ filename: string; error: string }>)
        : [],
    },
  };
}
