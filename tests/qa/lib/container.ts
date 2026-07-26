/**
 * HTTP client for the container QA sweeps.
 *
 * Wraps the whole release contract for one tool invocation: authenticated
 * multipart submit, the sync 200 / async 202 fork, SSE progress with frame
 * capture, and retrieval of the real output BYTES through the actual download
 * path. Callers get one SubmitOutcome describing what the container did, and
 * decide separately whether that outcome is acceptable.
 *
 * Deliberately has no notion of pass or fail. A previous harness folded
 * "custom route 404" and "async output not found" into skips, which read as
 * passes; here those surface as facts the lane has to classify.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

export interface QaClientConfig {
  baseUrl: string;
  token: string;
}

export interface FilePart {
  field: string;
  path?: string;
  bytes?: Buffer;
  filename?: string;
}

export interface SubmitRequest {
  /** Route to POST. Callers pass the tool path or a custom route. */
  path: string;
  files?: FilePart[];
  /** Serialized into the multipart "settings" field when defined. */
  settings?: unknown;
  /** Extra multipart text fields (placements, order, saveMode, ...). */
  fields?: Record<string, string>;
  /** Send as a JSON body instead of multipart (generators). */
  jsonBody?: unknown;
  timeoutMs: number;
  /** Follow the SSE stream when the container answers 202. */
  followAsync?: boolean;
}

export interface SseFrame {
  raw: string;
  data: Record<string, unknown>;
  atMs: number;
}

export interface SubmitOutcome {
  path: string;
  httpStatus: number | null;
  responseContentType: string;
  /** True when the container answered 202 and the job ran through the queue. */
  async: boolean;
  jobId?: string;
  /** Parsed JSON body of the immediate response, when it was JSON. */
  json?: Record<string, unknown>;
  /** Raw non-JSON immediate body (error text, direct binary is in bytes). */
  bodyText?: string;
  /** Output bytes retrieved through the real download path, when there were any. */
  bytes?: Buffer;
  outputContentType?: string;
  outputFilename?: string;
  downloadUrl?: string;
  /** Every SSE frame observed, in arrival order, for monotonicity checks. */
  sseFrames: SseFrame[];
  /** Terminal async state: complete, failed or timeout. */
  asyncOutcome?: "complete" | "failed" | "timeout";
  asyncError?: string;
  /** Transport-level failure (abort, socket reset) rather than an HTTP answer. */
  transportError?: string;
  durationMs: number;
}

const TERMINAL_PHASES = new Set(["complete", "failed", "cancelled", "canceled"]);

export class QaClient {
  constructor(private readonly config: QaClientConfig) {}

  private auth(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.token}` };
  }

  /** Raw authenticated fetch against the container, for non-tool probes. */
  async raw(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { ...this.auth(), ...(init.headers as Record<string, string> | undefined) },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async submit(request: SubmitRequest): Promise<SubmitOutcome> {
    const started = Date.now();
    const outcome: SubmitOutcome = {
      path: request.path,
      httpStatus: null,
      responseContentType: "",
      async: false,
      sseFrames: [],
      durationMs: 0,
    };

    let response: Response;
    try {
      response = await this.postOnce(request);
    } catch (error) {
      outcome.transportError = error instanceof Error ? error.message : String(error);
      outcome.durationMs = Date.now() - started;
      return outcome;
    }

    outcome.httpStatus = response.status;
    outcome.responseContentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (outcome.responseContentType === "application/json") {
      const text = await response.text();
      outcome.bodyText = text;
      try {
        outcome.json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // Left as bodyText; callers treat unparseable JSON as a defect.
      }
    } else if (response.status >= 400) {
      outcome.bodyText = await response.text();
    } else {
      // Direct binary or streamed archive on the tool response itself.
      outcome.bytes = Buffer.from(await response.arrayBuffer());
      outcome.outputContentType = outcome.responseContentType;
      outcome.outputFilename = filenameFromDisposition(
        response.headers.get("content-disposition") ?? "",
      );
    }

    const jobId = typeof outcome.json?.jobId === "string" ? outcome.json.jobId : undefined;
    outcome.jobId = jobId;

    if (response.status === 202 && jobId && request.followAsync !== false) {
      outcome.async = true;
      const sse = await this.followProgress(jobId, request.timeoutMs);
      outcome.sseFrames = sse.frames;
      outcome.asyncOutcome = sse.outcome;
      outcome.asyncError = sse.error;
      if (sse.result?.downloadUrl && typeof sse.result.downloadUrl === "string") {
        outcome.downloadUrl = sse.result.downloadUrl;
      }
    } else if (typeof outcome.json?.downloadUrl === "string") {
      outcome.downloadUrl = outcome.json.downloadUrl;
    }

    if (outcome.downloadUrl && !outcome.bytes) {
      const fetched = await this.download(outcome.downloadUrl, request.timeoutMs);
      outcome.bytes = fetched.bytes;
      outcome.outputContentType = fetched.contentType;
      outcome.outputFilename = fetched.filename;
      if (!fetched.bytes) outcome.transportError = fetched.error;
    }

    outcome.durationMs = Date.now() - started;
    return outcome;
  }

  private async postOnce(request: SubmitRequest): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      if (request.jsonBody !== undefined) {
        return await fetch(`${this.config.baseUrl}${request.path}`, {
          method: "POST",
          signal: controller.signal,
          headers: { ...this.auth(), "Content-Type": "application/json" },
          body: JSON.stringify(request.jsonBody),
        });
      }
      const form = new FormData();
      for (const file of request.files ?? []) {
        const bytes = file.bytes ?? readFileSync(file.path as string);
        const name = file.filename ?? basename(file.path ?? "input.bin");
        form.append(file.field, new Blob([new Uint8Array(bytes)]), name);
      }
      if (request.settings !== undefined) {
        form.append("settings", JSON.stringify(request.settings));
      }
      for (const [key, value] of Object.entries(request.fields ?? {})) {
        form.append(key, value);
      }
      return await fetch(`${this.config.baseUrl}${request.path}`, {
        method: "POST",
        signal: controller.signal,
        headers: this.auth(),
        body: form,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Streams a job's SSE progress until a terminal frame or the deadline. */
  async followProgress(
    jobId: string,
    timeoutMs: number,
  ): Promise<{
    outcome: "complete" | "failed" | "timeout";
    error?: string;
    result?: Record<string, unknown>;
    frames: SseFrame[];
  }> {
    const deadline = Date.now() + timeoutMs;
    const frames: SseFrame[] = [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/v1/jobs/${jobId}/progress`, {
        signal: controller.signal,
        headers: { ...this.auth(), Accept: "text/event-stream" },
      });
      if (!response.ok || !response.body) {
        return { outcome: "failed", error: `SSE returned ${response.status}`, frames };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (Date.now() < deadline) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6);
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              frames.push({ raw, data: { unparseable: true }, atMs: Date.now() });
              continue;
            }
            frames.push({ raw, data, atMs: Date.now() });

            const phase = typeof data.phase === "string" ? data.phase : undefined;
            const batchStatus = typeof data.status === "string" ? data.status : undefined;
            if (phase && TERMINAL_PHASES.has(phase)) {
              await reader.cancel().catch(() => {});
              if (phase === "complete") {
                return {
                  outcome: "complete",
                  result: data.result as Record<string, unknown> | undefined,
                  frames,
                };
              }
              return { outcome: "failed", error: String(data.error ?? phase), frames };
            }
            if (data.type === "batch" && batchStatus && TERMINAL_PHASES.has(batchStatus)) {
              await reader.cancel().catch(() => {});
              if (batchStatus === "complete" || batchStatus === "completed") {
                return { outcome: "complete", result: data as Record<string, unknown>, frames };
              }
              return { outcome: "failed", error: JSON.stringify(data.errors ?? {}), frames };
            }
            if (data.type === "batch" && batchStatus === "completed") {
              await reader.cancel().catch(() => {});
              return { outcome: "complete", result: data as Record<string, unknown>, frames };
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return { outcome: "timeout", frames };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: Date.now() >= deadline ? "timeout" : "failed", error: message, frames };
    } finally {
      clearTimeout(timer);
    }
  }

  async download(
    downloadUrl: string,
    timeoutMs = 60_000,
  ): Promise<{ bytes?: Buffer; contentType?: string; filename?: string; error?: string }> {
    try {
      const response = await this.raw(downloadUrl, {}, timeoutMs);
      if (!response.ok) return { error: `download returned ${response.status}` };
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        contentType: (response.headers.get("content-type") ?? "").split(";")[0].trim(),
        filename:
          filenameFromDisposition(response.headers.get("content-disposition") ?? "") ??
          downloadUrl.split("/").pop(),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function filenameFromDisposition(disposition: string): string | undefined {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match?.[1];
}

/** Logs in and returns a bearer token, failing loudly rather than degrading. */
export async function login(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ token: string; userId: string }> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`login failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { token?: string; user?: { id?: string } };
  if (!body.token) throw new Error("login succeeded but returned no token");
  return { token: body.token, userId: body.user?.id ?? "" };
}
