/**
 * AI tool handler registry (stub).
 *
 * AI tools register their async processing functions here. The worker
 * runtime checks hasAiJobHandler() to decide between the standard
 * tool-registry process path and the AI-specific path.
 *
 * Handlers are populated by the AI tool modules during route registration
 * (Task 8 wires them up).
 */
import type { ToolProcessCtx } from "../routes/tool-factory.js";
import type { ToolJobData } from "./types.js";

export interface AiJobOutput {
  buffer: Buffer;
  filename: string;
  contentType: string;
  resultPayload?: Record<string, unknown>;
  extraOutputs?: Array<{ name: string; buffer: Buffer; contentType: string }>;
}

export type AiJobHandler = (
  input: Buffer,
  data: ToolJobData,
  ctx: ToolProcessCtx,
) => Promise<AiJobOutput>;

export interface AiPathJobInput {
  path: string;
  size: number;
}

export type AiPathJobHandler = (
  input: AiPathJobInput,
  data: ToolJobData,
  ctx: ToolProcessCtx,
) => Promise<AiJobOutput>;

const handlers = new Map<string, AiJobHandler>();
const pathHandlers = new Map<string, AiPathJobHandler>();

export function registerAiJobHandler(toolId: string, handler: AiJobHandler): void {
  handlers.set(toolId, handler);
}

export function hasAiJobHandler(toolId: string): boolean {
  return handlers.has(toolId);
}

/** Register the narrow path-backed contract used by large OCR PDFs. */
export function registerAiPathJobHandler(toolId: string, handler: AiPathJobHandler): void {
  pathHandlers.set(toolId, handler);
}

export function hasAiPathJobHandler(toolId: string): boolean {
  return pathHandlers.has(toolId);
}

export async function runAiToolJob(
  data: ToolJobData,
  input: Buffer,
  ctx: ToolProcessCtx,
): Promise<AiJobOutput> {
  const h = handlers.get(data.toolId);
  if (!h) throw new Error(`No AI job handler for ${data.toolId}`);
  return h(input, data, ctx);
}

export async function runAiPathToolJob(
  data: ToolJobData,
  input: AiPathJobInput,
  ctx: ToolProcessCtx,
): Promise<AiJobOutput> {
  const handler = pathHandlers.get(data.toolId);
  if (!handler) throw new Error(`No path-backed AI job handler for ${data.toolId}`);
  return handler(input, data, ctx);
}
