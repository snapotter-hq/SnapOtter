import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it, vi } from "vitest";
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
  const abortSetupJobId = `abort-setup-${process.pid}`;
  const visibilityJobId = `stream-visibility-${process.pid}`;
  const failureJobId = `stream-failure-${process.pid}`;
  const semanticsJobId = `stream-semantics-${process.pid}`;
  const collisionJobId = `stream-collision-${process.pid}`;
  const copyDir = mkdtempSync(join(tmpdir(), "snapotter-object-copy-"));

  const jobEntries = (jobId: string): string[] => {
    try {
      return readdirSync(join(env.WORKSPACE_PATH, "outputs", jobId)).sort();
    } catch {
      return [];
    }
  };

  afterAll(async () => {
    await deleteObject(key).catch(() => {});
    await deleteObject(copyKey).catch(() => {});
    await deleteObject(unavailableKey).catch(() => {});
    await deletePrefix(`outputs/${abortSetupJobId}`).catch(() => {});
    await deletePrefix(`outputs/${visibilityJobId}`).catch(() => {});
    await deletePrefix(`outputs/${failureJobId}`).catch(() => {});
    await deletePrefix(`outputs/${semanticsJobId}`).catch(() => {});
    await deletePrefix(`outputs/${collisionJobId}`).catch(() => {});
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

  it("rejects a pre-pipeline abort without emitting an unhandled source error", () => {
    const objectStoragePath = join(process.cwd(), "apps/api/src/lib/object-storage.ts");
    const tsxPath = join(process.cwd(), "apps/api/node_modules/.bin/tsx");
    const childScript = `
      import { PassThrough } from "node:stream";
      import { putObjectStream } from ${JSON.stringify(objectStoragePath)};

      void (async () => {
        const source = new PassThrough();
        const controller = new AbortController();
        const observed = putObjectStream(
          ${JSON.stringify(`outputs/${abortSetupJobId}/target.bin`)},
          source,
          { signal: controller.signal },
        ).then(
          () => ({ resolved: true }),
          (error) => ({ error }),
        );
        source.write(Buffer.from("partial"));
        await new Promise((resolve) => setImmediate(resolve));
        controller.abort();
        const result = await observed;
        if (!("error" in result) || result.error?.name !== "AbortError") {
          process.exitCode = 2;
          return;
        }
        process.stdout.write("clean-abort");
      })();
    `;

    const result = spawnSync(tsxPath, ["--eval", childScript], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, MAX_WORKSPACE_SIZE_GB: "0" },
      timeout: 10_000,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("clean-abort");
  });

  it("does not expose an in-flight object or its staging file through listing", async () => {
    const inFlightKey = `outputs/${visibilityJobId}/target.bin`;
    let releaseSource!: () => void;
    const sourceReleased = new Promise<void>((resolve) => {
      releaseSource = resolve;
    });
    let markFirstChunkConsumed!: () => void;
    const firstChunkConsumed = new Promise<void>((resolve) => {
      markFirstChunkConsumed = resolve;
    });
    const source = Readable.from(
      (async function* () {
        yield Buffer.from("partial");
        markFirstChunkConsumed();
        await sourceReleased;
        yield Buffer.from(" complete");
      })(),
    );
    const pendingWrite = putObjectStream(inFlightKey, source);

    let duringWrite: Awaited<ReturnType<typeof listObjects>> = [];
    try {
      await firstChunkConsumed;
      duringWrite = await listObjects(`outputs/${visibilityJobId}`);
    } finally {
      releaseSource();
    }
    await expect(pendingWrite).resolves.toBe(16);

    expect(duringWrite).toEqual([]);
    await expect(listObjects(`outputs/${visibilityJobId}`)).resolves.toMatchObject([
      { key: inFlightKey, size: 16 },
    ]);
  });

  it("does not leave an object after a streaming source fails", async () => {
    let orphaned = false;
    for (let i = 0; i < 500; i += 1) {
      const failedKey = `outputs/${failureJobId}/${i}.bin`;
      const source = Readable.from(
        (async function* () {
          yield Buffer.from("partial");
          throw Object.assign(new Error("disk quota exhausted"), { code: "EDQUOT" });
        })(),
      );

      await expect(putObjectStream(failedKey, source)).rejects.toMatchObject({
        code: "EDQUOT",
        statusCode: 503,
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      orphaned = await objectExists(failedKey);
      await deleteObject(failedKey);
      if (orphaned) break;
    }

    expect(orphaned).toBe(false);
  });

  it("preserves a committed object and removes staging after a source failure", async () => {
    const destinationKey = `outputs/${semanticsJobId}/source-failure.bin`;
    await putObject(destinationKey, Buffer.from("committed"));
    const source = Readable.from(
      (async function* () {
        yield Buffer.from("partial");
        throw Object.assign(new Error("disk quota exhausted"), { code: "EDQUOT" });
      })(),
    );

    await expect(putObjectStream(destinationKey, source)).rejects.toMatchObject({
      code: "EDQUOT",
      statusCode: 503,
    });

    await expect(getObjectBuffer(destinationKey)).resolves.toEqual(Buffer.from("committed"));
    expect(jobEntries(semanticsJobId)).toEqual(["source-failure.bin"]);
  });

  it("preserves a committed object and removes staging after maxBytes rejection", async () => {
    const destinationKey = `outputs/${semanticsJobId}/too-large.bin`;
    await putObject(destinationKey, Buffer.from("committed"));

    await expect(
      putObjectStream(destinationKey, Readable.from([Buffer.alloc(16, 1)]), { maxBytes: 8 }),
    ).rejects.toMatchObject({ statusCode: 413 });

    await expect(getObjectBuffer(destinationKey)).resolves.toEqual(Buffer.from("committed"));
    expect(jobEntries(semanticsJobId)).toEqual(["source-failure.bin", "too-large.bin"]);
  });

  it("preserves a committed object and removes staging after an in-flight abort", async () => {
    const destinationKey = `outputs/${semanticsJobId}/aborted.bin`;
    await putObject(destinationKey, Buffer.from("committed"));
    const controller = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const aborted = new Promise<void>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    const source = Readable.from(
      (async function* () {
        yield Buffer.from("partial");
        markStarted();
        await aborted;
      })(),
    );
    const pendingWrite = putObjectStream(destinationKey, source, { signal: controller.signal });
    await started;
    controller.abort();

    await expect(pendingWrite).rejects.toMatchObject({ name: "AbortError" });
    await expect(getObjectBuffer(destinationKey)).resolves.toEqual(Buffer.from("committed"));
    expect(jobEntries(semanticsJobId)).toEqual([
      "aborted.bin",
      "source-failure.bin",
      "too-large.bin",
    ]);
  });

  it("keeps the committed object visible until success atomically replaces it", async () => {
    const destinationKey = `outputs/${semanticsJobId}/replacement.bin`;
    await putObject(destinationKey, Buffer.from("committed"));
    let releaseSource!: () => void;
    const sourceReleased = new Promise<void>((resolve) => {
      releaseSource = resolve;
    });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const source = Readable.from(
      (async function* () {
        yield Buffer.from("fresh ");
        markStarted();
        await sourceReleased;
        yield Buffer.from("bytes");
      })(),
    );
    const pendingWrite = putObjectStream(destinationKey, source);

    await started;
    await expect(getObjectBuffer(destinationKey)).resolves.toEqual(Buffer.from("committed"));
    const listedKeys = (await listObjects(`outputs/${semanticsJobId}`)).map((object) => object.key);
    expect(listedKeys.some((listedKey) => listedKey.includes(".partial"))).toBe(false);
    releaseSource();

    await expect(pendingWrite).resolves.toBe(11);
    await expect(getObjectBuffer(destinationKey)).resolves.toEqual(Buffer.from("fresh bytes"));
    expect(jobEntries(semanticsJobId)).toEqual([
      "aborted.bin",
      "replacement.bin",
      "source-failure.bin",
      "too-large.bin",
    ]);
  });

  it("does not delete an unowned object staging file after an exclusive-create collision", async () => {
    const collisionId = "00000000-0000-4000-8000-000000000000";
    const destinationKey = `outputs/${collisionJobId}/target.bin`;
    const stagingDir = join(env.WORKSPACE_PATH, "outputs", collisionJobId, ".snapotter-staging");
    const stagingPath = join(stagingDir, `target.bin.${collisionId}.partial`);
    await putObject(destinationKey, Buffer.from("committed"));
    await mkdir(stagingDir, { recursive: true });
    await writeFile(stagingPath, Buffer.from("owned by another writer"));
    vi.resetModules();
    vi.doMock("node:crypto", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:crypto")>();
      return { ...actual, randomUUID: () => collisionId };
    });

    try {
      const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
      await expect(
        isolatedStorage.putObjectStream(destinationKey, Readable.from([Buffer.from("fresh")])),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(readFileSync(stagingPath).toString()).toBe("owned by another writer");
      await expect(isolatedStorage.getObjectBuffer(destinationKey)).resolves.toEqual(
        Buffer.from("committed"),
      );
    } finally {
      vi.doUnmock("node:crypto");
      vi.resetModules();
      await deletePrefix(`outputs/${collisionJobId}`).catch(() => {});
    }
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

  it("does not delete an unowned copy staging file after an exclusive-create collision", async () => {
    const collisionId = "00000000-0000-4000-8000-000000000001";
    const destination = join(copyDir, "copy-collision.bin");
    const stagingPath = `${destination}.${collisionId}.partial`;
    writeFileSync(stagingPath, "owned by another copy");
    vi.resetModules();
    vi.doMock("node:crypto", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:crypto")>();
      return { ...actual, randomUUID: () => collisionId };
    });

    try {
      const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
      await expect(
        isolatedStorage.copyReadableToFile(Readable.from([Buffer.from("fresh")]), destination),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(readFileSync(stagingPath).toString()).toBe("owned by another copy");
    } finally {
      vi.doUnmock("node:crypto");
      vi.resetModules();
      rmSync(stagingPath, { force: true });
    }
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
