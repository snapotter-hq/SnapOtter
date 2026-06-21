import { createWriteStream, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import archiver from "archiver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const CSV_A = readFixture(fixtures.data.csvA);
const CSV_B = readFixture(fixtures.data.csvB);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

/** Build a zip buffer in memory using archiver. */
async function buildZipBuffer(entries: Array<{ name: string; content: Buffer }>): Promise<Buffer> {
  const tmpDir = join(tmpdir(), `extract-zip-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const zipPath = join(tmpDir, "test.zip");

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 1 } });
    output.on("close", () => resolve());
    archive.on("error", (err: Error) => reject(err));
    archive.pipe(output);
    for (const entry of entries) {
      archive.append(entry.content, { name: entry.name });
    }
    void archive.finalize();
  });

  const buf = readFileSync(zipPath);
  await rm(tmpDir, { recursive: true, force: true });
  return buf;
}

async function runExtract(filename: string, content: Buffer) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/zip", content },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/files/extract-zip",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("extract-zip (pure JS, no skipIf)", () => {
  it("extracts a two-entry zip into _extracted.zip with PK magic and resultPayload", async () => {
    const zipBuf = await buildZipBuffer([
      { name: "tiny-a.csv", content: CSV_A },
      { name: "tiny-b.csv", content: CSV_B },
    ]);

    const res = await runExtract("test.zip", zipBuf);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    // resultPayload is spread into the envelope
    expect(envelope.entries).toBeDefined();
    expect(envelope.entries).toHaveLength(2);

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    // Output should be a zip (_extracted.zip)
    expect(dl.rawPayload[0]).toBe(0x50);
    expect(dl.rawPayload[1]).toBe(0x4b);
  }, 30_000);

  it("extracts a single-entry zip returning the bare file content", async () => {
    const content = Buffer.from("hello world from extract-zip test");
    const zipBuf = await buildZipBuffer([{ name: "readme.txt", content }]);

    const res = await runExtract("single.zip", zipBuf);
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();
    // resultPayload is spread into the envelope
    expect(envelope.entries).toBeDefined();
    expect(envelope.entries).toHaveLength(1);
    expect(envelope.entries[0].name).toBe("readme.txt");

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);

    // Content should match the original
    expect(dl.payload).toBe("hello world from extract-zip test");
  }, 30_000);

  it("rejects a zip with path traversal (../evil.txt) with 400", async () => {
    // Most zip libraries sanitize entry names, so we binary-patch
    // a placeholder to inject "../evil.txt" into the raw zip bytes.
    const zip = new AdmZip();
    // Placeholder same length as "../evil.txt" (11 chars)
    zip.addFile("XXXXXXXXXXX", Buffer.from("evil"));
    const zipBuf = Buffer.from(zip.toBuffer());

    const placeholder = Buffer.from("XXXXXXXXXXX");
    const replacement = Buffer.from("../evil.txt");
    let offset = zipBuf.indexOf(placeholder);
    while (offset !== -1) {
      replacement.copy(zipBuf, offset);
      offset = zipBuf.indexOf(placeholder, offset + 1);
    }

    const res = await runExtract("traversal.zip", zipBuf);
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    // Path traversal is now rejected pre-enqueue with a clean 400 InputValidationError,
    // whose message is surfaced in `error` (the legacy worker path used `details`/422).
    expect(parsed.error).toMatch(/unsafe entry path|invalid relative path/i);
  }, 30_000);

  it("rejects a high-ratio zip bomb with 422", async () => {
    // Create a 60 MiB zero buffer - compresses to a very small zip
    const bomb = Buffer.alloc(60 * 1024 * 1024, 0);
    const zipBuf = await buildZipBuffer([{ name: "bomb.bin", content: bomb }]);

    // The zip itself should be very small due to compression
    expect(zipBuf.length).toBeLessThan(1 * 1024 * 1024);

    const res = await runExtract("bomb.zip", zipBuf);
    expect(res.statusCode).toBe(422);
    const parsed = JSON.parse(res.body);
    expect(parsed.details).toMatch(/suspicious compression/i);
  }, 60_000);
});
