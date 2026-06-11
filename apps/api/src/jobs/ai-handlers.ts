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

const handlers = new Map<string, AiJobHandler>();

export function registerAiJobHandler(toolId: string, handler: AiJobHandler): void {
  handlers.set(toolId, handler);
}

export function hasAiJobHandler(toolId: string): boolean {
  return handlers.has(toolId);
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
