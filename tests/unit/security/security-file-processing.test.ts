import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Helper that mirrors the writeTempExclusive pattern used in
 * format-decoders.ts and heic-converter.ts.
 */
async function writeTempExclusive(filePath: string, buffer: Buffer): Promise<void> {
  const fh = await open(filePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
  try {
    await fh.writeFile(buffer);
  } finally {
    await fh.close();
  }
}

describe("Temp file exclusive creation (O_EXCL)", () => {
  it("creates a new temp file successfully", async () => {
    const filePath = join(tmpdir(), `test-excl-${randomUUID()}.tmp`);
    try {
      await writeTempExclusive(filePath, Buffer.from("test data"));
      const info = await stat(filePath);
      expect(info.size).toBe(9);
    } finally {
      await rm(filePath, { force: true }).catch(() => {});
    }
  });

  it("fails if the file already exists (prevents overwrite)", async () => {
    const filePath = join(tmpdir(), `test-excl-${randomUUID()}.tmp`);
    try {
      // Create the file first
      await writeTempExclusive(filePath, Buffer.from("original"));
      // Attempting to write again should fail with EEXIST
      await expect(writeTempExclusive(filePath, Buffer.from("overwrite"))).rejects.toThrow();
      // Verify original content is preserved
      const fh = await open(filePath, constants.O_RDONLY);
      try {
        const buf = await fh.readFile();
        expect(buf.toString("utf-8")).toBe("original");
      } finally {
        await fh.close();
      }
    } finally {
      await rm(filePath, { force: true }).catch(() => {});
    }
  });

  it("cleans up in finally blocks even after write failure", async () => {
    const filePath = join(tmpdir(), `test-excl-${randomUUID()}.tmp`);
    // Pre-create to force the exclusive open to fail
    await writeTempExclusive(filePath, Buffer.from("existing"));
    try {
      try {
        await writeTempExclusive(filePath, Buffer.from("new"));
      } catch {
        // Expected failure
      }
      // Cleanup should still work
      await rm(filePath, { force: true });
      await expect(stat(filePath)).rejects.toThrow();
    } finally {
      // Ensure cleanup in case test itself fails
      await rm(filePath, { force: true }).catch(() => {});
    }
  });
});
