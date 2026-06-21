/**
 * Integration tests for GET /api/v1/admin/support-bundle.
 *
 * Verifies auth gating, zip structure, config redaction, and
 * failed-jobs inclusion.
 */
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);

  // Seed a failed job so failed-jobs.json is non-empty
  await db.insert(schema.jobs).values({
    id: randomUUID(),
    type: "tool",
    toolId: "resize",
    pool: "image",
    status: "failed",
    error: { message: "test failure" },
    durationMs: 123,
  });
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("GET /api/v1/admin/support-bundle", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/support-bundle",
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it("returns 200 application/zip for admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/support-bundle",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename=snapotter-support-/);

    // Unzip and verify contents
    const zip = new AdmZip(Buffer.from(res.rawPayload));
    const entryNames = zip.getEntries().map((e) => e.entryName);

    // config.json must exist and parse
    expect(entryNames).toContain("config.json");
    const configBuf = zip.getEntry("config.json")!.getData();
    const config = JSON.parse(configBuf.toString("utf-8"));

    // DATABASE_URL must be redacted (userinfo masked)
    expect(config.DATABASE_URL).toMatch(/:\/\/\*\*\*@/);

    // The raw userinfo (user:pass@) must not appear in any config value
    const rawDbUrl = env.DATABASE_URL;
    const userinfoMatch = rawDbUrl.match(/:\/\/([^@]+)@/);
    if (userinfoMatch) {
      const rawUserinfo = userinfoMatch[1]; // e.g. "user:pass"
      for (const val of Object.values(config)) {
        if (typeof val === "string") {
          expect(val).not.toContain(`://${rawUserinfo}@`);
        }
      }
    }

    // DEFAULT_PASSWORD must be redacted
    expect(config.DEFAULT_PASSWORD).toBe("<redacted>");

    // failed-jobs.json must exist and be a non-empty array
    expect(entryNames).toContain("failed-jobs.json");
    const failedBuf = zip.getEntry("failed-jobs.json")!.getData();
    const failedJobs = JSON.parse(failedBuf.toString("utf-8"));
    expect(Array.isArray(failedJobs)).toBe(true);
    expect(failedJobs.length).toBeGreaterThan(0);
    expect(failedJobs[0]).toMatchObject({ toolId: "resize", pool: "image" });

    // db-counts.json must exist and parse
    expect(entryNames).toContain("db-counts.json");
    const countsBuf = zip.getEntry("db-counts.json")!.getData();
    const dbCounts = JSON.parse(countsBuf.toString("utf-8"));
    expect(Array.isArray(dbCounts)).toBe(true);

    // host.json must exist and parse
    expect(entryNames).toContain("host.json");
    const hostBuf = zip.getEntry("host.json")!.getData();
    const host = JSON.parse(hostBuf.toString("utf-8"));
    expect(host.platform).toBeDefined();
  });
});
