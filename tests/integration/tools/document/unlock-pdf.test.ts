import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qpdfAvailable, qpdfPageCount } from "@snapotter/doc-engine";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const ENCRYPTED = readFixture(fixtures.document.encrypted);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "encrypted.pdf", contentType: "application/pdf", content: ENCRYPTED },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/unlock-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!qpdfAvailable())("unlock-pdf (requires qpdf)", () => {
  it("unlocks with correct password and produces 3 pages", async () => {
    const res = await runTool({ password: "test123" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    // Download and verify page count
    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    const dir = mkdtempSync(join(tmpdir(), "unlock-pdf-test-"));
    try {
      const outPath = join(dir, "unlocked.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects wrong password with 422", async () => {
    const res = await runTool({ password: "wrongPassword" });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details).toMatch(/password|invalid/i);
  }, 60_000);

  it("persists redacted password in the jobs row", async () => {
    const realPassword = "test123";
    const res = await runTool({ password: realPassword });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);

    const [row] = await db
      .select({ settings: schema.jobs.settings })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, envelope.jobId));

    expect(row).toBeDefined();
    const settings = row.settings as Record<string, unknown>;
    expect(settings.password).toBe("<redacted>");

    const serialized = JSON.stringify(row.settings);
    expect(serialized).not.toContain(realPassword);
  }, 60_000);
});
