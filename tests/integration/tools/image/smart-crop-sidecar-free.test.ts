/**
 * Sidecar-free smart-crop route coverage.
 *
 * Smart crop is feature-gated as an AI tool, but its subject and trim paths
 * are pure Sharp. These tests force only the smart-crop gate open and mock face
 * detection so the route exercises real processing without Python sidecars.
 */

import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForJob } from "../../../../apps/api/src/jobs/enqueue.js";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const mocks = vi.hoisted(() => ({
  detectFaces: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  return {
    ...actual,
    detectFaces: mocks.detectFaces,
  };
});

vi.mock("../../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/feature-status.js")>();
  return {
    ...actual,
    isToolInstalled: (toolId: string) =>
      toolId === "smart-crop" ? true : actual.isToolInstalled(toolId),
  };
});

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

beforeEach(() => {
  mocks.detectFaces.mockReset();
  mocks.detectFaces.mockResolvedValue({ facesDetected: 0, faces: [] });
});

async function postSmartCrop(settings: Record<string, unknown> | string) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "photo.png", contentType: "image/png", content: PNG },
    {
      name: "settings",
      content: typeof settings === "string" ? settings : JSON.stringify(settings),
    },
  ]);

  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/smart-crop",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

async function downloadOutput(downloadUrl: string) {
  return app.inject({
    method: "GET",
    url: downloadUrl,
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

async function outputUrlFor(response: Awaited<ReturnType<typeof postSmartCrop>>): Promise<string> {
  const body = JSON.parse(response.body);
  if (response.statusCode === 200) {
    return body.downloadUrl;
  }

  expect(response.statusCode).toBe(202);
  const result = await waitForJob("ai", body.jobId, 20_000);
  if (!result) {
    throw new Error(`smart-crop job ${body.jobId} did not finish within the test window`);
  }
  return `/api/v1/download/${body.jobId}/${encodeURIComponent(result.filename)}`;
}

describe("smart-crop sidecar-free processing", () => {
  it("runs subject mode and returns the requested output dimensions", async () => {
    const res = await postSmartCrop({
      mode: "subject",
      width: 96,
      height: 64,
      strategy: "entropy",
    });

    const outputUrl = await outputUrlFor(res);
    const download = await downloadOutput(outputUrl);
    const meta = await sharp(download.rawPayload).metadata();

    expect(meta.width).toBe(96);
    expect(meta.height).toBe(64);
    expect(outputUrl).toContain("_smartcrop.");
  });

  it("maps legacy attention/content modes to subject and trim behavior", async () => {
    const attention = await postSmartCrop({ mode: "attention", width: 80, height: 80 });
    await expect(outputUrlFor(attention)).resolves.toContain("_smartcrop.");

    const content = await postSmartCrop({
      mode: "content",
      padToSquare: true,
      targetSize: 72,
      padColor: "#eeeeee",
    });
    const download = await downloadOutput(await outputUrlFor(content));
    const meta = await sharp(download.rawPayload).metadata();
    expect(meta.width).toBe(72);
    expect(meta.height).toBe(72);
  });

  it("falls back to subject cropping when face detection finds no faces", async () => {
    mocks.detectFaces.mockResolvedValueOnce({ facesDetected: 0, faces: [] });

    const res = await postSmartCrop({
      mode: "face",
      width: 90,
      height: 90,
      sensitivity: 0.75,
    });

    const outputUrl = await outputUrlFor(res);
    expect(mocks.detectFaces).toHaveBeenCalledWith(expect.any(Buffer), { sensitivity: 0.75 });

    const download = await downloadOutput(outputUrl);
    const meta = await sharp(download.rawPayload).metadata();
    expect(meta.width).toBe(90);
    expect(meta.height).toBe(90);
  });

  it("uses detected face bounds for face mode crops", async () => {
    mocks.detectFaces.mockResolvedValueOnce({
      facesDetected: 1,
      faces: [{ x: 40, y: 30, w: 80, h: 70 }],
    });

    const res = await postSmartCrop({
      mode: "face",
      width: 120,
      height: 80,
      facePreset: "closeup",
      padding: 10,
    });

    const download = await downloadOutput(await outputUrlFor(res));
    const meta = await sharp(download.rawPayload).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(80);
  });

  it("rejects malformed JSON and invalid setting ranges before enqueueing", async () => {
    const malformed = await postSmartCrop("{bad json");
    expect(malformed.statusCode).toBe(400);
    expect(JSON.parse(malformed.body)).toMatchObject({ error: "Settings must be valid JSON" });

    const invalid = await postSmartCrop({ mode: "trim", threshold: 999 });
    expect(invalid.statusCode).toBe(400);
    expect(JSON.parse(invalid.body)).toMatchObject({ error: "Invalid settings" });
  });
});
