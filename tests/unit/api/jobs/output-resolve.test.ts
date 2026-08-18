import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_BUFFERED_OUTPUT_BYTES,
  resolveOutputSource,
} from "../../../../apps/api/src/jobs/output-resolve.js";

/**
 * Regression coverage for Sentry NODE-2Z: tool outputs over Node's 2 GiB
 * fs.readFile cap crashed the job with ERR_FS_FILE_TOO_LARGE after the actual
 * processing had already succeeded. Oversized scratch files must resolve to a
 * streamable source instead of a buffer.
 */
describe("resolveOutputSource", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = "";
  });

  async function scratchFile(bytes: number): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), "snapotter-output-resolve-"));
    const p = join(dir, "out.bin");
    await writeFile(p, Buffer.alloc(bytes, 7));
    return p;
  }

  it("passes an in-memory buffer through untouched", async () => {
    const buffer = Buffer.from("result-bytes");
    const out = await resolveOutputSource({ buffer }, "unused message");

    expect(out).toEqual({ kind: "buffer", buffer, size: buffer.length });
  });

  it("buffers a scratch file under the cap, as before", async () => {
    const p = await scratchFile(4096);
    const out = await resolveOutputSource({ scratchPath: p }, "unused message");

    expect(out.kind).toBe("buffer");
    expect(out.size).toBe(4096);
    expect(out.kind === "buffer" && out.buffer.length).toBe(4096);
  });

  it("resolves an over-cap scratch file to a streamable source instead of buffering", async () => {
    const p = await scratchFile(4096);
    const out = await resolveOutputSource({ scratchPath: p }, "unused message", {
      maxBufferedBytes: 1024,
    });

    expect(out).toEqual({ kind: "stream", scratchPath: p, size: 4096 });
  });

  it("throws the caller's exact message when neither buffer nor scratchPath is present", async () => {
    // Call sites pass their full historical strings; worker-branches
    // integration tests pin them verbatim.
    await expect(
      resolveOutputSource({}, "Tool x returned neither buffer nor scratchPath"),
    ).rejects.toThrow("Tool x returned neither buffer nor scratchPath");
  });

  it("keeps the default cap under Node's 2 GiB single-read limit", () => {
    expect(MAX_BUFFERED_OUTPUT_BYTES).toBeLessThan(2 ** 31);
    // With margin: a result at the cap still has to survive readFile.
    expect(MAX_BUFFERED_OUTPUT_BYTES).toBeLessThanOrEqual(1.5 * 1024 ** 3);
  });
});
