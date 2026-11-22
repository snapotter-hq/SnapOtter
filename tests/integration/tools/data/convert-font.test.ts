import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { findMissingGeneratedPythonPrerequisite } from "../../../helpers/python-gate.js";
import { waitForDownloadedJobArtifact } from "../../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const hasFontTools = !findMissingGeneratedPythonPrerequisite("convert-font", {});

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
});

afterAll(async () => {
  await testApp.cleanup();
});

async function runTool(
  filename: string,
  content: Buffer,
  settings: Record<string, unknown>,
  toolId = "convert-font",
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: `/api/v1/tools/files/${toolId}`,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** The converted bytes and filename, through the 202 path when the sync window closes. */
async function convertedFont(res: Awaited<ReturnType<typeof runTool>>, toolId = "convert-font") {
  const envelope = JSON.parse(res.body);
  if (res.statusCode === 202) {
    const artifact = await waitForDownloadedJobArtifact(
      testApp.app,
      adminToken,
      toolId,
      envelope.jobId,
    );
    return { bytes: artifact.buffer, filename: artifact.filename };
  }
  expect(res.statusCode).toBe(200);
  const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
  expect(dl.statusCode).toBe(200);
  return { bytes: Buffer.from(dl.rawPayload), filename: envelope.downloadUrl as string };
}

describe("convert-font input checks (no fontTools needed)", () => {
  it("rejects a non-font with 400 before queueing a job", async () => {
    const res = await runTool("fake.ttf", Buffer.from("%PDF-1.7 not a font"), { format: "woff2" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("isn't a TTF");
  });

  it("rejects a non-font sent to a font preset with 400 before queueing a job (#5053)", async () => {
    // A worker-side rejection answers with the same 400 (#1742), so only the
    // missing job row shows the preset ran convert-font's preValidate.
    const { db, schema } = await import("../../../../apps/api/src/db/index.js");
    const { eq } = await import("drizzle-orm");
    const presetJobs = () =>
      db.select().from(schema.jobs).where(eq(schema.jobs.toolId, "otf-to-ttf"));
    const before = (await presetJobs()).length;

    const res = await runTool("fake.otf", Buffer.from("%PDF-1.7 not a font"), {}, "otf-to-ttf");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("isn't a TTF");
    expect(await presetJobs()).toHaveLength(before);
  });

  it("rejects an unknown target format with 400", async () => {
    const res = await runTool("tiny.ttf", readFixture(fixtures.data.ttf), { format: "eot" });
    expect(res.statusCode).toBe(400);
  });
});

describe.skipIf(!hasFontTools)("convert-font (requires fontTools)", () => {
  const MAGIC: Record<string, string> = { ttf: "00010000", otf: "4f54544f", woff: "774f4646" };

  it.each([
    ["otf", "ttf"],
    ["ttf", "otf"],
    ["woff2", "woff"],
  ])(
    "converts %s to %s",
    async (source, target) => {
      const fixture = readFixture(fixtures.data[source as "ttf" | "otf" | "woff2"]);
      const { bytes, filename } = await convertedFont(
        await runTool(`tiny.${source}`, fixture, { format: target }),
      );
      expect(filename).toMatch(new RegExp(`\\.${target}$`));
      expect(bytes.subarray(0, 4).toString("hex")).toBe(MAGIC[target]);
    },
    60_000,
  );
});

describe.skipIf(!hasFontTools)("font conversion presets lock their target (#5053)", () => {
  const MAGIC: Record<string, string> = { ttf: "00010000", woff2: "774f4632" };

  it.each([
    ["otf-to-ttf", "otf", "ttf"],
    ["woff-to-ttf", "woff", "ttf"],
    ["woff2-to-ttf", "woff2", "ttf"],
    ["ttf-to-woff2", "ttf", "woff2"],
    ["ttf-to-woff2", "otf", "woff2"],
  ])(
    "%s turns a .%s into a .%s with no settings",
    async (toolId, source, target) => {
      const fixture = readFixture(fixtures.data[source as "ttf" | "otf" | "woff" | "woff2"]);
      const { bytes, filename } = await convertedFont(
        await runTool(`tiny.${source}`, fixture, {}, toolId),
        toolId,
      );
      expect(filename).toMatch(new RegExp(`\\.${target}$`));
      expect(bytes.subarray(0, 4).toString("hex")).toBe(MAGIC[target]);
    },
    60_000,
  );
});
