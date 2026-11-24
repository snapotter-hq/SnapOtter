import { type APIRequestContext, type APIResponse, expect } from "@playwright/test";

/**
 * A long tool answers 202 and finishes on the queue (#4338). Follow its SSE
 * stream to the terminal frame and hand back what the synchronous route used
 * to answer: 200 with the result, or the failure's status, message and code.
 * Any other response passes through unchanged.
 */
export async function settleToolResponse(
  request: APIRequestContext,
  res: APIResponse,
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = (await res.json()) as Record<string, unknown>;
  if (res.status() !== 202 || typeof body.jobId !== "string") {
    return { status: res.status(), body };
  }

  const progress = await request.get(`/api/v1/jobs/${encodeURIComponent(body.jobId)}/progress`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120_000,
  });
  expect(progress.ok()).toBe(true);
  const frames = (await progress.text())
    .split(/\n\n/u)
    .map((frame) => frame.match(/^data:\s*(.+)$/mu)?.[1])
    .filter((data): data is string => data !== undefined)
    .map((data) => JSON.parse(data) as Record<string, unknown>);
  const terminal = [...frames]
    .reverse()
    .find((frame) => frame.phase === "complete" || frame.phase === "failed");
  expect(terminal).toBeDefined();
  if (terminal?.phase === "failed") {
    return {
      status: typeof terminal.httpStatus === "number" ? terminal.httpStatus : 422,
      body: { error: terminal.error, code: terminal.code },
    };
  }
  expect(terminal?.result).toBeDefined();
  return { status: 200, body: terminal?.result as Record<string, unknown> };
}
