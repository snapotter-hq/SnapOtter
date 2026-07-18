/**
 * Shared types and naming helpers for the BullMQ job system, plus the
 * saveMode multipart-field validation shared by tool-factory and the
 * hand-written tool routes.
 */

import { LIBRARY_SAVE_MODES, type LibrarySaveMode } from "@snapotter/shared";

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
  /** How to save the result to the library when fileId is set; defaults to "new". */
  saveMode?: LibrarySaveMode;
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
  analyticsDistinctId?: string;
  _otel?: { traceparent: string; tracestate?: string };
}

/** Error message for the { error } 400 response when a multipart saveMode field has an unknown value. */
export const INVALID_SAVE_MODE_ERROR = 'Invalid saveMode (expected "new" or "overwrite")';

/**
 * Validate a client-supplied multipart saveMode field.
 * Returns undefined when the field was absent, null when the value is invalid.
 */
export function parseSaveModeField(raw: string | null): LibrarySaveMode | undefined | null {
  if (raw === null) return undefined;
  return (LIBRARY_SAVE_MODES as readonly string[]).includes(raw) ? (raw as LibrarySaveMode) : null;
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
