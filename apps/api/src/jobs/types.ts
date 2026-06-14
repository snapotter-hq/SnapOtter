/**
 * Shared types and naming helpers for the BullMQ job system.
 */

/** The five processing pools that partition work by resource profile. */
export const POOLS = ["image", "media", "ai", "docs", "system"] as const;
export type Pool = (typeof POOLS)[number];

/** Redis key prefix for all BullMQ data. */
export function bullPrefix(): string {
  return process.env.BULLMQ_PREFIX ?? "snapotter";
}

/** Canonical BullMQ queue name for a pool. */
export function queueName(pool: Pool): string {
  return `${bullPrefix()}-${pool}`;
}

/** Payload stored in each BullMQ job. */
export interface ToolJobData {
  jobId: string;
  toolId: string;
  userId: string | null;
  pool: Pool;
  inputRefs: string[];
  filename: string;
  settings: unknown;
  /**
   * When set, persisted to the DB row instead of settings. Use to strip
   * secrets the worker needs but should not persist (the worker reads
   * settings from BullMQ job data, never the DB row).
   */
  dbSettings?: Record<string, unknown>;
  fileId?: string;
  clientJobId?: string;
  kind:
    | "tool"
    | "ai-tool"
    | "pipeline-step"
    | "pipeline-finalize"
    | "batch-child"
    | "batch-finalize";
  stepIndex?: number;
  totalSteps?: number;
  prevJobId?: string;
  parentId?: string;
  totalFiles?: number;
  fileIndex?: number;
  _otel?: { traceparent: string; tracestate?: string };
}

/** Result returned by a completed BullMQ job. */
export interface ToolJobResult {
  outputRefs: string[];
  filename: string;
  contentType: string;
  originalSize: number;
  processedSize: number;
  previewRef?: string;
  savedFileId?: string;
  resultPayload?: Record<string, unknown>;
}
