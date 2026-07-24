import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import {
  computeWorkspaceUsedBytes,
  copyObjectToFile,
  copyReadableToFile,
  deleteObject,
  deletePrefix,
  getObjectBuffer,
  getObjectSize,
  getObjectStream,
  listJobDirs,
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

  it("reads a stored object back as a single concatenated buffer", async () => {
    await putObject(key, Buffer.from("hello world"));
    const buf = await getObjectBuffer(key);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString()).toBe("hello world");
  });

  it("rejects copyObjectToFile with a negative maxBytes ceiling", async () => {
    await expect(
      copyObjectToFile(copyKey, join(copyDir, "never.bin"), { maxBytes: -1 }),
    ).rejects.toThrow(/non-negative safe integer/);
  });

  it("rejects copyObjectToFile with a non-safe-integer maxBytes ceiling", async () => {
    await expect(
      copyObjectToFile(copyKey, join(copyDir, "never.bin"), {
        maxBytes: Number.MAX_SAFE_INTEGER + 2,
      }),
    ).rejects.toThrow(/non-negative safe integer/);
  });

  it("spools an arbitrary readable straight to a destination file", async () => {
    const destination = join(copyDir, "readable.bin");
    const written = await copyReadableToFile(
      Readable.from([Buffer.from("ab"), Buffer.from("cd")]),
      destination,
      { maxBytes: 10 },
    );
    expect(written).toBe(4);
    expect(readFileSync(destination).toString()).toBe("abcd");
  });

  it("rejects copyReadableToFile with a negative maxBytes ceiling", async () => {
    await expect(
      copyReadableToFile(Readable.from([Buffer.from("x")]), join(copyDir, "never2.bin"), {
        maxBytes: -5,
      }),
    ).rejects.toThrow(/non-negative safe integer/);
  });

  it("enforces the byte cap while streaming a readable to a file and cleans up", async () => {
    const destination = join(copyDir, "readable-capped.bin");
    await expect(
      copyReadableToFile(Readable.from([Buffer.alloc(16, 1)]), destination, { maxBytes: 8 }),
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(existsSync(destination)).toBe(false);
  });
});

describe("object-storage local prefix + listing operations", () => {
  // These operate on the real per-fork WORKSPACE_PATH (STORAGE_MODE defaults to
  // "local"), so use a job id unique to this file to avoid colliding with the
  // round-trip suite above.
  const jobId = `listjob-${process.pid}`;
  const uploadDir = join(env.WORKSPACE_PATH, "uploads", jobId);
  const outputDir = join(env.WORKSPACE_PATH, "outputs", jobId);

  afterAll(async () => {
    await deletePrefix(`uploads/${jobId}`).catch(() => {});
    await deletePrefix(`outputs/${jobId}`).catch(() => {});
  });

  it("lists only files under a prefix with their sizes and mtimes", async () => {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, "a.txt"), Buffer.from("hi"));
    await writeFile(join(uploadDir, "b.txt"), Buffer.from("world!"));
    // A nested directory must be ignored: listObjects only reports files.
    await mkdir(join(uploadDir, "nested"), { recursive: true });

    const listed = await listObjects(`uploads/${jobId}`);
    const byKey = new Map(listed.map((o) => [o.key, o]));
    expect(byKey.get(`uploads/${jobId}/a.txt`)?.size).toBe(2);
    expect(byKey.get(`uploads/${jobId}/b.txt`)?.size).toBe(6);
    expect(byKey.has(`uploads/${jobId}/nested`)).toBe(false);
    for (const o of listed) expect(o.mtimeMs).toBeGreaterThan(0);
  });

  it("returns an empty list for a prefix whose directory does not exist", async () => {
    expect(await listObjects(`outputs/missing-${process.pid}`)).toEqual([]);
  });

  it("rejects listObjects for a prefix outside the allowed roots", async () => {
    await expect(listObjects("secrets/job-1")).rejects.toThrow(/invalid prefix/i);
  });

  it("rejects listObjects for a prefix containing a parent traversal", async () => {
    await expect(listObjects("uploads/..")).rejects.toThrow(/invalid prefix/i);
  });

  it("lists top-level job directories under a prefix, ignoring stray files", async () => {
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "result.bin"), Buffer.from("done"));
    // A file directly under outputs/ must not be reported as a job dir.
    const strayFile = join(env.WORKSPACE_PATH, "outputs", `stray-${process.pid}.txt`);
    await mkdir(join(env.WORKSPACE_PATH, "outputs"), { recursive: true });
    await writeFile(strayFile, Buffer.from("x"));

    try {
      const dirs = await listJobDirs("outputs");
      const keys = dirs.map((d) => d.key);
      expect(keys).toContain(`outputs/${jobId}`);
      expect(keys).not.toContain(`outputs/stray-${process.pid}.txt`);
      const entry = dirs.find((d) => d.key === `outputs/${jobId}`);
      expect(entry?.size).toBe(0);
      expect(entry?.mtimeMs).toBeGreaterThan(0);
    } finally {
      rmSync(strayFile, { force: true });
    }
  });

  it("returns an empty job-dir list when the prefix root is absent", async () => {
    // Point listJobDirs at a prefix root that has never been created. uploads/
    // may exist from the listing test, so isolate via a throwaway workspace.
    const originalWorkspace = env.WORKSPACE_PATH;
    const emptyRoot = mkdtempSync(join(tmpdir(), "snapotter-empty-ws-"));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = emptyRoot;
    try {
      expect(await listJobDirs("uploads")).toEqual([]);
    } finally {
      (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = originalWorkspace;
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it("removes an entire job prefix from local storage", async () => {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, "doomed.bin"), Buffer.from("bye"));
    expect(existsSync(uploadDir)).toBe(true);

    await deletePrefix(`uploads/${jobId}`);
    expect(existsSync(uploadDir)).toBe(false);
  });

  it("treats deleting a non-existent prefix as a no-op (force removal)", async () => {
    await expect(deletePrefix(`uploads/gone-${process.pid}`)).resolves.toBeUndefined();
  });

  it("rejects deletePrefix for a prefix outside the allowed roots", async () => {
    await expect(deletePrefix("etc/passwd")).rejects.toThrow(/invalid prefix/i);
  });
});

describe("object-storage missing-key + robustness paths", () => {
  it("reports a missing object as non-existent instead of throwing", async () => {
    expect(await objectExists(`outputs/absent-${process.pid}/none.bin`)).toBe(false);
  });

  it("propagates a stat error as a rejection from getObjectSize on a missing key", async () => {
    await expect(getObjectSize(`outputs/absent-${process.pid}/none.bin`)).rejects.toBeDefined();
  });

  it("silently ignores deleting an object that is not present", async () => {
    await expect(deleteObject(`outputs/absent-${process.pid}/none.bin`)).resolves.toBeUndefined();
  });

  it("skips a workspace entry that is a file where a job directory was expected", async () => {
    // computeWorkspaceUsedBytes shallow-walks <root>/uploads/<jobDir>. When a
    // plain file sits directly under uploads/, readdir on it throws ENOTDIR and
    // the walk must `continue` past it, contributing 0.
    const root = mkdtempSync(join(tmpdir(), "snapotter-wscap-file-"));
    try {
      await mkdir(join(root, "uploads"), { recursive: true });
      await writeFile(join(root, "uploads", "not-a-dir"), Buffer.alloc(500));
      await mkdir(join(root, "uploads", "realjob"), { recursive: true });
      await writeFile(join(root, "uploads", "realjob", "f.bin"), Buffer.alloc(700));
      expect(await computeWorkspaceUsedBytes(root)).toBe(700);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
