/**
 * Who may watch a job's progress stream.
 *
 * The stream's last frame carries the result's download link, so it follows
 * the cancel route's rule: signed in, and either the job's owner or a user
 * with files:all. Anyone else gets a 404.
 *
 * The web client opens the stream before its upload finishes, so the job row
 * can be missing at connect time. Frames are held until the row appears and
 * then delivered only if it belongs to the watcher.
 *
 * inject() completes once the hijacked stream ends, which a terminal frame
 * does, so every case here ends on one.
 */

import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  publishEphemeral,
  releaseFeatureInstallStream,
  reserveFeatureInstallStream,
  updateSingleFileProgress,
} from "../../../apps/api/src/routes/progress.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  createUserAndLogin,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

// Open the bundle gates so passport-photo analyze reaches its multipart parse
// and reservation without the AI bundles installed.
vi.mock("../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/feature-status.js")>();
  return {
    ...actual,
    isToolInstalled: () => true,
    getFirstMissingBundleForTool: () => null,
  };
});

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;
let owner: { token: string; userId: string };
let stranger: { token: string; userId: string };

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
  owner = await createUserAndLogin(app, "stream_owner");
  stranger = await createUserAndLogin(app, "stream_stranger");
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

const DOWNLOAD_URL = "/api/v1/download/result-job/output.png";

async function seedCompletedJob(userId: string | null): Promise<string> {
  const jobId = randomUUID();
  await db.insert(schema.jobs).values({
    id: jobId,
    userId,
    type: "single",
    status: "completed",
    inputRefs: [],
    progress: { percent: 100, result: { downloadUrl: DOWNLOAD_URL } },
  });
  return jobId;
}

function watch(jobId: string, token?: string) {
  return app.inject({
    method: "GET",
    url: `/api/v1/jobs/${jobId}/progress`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function dataFrames(body: string): Array<Record<string, unknown>> {
  return body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
    .filter((frame) => frame.type !== "heartbeat");
}

describe("progress stream access", () => {
  it("refuses a request with no session", async () => {
    const jobId = await seedCompletedJob(owner.userId);

    const res = await watch(jobId);

    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain(DOWNLOAD_URL);
  });

  it("replays a finished job to its owner", async () => {
    const jobId = await seedCompletedJob(owner.userId);

    const res = await watch(jobId, owner.token);

    expect(res.statusCode).toBe(200);
    expect(dataFrames(res.body).at(-1)).toMatchObject({ jobId, phase: "complete" });
    expect(res.body).toContain(DOWNLOAD_URL);
  });

  it("answers 404 to a signed-in user who doesn't own the job", async () => {
    const jobId = await seedCompletedJob(owner.userId);

    const res = await watch(jobId, stranger.token);

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(DOWNLOAD_URL);
  });

  it("lets a user with files:all watch someone else's job", async () => {
    const jobId = await seedCompletedJob(owner.userId);

    const res = await watch(jobId, adminToken);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(DOWNLOAD_URL);
  });

  it("keeps an ownerless job from users without files:all", async () => {
    const jobId = await seedCompletedJob(null);

    const res = await watch(jobId, stranger.token);

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(DOWNLOAD_URL);
  });

  // Installs are shared between admins, so their rows carry a marker and
  // features:manage is enough to watch one. A plain user has neither.
  describe("feature install streams", () => {
    it("reserves an owned, marked row before the install publishes anything", async () => {
      const jobId = randomUUID();
      await reserveFeatureInstallStream({ jobId, bundleId: "ocr", userId: owner.userId });

      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
      expect(row).toMatchObject({
        userId: owner.userId,
        status: "queued",
        settings: { featureInstall: "ocr" },
      });
    });

    it("keeps an install's progress from a user who can't manage features", async () => {
      const jobId = randomUUID();
      await reserveFeatureInstallStream({ jobId, bundleId: "ocr", userId: owner.userId });
      await updateSingleFileProgress({ jobId, phase: "complete", percent: 100 });

      const res = await watch(jobId, stranger.token);

      expect(res.statusCode).toBe(404);
    });

    it("drops a reservation the install queue didn't use, and nothing else", async () => {
      const unused = randomUUID();
      await reserveFeatureInstallStream({ jobId: unused, bundleId: "ocr", userId: owner.userId });
      const ordinary = await seedCompletedJob(owner.userId);

      await releaseFeatureInstallStream(unused);
      await releaseFeatureInstallStream(ordinary);

      const [gone] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, unused));
      const [kept] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, ordinary));
      expect(gone).toBeUndefined();
      expect(kept).toBeDefined();
    });
  });

  // The web client subscribes before its upload finishes, so the row can be
  // missing at connect time. What arrives before it exists must wait for it.
  describe("a job that doesn't exist yet when the stream opens", () => {
    async function publishWhenRowAppears(jobId: string, userId: string) {
      await delay(300);
      await db.insert(schema.jobs).values({
        id: jobId,
        userId,
        type: "single",
        status: "queued",
        inputRefs: [],
      });
      await updateSingleFileProgress({
        jobId,
        phase: "complete",
        percent: 100,
        result: { downloadUrl: DOWNLOAD_URL },
      });
    }

    it("delivers the frames once the row turns out to be the watcher's", async () => {
      const jobId = randomUUID();
      const stream = watch(jobId, owner.token);
      await publishWhenRowAppears(jobId, owner.userId);

      const res = await stream;

      expect(res.statusCode).toBe(200);
      expect(dataFrames(res.body).at(-1)).toMatchObject({ jobId, phase: "complete" });
    });

    it("sends nothing once the row turns out to be someone else's", async () => {
      const jobId = randomUUID();
      const stream = watch(jobId, stranger.token);
      await publishWhenRowAppears(jobId, owner.userId);

      const res = await stream;

      // 200, not 404: the stream opened before the row existed, so this is
      // the held-then-refused path rather than the connect-time check.
      expect(res.statusCode).toBe(200);
      expect(dataFrames(res.body)).toEqual([]);
      expect(res.body).not.toContain(DOWNLOAD_URL);
    });

    // Some publishers announce a frame a moment before writing its row. With
    // no later frame to trigger a recheck, the timer has to find the row.
    it("delivers a frame that arrived before its row, once the row lands", async () => {
      const jobId = randomUUID();
      const stream = watch(jobId, owner.token);
      await delay(300);
      publishEphemeral({
        jobId,
        type: "single",
        phase: "complete",
        percent: 100,
        result: { downloadUrl: DOWNLOAD_URL },
      });
      await delay(200);
      await db.insert(schema.jobs).values({
        id: jobId,
        userId: owner.userId,
        type: "single",
        status: "completed",
        inputRefs: [],
      });

      const res = await stream;

      expect(res.statusCode).toBe(200);
      expect(dataFrames(res.body).at(-1)).toMatchObject({ jobId, phase: "complete" });
    });
  });

  // Analyze publishes under the caller's clientJobId, so it reserves that id
  // for the caller before the first frame instead of letting the persist
  // path create an ownerless row, or write into someone else's.
  describe("passport photo analyze", () => {
    const ANALYZE_URL = "/api/v1/tools/image/passport-photo/analyze";

    function analyze(clientJobId: string, token: string) {
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename: "face.png", contentType: "image/png", content: PNG },
        { name: "clientJobId", content: clientJobId },
      ]);
      return app.inject({
        method: "POST",
        url: ANALYZE_URL,
        headers: { authorization: `Bearer ${token}`, "content-type": contentType },
        body,
      });
    }

    it("reserves the caller's clientJobId as a row they own", async () => {
      const clientJobId = `analyze_${randomUUID()}`;

      await analyze(clientJobId, owner.token);

      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, clientJobId));
      expect(row?.userId).toBe(owner.userId);
    });

    it("answers 409 when the clientJobId already belongs to a job", async () => {
      const taken = await seedCompletedJob(owner.userId);

      const res = await analyze(taken, stranger.token);

      expect(res.statusCode).toBe(409);
      const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, taken));
      expect(row).toMatchObject({ userId: owner.userId, status: "completed" });
    });
  });
});
