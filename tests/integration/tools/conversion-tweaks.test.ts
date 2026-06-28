import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const MP4 = readFixture(fixtures.video.tiny("mp4"));
let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
}, 30_000);
afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function poll(jobId: string) {
  const { db, schema } = await import("../../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  let row: { status: string; outputRefs: unknown } | undefined;
  for (let i = 0; i < 120; i++) {
    [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return row;
}

describe.skipIf(!ffmpegAvailable())("engine tweaks", () => {
  it("convert-video outputs avi", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "t.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({ format: "avi" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/convert-video",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(202);
    const row = await poll(JSON.parse(res.body).jobId);
    expect(row?.status).toBe("completed");
    expect((row?.outputRefs as string[])[0].endsWith(".avi")).toBe(true);
  }, 90_000);

  it("convert-video outputs mkv", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "t.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({ format: "mkv" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/convert-video",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body,
    });
    const row = await poll(JSON.parse(res.body).jobId);
    expect(row?.status).toBe("completed");
    expect((row?.outputRefs as string[])[0].endsWith(".mkv")).toBe(true);
  }, 90_000);

  it("extract-audio outputs ogg", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "t.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({ format: "ogg" }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/extract-audio",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body,
    });
    const row = await poll(JSON.parse(res.body).jobId);
    expect(row?.status).toBe("completed");
    expect((row?.outputRefs as string[])[0].endsWith(".ogg")).toBe(true);
  }, 90_000);
});
