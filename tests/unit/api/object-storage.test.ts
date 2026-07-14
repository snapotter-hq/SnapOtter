import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import {
  copyObjectToFile,
  deleteObject,
  getObjectSize,
  getObjectStream,
  listObjects,
  objectExists,
  putObject,
  putObjectStream,
} from "../../../apps/api/src/lib/object-storage.js";

describe("object-storage (local backend)", () => {
  const key = `outputs/test-${process.pid}/hello.txt`;
  const copyKey = `outputs/test-${process.pid}/copy-source.bin`;
  const unavailableKey = `outputs/test-${process.pid}/unavailable.bin`;
  const copyDir = mkdtempSync(join(tmpdir(), "snapotter-object-copy-"));

  afterAll(async () => {
    await deleteObject(key).catch(() => {});
    await deleteObject(copyKey).catch(() => {});
    await deleteObject(unavailableKey).catch(() => {});
    rmSync(copyDir, { recursive: true, force: true });
  });

  it("round-trips buffers and streams with size and listing", async () => {
    await putObject(key, Buffer.from("hello world"));
    expect(await objectExists(key)).toBe(true);
    expect(await getObjectSize(key)).toBe(11);
    const chunks: Buffer[] = [];
    for await (const c of await getObjectStream(key)) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("hello world");
    const ranged: Buffer[] = [];
    for await (const c of await getObjectStream(key, { start: 6, end: 10 }))
      ranged.push(c as Buffer);
    expect(Buffer.concat(ranged).toString()).toBe("world");
    const listed = await listObjects(`outputs/test-${process.pid}/`);
    expect(listed.some((o) => o.key === key)).toBe(true);
    const streamKey = `outputs/test-${process.pid}/streamed.bin`;
    const written = await putObjectStream(streamKey, Readable.from([Buffer.alloc(1024, 1)]), {
      maxBytes: 2048,
    });
    expect(written).toBe(1024);
    await expect(
      putObjectStream(
        `outputs/test-${process.pid}/too-big.bin`,
        Readable.from([Buffer.alloc(4096, 1)]),
        {
          maxBytes: 2048,
        },
      ),
    ).rejects.toThrow(/exceeds/i);
    await deleteObject(streamKey);
  });

  it("rejects path traversal in keys", async () => {
    await expect(putObject("outputs/../../etc/passwd", Buffer.from("x"))).rejects.toThrow(
      /invalid/i,
    );
  });

  it("classifies operational streaming-write failures as temporary storage outages", async () => {
    const source = Readable.from(
      (async function* () {
        yield Buffer.from("partial");
        throw Object.assign(new Error("disk quota exhausted"), { code: "EDQUOT" });
      })(),
    );

    await expect(putObjectStream(unavailableKey, source)).rejects.toMatchObject({
      code: "EDQUOT",
      statusCode: 503,
    });
    await expect(objectExists(unavailableKey)).resolves.toBe(false);
  });

  it("streams an object to a file without exceeding the hard byte cap", async () => {
    const source = Buffer.alloc(4096, 0x5a);
    const destination = join(copyDir, "bounded.bin");
    await putObject(copyKey, source);

    await expect(copyObjectToFile(copyKey, destination, { maxBytes: source.length })).resolves.toBe(
      source.length,
    );
    expect(readFileSync(destination)).toEqual(source);
  });

  it("removes a partial destination when the streamed object exceeds its cap", async () => {
    const destination = join(copyDir, "oversized.bin");
    await putObject(copyKey, Buffer.alloc(4096, 0x41));

    await expect(copyObjectToFile(copyKey, destination, { maxBytes: 2048 })).rejects.toMatchObject({
      statusCode: 413,
    });
    expect(existsSync(destination)).toBe(false);
  });

  it("does not leave a destination behind when copying is canceled", async () => {
    const destination = join(copyDir, "canceled.bin");
    const controller = new AbortController();
    controller.abort();

    await expect(
      copyObjectToFile(copyKey, destination, {
        maxBytes: 4096,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(existsSync(destination)).toBe(false);
  });

  it("atomically replaces a stale destination left by a crashed attempt", async () => {
    const destination = join(copyDir, "stale-retry.bin");
    const source = Buffer.from("fresh object bytes");
    writeFileSync(destination, "stale partial bytes");
    await putObject(copyKey, source);

    await expect(copyObjectToFile(copyKey, destination, { maxBytes: source.length })).resolves.toBe(
      source.length,
    );
    expect(readFileSync(destination)).toEqual(source);
  });
});
