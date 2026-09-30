/**
 * Who may watch a job's progress stream.
 *
 * The stream's last frame carries the result's download link, so it follows
 * the cancel route's rule: signed in, and either the job's owner or a user
 * with files:all. Anyone else gets the same 404 a missing job would.
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  releaseFeatureInstallStream,
  reserveFeatureInstallStream,
  updateSingleFileProgress,
} from "../../../apps/api/src/routes/progress.js";
import { buildTestApp, createUserAndLogin, loginAsAdmin, type TestApp } from "../test-server.js";

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

      expect(dataFrames(res.body)).toEqual([]);
      expect(res.body).not.toContain(DOWNLOAD_URL);
    });
  });
});
