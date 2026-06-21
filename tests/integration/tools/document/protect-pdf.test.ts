import { qpdfAvailable } from "@snapotter/doc-engine";
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

const PDF = readFixture(fixtures.document.pdf3);

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
    { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/protect-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!qpdfAvailable())("protect-pdf (requires qpdf)", () => {
  it("encrypts a PDF and returns a downloadable file", async () => {
    const res = await runTool({ userPassword: "mypass" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);
    // The output should start with %PDF-
    expect(dl.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);

  it("persists redacted passwords in the jobs row (never the real password)", async () => {
    const realPassword = "superSecret42";
    const res = await runTool({ userPassword: realPassword, ownerPassword: "ownerPw99" });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);

    // Read the jobs row
    const [row] = await db
      .select({ settings: schema.jobs.settings })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, envelope.jobId));

    expect(row).toBeDefined();
    const settings = row.settings as Record<string, unknown>;
    expect(settings.userPassword).toBe("<redacted>");
    expect(settings.ownerPassword).toBe("<redacted>");

    // The raw password string must not appear anywhere in the row
    const serialized = JSON.stringify(row.settings);
    expect(serialized).not.toContain(realPassword);
    expect(serialized).not.toContain("ownerPw99");
  }, 60_000);

  it("rejects empty userPassword with 400", async () => {
    const res = await runTool({ userPassword: "" });
    expect(res.statusCode).toBe(400);
  }, 60_000);
});
