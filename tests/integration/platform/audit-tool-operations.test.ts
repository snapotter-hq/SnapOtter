/**
 * Integration tests for TOOL_EXECUTED audit logging.
 *
 * Verifies that the createToolRoute factory emits audit entries when the
 * `auditToolOperations` admin setting is enabled and stays silent when it
 * is disabled (the default).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.edge.px1);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function setSetting(key: string, value: string): Promise<void> {
  const res = await testApp.app.inject({
    method: "PUT",
    url: "/api/v1/settings",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { [key]: value },
  });
  expect(res.statusCode).toBe(200);
}

async function fetchAuditLog(action: string): Promise<{ entries: any[]; total: number }> {
  const res = await testApp.app.inject({
    method: "GET",
    url: `/api/v1/audit-log?action=${action}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

async function processResize(): Promise<number> {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    { name: "settings", content: JSON.stringify({ width: 1 }) },
  ]);

  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/image/resize",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });

  return res.statusCode;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("tool operation audit logging", () => {
  it("does not log TOOL_EXECUTED when auditToolOperations is disabled", async () => {
    await setSetting("auditToolOperations", "false");

    await processResize();

    // Small delay to ensure fire-and-forget audit would have landed
    await new Promise((r) => setTimeout(r, 200));

    const body = await fetchAuditLog("TOOL_EXECUTED");
    expect(body.total).toBe(0);
  });

  it("logs TOOL_EXECUTED when auditToolOperations is enabled", async () => {
    await setSetting("auditToolOperations", "true");

    const statusCode = await processResize();
    expect(statusCode).toBe(200);

    // Small delay for the fire-and-forget audit write to complete
    await new Promise((r) => setTimeout(r, 500));

    const body = await fetchAuditLog("TOOL_EXECUTED");
    expect(body.total).toBeGreaterThanOrEqual(1);

    const entry = body.entries[0];
    expect(entry.action).toBe("TOOL_EXECUTED");
    expect(entry.details.toolId).toBe("resize");
    expect(entry.details.status).toBe("success");
    expect(typeof entry.details.durationMs).toBe("number");
    expect(entry.details.inputFileCount).toBe(1);
    expect(typeof entry.details.totalInputSize).toBe("number");
    expect(entry.details.totalInputSize).toBeGreaterThan(0);
  });
});
