// html-to-pdf integration suite.
// Requires WeasyPrint (Python). Skips unless the resolved interpreter has it,
// which no automated lane arranges yet (#1174); locally, symlink a venv that
// does to .venv.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { pythonWith } from "../../../helpers/python-gate.js";
import { startRequestRecorder } from "../../../helpers/request-recorder.js";
import { waitForDownloadedJobArtifact } from "../../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const HTML = readFixture(fixtures.document.tiny("html"));

const hasWeasyprint = pythonWith("weasyprint");

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(filename: string, content: Buffer) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/files/html-to-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** html-to-pdf is a "long" tool: it answers 202 + jobId and runs async. */
async function convertToPdf(filename: string, content: Buffer) {
  const res = await runTool(filename, content);
  expect(res.statusCode).toBe(202);
  const { jobId } = JSON.parse(res.body) as { jobId: string };
  return waitForDownloadedJobArtifact(testApp.app, adminToken, "html-to-pdf", jobId);
}

describe.skipIf(!hasWeasyprint)("html-to-pdf (requires weasyprint)", () => {
  it("returns 202 (long hint) and the job completes with a PDF", async () => {
    const artifact = await convertToPdf("tiny.html", HTML);
    expect(artifact.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  }, 90_000);

  it("converts a page whose only external reference is a hyperlink", async () => {
    // The pre-scan read every href as a resource fetch, so one <a> was enough
    // to abort the whole conversion (#1157). Nothing dereferences an anchor.
    const page = Buffer.from(
      "<!doctype html><html><body>" +
        '<p>See <a href="https://example.com">the docs</a>.</p>' +
        "</body></html>",
    );
    const artifact = await convertToPdf("linked.html", page);
    expect(artifact.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  }, 90_000);

  it("SSRF CONTRACT: converts a page with remote refs and requests none of them", async () => {
    const remote = await startRequestRecorder();
    try {
      await remote.probe();
      const page = Buffer.from(
        "<!doctype html><html><head>" +
          `<link rel="stylesheet" href="${remote.origin}/theme.css">` +
          "</head><body><p>before</p>" +
          `<img src="${remote.origin}/tracker.png" alt="tracker">` +
          "<p>after</p></body></html>",
      );
      const artifact = await convertToPdf("remote.html", page);
      expect(artifact.buffer.subarray(0, 5).toString()).toBe("%PDF-");
      expect(remote.requests).toEqual([]);
      expect(remote.connections()).toBe(0);
    } finally {
      await remote.close();
    }
  }, 90_000);
});

// Ungated: runs locally without weasyprint
it("rejects a .txt file with 415", async () => {
  const txtContent = Buffer.from("hello world");
  const res = await runTool("readme.txt", txtContent);
  expect(res.statusCode).toBe(415);
});
