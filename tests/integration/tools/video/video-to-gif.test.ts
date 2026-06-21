import { ffmpegAvailable } from "@snapotter/media-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MP4 = readFixture(fixtures.video.tiny("mp4"));

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function pollJob(jobId: string) {
  const { db, schema } = await import("../../../../apps/api/src/db/index.js");
  const { eq } = await import("drizzle-orm");
  let row: { status: string; outputRefs: unknown } | undefined;
  for (let i = 0; i < 120; i++) {
    [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (row && ["completed", "failed", "canceled"].includes(row.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return row;
}

describe.skipIf(!ffmpegAvailable())("video-to-gif (requires ffmpeg)", () => {
  it("returns 202 (long hint) and produces a GIF with GIF8 magic", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "tiny.mp4", contentType: "video/mp4", content: MP4 },
      { name: "settings", content: JSON.stringify({ fps: 8, width: 120, durationS: 1 }) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/video/video-to-gif",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode).toBe(202);
    const { jobId } = JSON.parse(res.body);
    const row = await pollJob(jobId);
    expect(row?.status).toBe("completed");
    const outName = (row?.outputRefs as string[])[0].split("/").pop() as string;
    expect(outName.endsWith(".gif")).toBe(true);
    const dl = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/${encodeURIComponent(outName)}`,
    });
    expect(dl.statusCode).toBe(200);
    // GIF files start with GIF8 magic bytes
    const magic = dl.rawPayload.subarray(0, 4).toString("ascii");
    expect(magic).toBe("GIF8");
  }, 90_000);
});
