// markdown-to-pdf integration suite.
// Requires WeasyPrint AND the markdown Python module. No automated lane
// installs either (#1174), so these skip unless the resolved interpreter has
// them; locally, symlink a venv that does to .venv.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { pythonWith } from "../../../helpers/python-gate.js";
import { waitForDownloadedJobArtifact } from "../../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const MD = readFixture(fixtures.document.tiny("md"));

const hasWeasyprint = pythonWith("weasyprint");
const hasMarkdownMod = pythonWith("markdown");

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
    url: "/api/v1/tools/files/markdown-to-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** markdown-to-pdf is a "long" tool: it answers 202 + jobId and runs async. */
async function convertToPdf(filename: string, content: Buffer) {
  const res = await runTool(filename, content);
  expect(res.statusCode).toBe(202);
  const { jobId } = JSON.parse(res.body) as { jobId: string };
  return waitForDownloadedJobArtifact(testApp.app, adminToken, "markdown-to-pdf", jobId);
}

describe.skipIf(!hasWeasyprint || !hasMarkdownMod)(
  "markdown-to-pdf (requires weasyprint + markdown)",
  () => {
    it("returns 202 (long hint) and the job completes with a PDF", async () => {
      const artifact = await convertToPdf("tiny.md", MD);
      expect(artifact.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    }, 90_000);

    it("converts a note whose only external reference is an inline link", async () => {
      // md.markdown() rewrites [docs](https://...) into <a href="https://...">,
      // so the pre-scan rejected HTML the user never wrote: a one-link note
      // could not be converted at all (#1157).
      const note = Buffer.from("# Notes\n\nSee [the docs](https://example.com) for more.\n");
      const artifact = await convertToPdf("linked.md", note);
      expect(artifact.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    }, 90_000);
  },
);

// Ungated: runs locally without weasyprint/markdown
it("rejects a .txt file with 415", async () => {
  const txtContent = Buffer.from("hello world");
  const res = await runTool("readme.txt", txtContent);
  expect(res.statusCode).toBe(415);
});
