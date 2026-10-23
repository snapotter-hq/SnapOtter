import { spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import {
  assertLocalCapacity,
  computeWorkspaceUsedBytes,
  copyObjectToFile,
  copyReadableToFile,
  deleteObject,
  deletePrefix,
  getObjectBuffer,
  getObjectSize,
  getObjectStream,
  isValidObjectKey,
  listJobDirs,
  listObjects,
  normalizeOperationalWriteError,
  objectExists,
  putObject,
  putObjectStream,
  STORAGE_WRITE_FAILED_MESSAGE,
  verifyS3Bucket,
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
  const putPartialJobId = `put-partial-${process.pid}`;
  const putCollisionJobId = `put-collision-${process.pid}`;
  const putConcurrentJobId = `put-concurrent-${process.pid}`;
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
    await deletePrefix(`outputs/${putPartialJobId}`).catch(() => {});
    await deletePrefix(`outputs/${putCollisionJobId}`).catch(() => {});
    await deletePrefix(`outputs/${putConcurrentJobId}`).catch(() => {});
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
      isSafeMessage: true,
      kind: "operational",
      code: "storage-full",
      statusCode: 503,
      cause: expect.objectContaining({ code: "EDQUOT" }),
    });
    await expect(objectExists(unavailableKey)).resolves.toBe(false);
  });

  // #1421: without a status, a tool route answered every failed write as a
  // malformed request (400), unreported. Each one now says whose it is.
  describe("a failed streaming write", () => {
    function failingSource(error: unknown): Readable {
      return Readable.from(
        (async function* () {
          yield Buffer.from("partial");
          throw error;
        })(),
      );
    }

    it.each([
      ["a full disk", { code: "ENOSPC", syscall: "write" }, "storage-full"],
      ["a read-only volume", { code: "EROFS", syscall: "open" }, "storage-not-writable"],
      ["no permission", { code: "EPERM", syscall: "open" }, "storage-not-writable"],
      ["another I/O failure", { code: "EIO", syscall: "write" }, "storage-write-failed"],
    ])("answers %s with a 503 naming it", async (_case, errno, code) => {
      const cause = Object.assign(new Error(`${errno.code}: simulated`), errno);
      await expect(putObjectStream(unavailableKey, failingSource(cause))).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code,
        statusCode: 503,
        cause,
      });
    });

    it("keeps a client's fault as it is", async () => {
      const clientFault = Object.assign(new Error("Unexpected end of form"), { statusCode: 400 });
      await expect(putObjectStream(unavailableKey, failingSource(clientFault))).rejects.toBe(
        clientFault,
      );
      expect(clientFault.statusCode).toBe(400);
    });

    it("makes anything else ours: a 500, not a malformed request", async () => {
      const bug = new TypeError("Cannot read properties of undefined");
      await expect(putObjectStream(unavailableKey, failingSource(bug))).rejects.toBe(bug);
      expect((bug as TypeError & { statusCode?: number }).statusCode).toBe(500);
    });

    it("classifies an AbortSignal.timeout abort (in-flight, pre-aborted, or pipeline AbortError cause) as 503 storage-write-failed (#2881)", async () => {
      const stalled = new PassThrough();
      stalled.write(Buffer.from("partial"));
      const timeoutSignal = AbortSignal.timeout(50);
      const inFlightErr = await putObjectStream(unavailableKey, stalled, {
        signal: timeoutSignal,
      }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(timeoutSignal.reason).toMatchObject({ name: "TimeoutError" });
      expect(inFlightErr).toMatchObject({
        message: STORAGE_WRITE_FAILED_MESSAGE,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: timeoutSignal.reason,
      });
      await expect(objectExists(unavailableKey)).resolves.toBe(false);

      // Pre-aborted timeout signal (e.g., shared uploadSignal expired before extra output).
      const preAbortedSource = Readable.from([Buffer.from("extra")]);
      await expect(
        putObjectStream(unavailableKey, preAbortedSource, {
          signal: timeoutSignal,
        }),
      ).rejects.toMatchObject({
        message: STORAGE_WRITE_FAILED_MESSAGE,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: timeoutSignal.reason,
      });
      expect(preAbortedSource.destroyed).toBe(true);
      await expect(objectExists(unavailableKey)).resolves.toBe(false);

      // Node's pipeline(..., { signal }) wraps a signal timeout in AbortError({ cause: TimeoutError }).
      const timeoutCause = new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      );
      const pipelineWrappedAbort = Object.assign(
        new Error("The operation was aborted", { cause: timeoutCause }),
        { name: "AbortError", code: "ABORT_ERR" },
      );
      await expect(
        putObjectStream(unavailableKey, failingSource(pipelineWrappedAbort)),
      ).rejects.toMatchObject({
        message: STORAGE_WRITE_FAILED_MESSAGE,
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: timeoutCause,
      });
    });
  });

  // #2120: putObject let a raw errno through, so a route's catch-all read a
  // full or read-only volume as a bad file (422).
  it("answers a failed buffer write with a 503 naming the condition", async () => {
    // A file where the job directory should be: creating it fails with EEXIST.
    const blocker = join(env.WORKSPACE_PATH, "outputs", `put-blocker-${process.pid}`);
    await mkdir(join(env.WORKSPACE_PATH, "outputs"), { recursive: true });
    writeFileSync(blocker, "x");
    try {
      await expect(
        putObject(`outputs/put-blocker-${process.pid}/page-1.png`, Buffer.from("y")),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: expect.objectContaining({ syscall: "mkdir" }),
      });
    } finally {
      rmSync(blocker, { force: true });
    }
  });

  // #1494: putObject wrote straight to the final key, so an ENOSPC mid-write
  // left a non-empty truncated file that stranded-job reconciliation adopted.
  it("stages putObject writes and unlinks a partial write on ENOSPC so nothing is left at the key", async () => {
    const partialKey = `outputs/${putPartialJobId}/out.png`;
    const committedKey = `outputs/${putPartialJobId}/existing.png`;
    const stagingDir = join(env.WORKSPACE_PATH, "outputs", putPartialJobId, ".snapotter-staging");
    await putObject(committedKey, Buffer.from("committed"));
    expect(jobEntries(putPartialJobId)).toEqual(["existing.png"]);
    let midWriteObjects: Array<{ key: string; size: number }> = [];
    let midWriteStagingEntries: string[] = [];

    vi.resetModules();
    let isolatedStorage!: typeof import("../../../apps/api/src/lib/object-storage.js");
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        writeFile: async (
          target: Parameters<typeof actual.writeFile>[0],
          _data: Parameters<typeof actual.writeFile>[1],
          options?: Parameters<typeof actual.writeFile>[2],
        ) => {
          await actual.writeFile(target, Buffer.from("trunc"), options);
          midWriteObjects = (await isolatedStorage.listObjects(`outputs/${putPartialJobId}`)).map(
            (o) => ({ key: o.key, size: o.size }),
          );
          midWriteStagingEntries = readdirSync(stagingDir);
          throw Object.assign(new Error("ENOSPC: no space left on device, write"), {
            code: "ENOSPC",
            syscall: "write",
          });
        },
      };
    });

    try {
      isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
      await expect(
        isolatedStorage.putObject(partialKey, Buffer.from("complete image bytes")),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-full",
        statusCode: 503,
        cause: expect.objectContaining({ code: "ENOSPC" }),
      });
      // Even before catch unlinks the partial file (simulating a crash mid-write),
      // staging inside .snapotter-staging/ keeps listObjects from seeing it.
      expect(midWriteObjects).toEqual([{ key: committedKey, size: 9 }]);
      expect(midWriteStagingEntries).toEqual([expect.stringMatching(/^out\.png\..+\.partial$/)]);
      await expect(isolatedStorage.objectExists(partialKey)).resolves.toBe(false);
      expect(jobEntries(putPartialJobId)).toEqual(["existing.png"]);

      midWriteObjects = [];
      midWriteStagingEntries = [];
      await expect(
        isolatedStorage.putObject(committedKey, Buffer.from("replacement bytes")),
      ).rejects.toMatchObject({
        code: "storage-full",
        statusCode: 503,
      });
      expect(midWriteObjects).toEqual([{ key: committedKey, size: 9 }]);
      expect(midWriteStagingEntries).toEqual([
        expect.stringMatching(/^existing\.png\..+\.partial$/),
      ]);
      await expect(isolatedStorage.getObjectBuffer(committedKey)).resolves.toEqual(
        Buffer.from("committed"),
      );
      await expect(
        isolatedStorage.listObjects(`outputs/${putPartialJobId}`),
      ).resolves.toMatchObject([{ key: committedKey, size: 9 }]);
      expect(jobEntries(putPartialJobId)).toEqual(["existing.png"]);
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
      await deletePrefix(`outputs/${putPartialJobId}`).catch(() => {});
    }
  });

  it("does not delete an unowned staging file when putObject hits an exclusive-create collision", async () => {
    const collisionId = "00000000-0000-4000-8000-000000000002";
    const destinationKey = `outputs/${putCollisionJobId}/target.bin`;
    const stagingDir = join(env.WORKSPACE_PATH, "outputs", putCollisionJobId, ".snapotter-staging");
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
        isolatedStorage.putObject(destinationKey, Buffer.from("fresh")),
      ).rejects.toMatchObject({
        code: "storage-write-failed",
        cause: expect.objectContaining({ code: "EEXIST" }),
      });
      expect(readFileSync(stagingPath).toString()).toBe("owned by another writer");
      await expect(isolatedStorage.getObjectBuffer(destinationKey)).resolves.toEqual(
        Buffer.from("committed"),
      );
    } finally {
      vi.doUnmock("node:crypto");
      vi.resetModules();
      await deletePrefix(`outputs/${putCollisionJobId}`).catch(() => {});
    }
  });

  it("completes concurrent putObject and putObjectStream writes in the same directory when staging cleanup interleaves (#2728)", async () => {
    const stagingDir = join(
      env.WORKSPACE_PATH,
      "outputs",
      putConcurrentJobId,
      ".snapotter-staging",
    );
    let pauseNextStagingMkdir = false;
    let notifyStagingMkdirReached!: () => void;
    let releaseStagingMkdir!: () => void;
    let onWriteFileError: ((err: unknown, targetPath: string) => void) | null = null;
    let simulatedMkdirFailuresRemaining = 0;
    let simulatedMkdirAttempts = 0;
    let simulatedOpenFailuresRemaining = 0;
    let simulatedOpenAttempts = 0;
    let failWriteAfterRetryOpen = false;
    const unlinkedPaths: string[] = [];

    const resetGate = () => {
      pauseNextStagingMkdir = true;
      return {
        reached: new Promise<void>((resolve) => {
          notifyStagingMkdirReached = resolve;
        }),
        release: () => releaseStagingMkdir(),
      };
    };

    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        mkdir: async (
          target: Parameters<typeof actual.mkdir>[0],
          options?: Parameters<typeof actual.mkdir>[1],
        ) => {
          const targetPath = String(target);
          if (simulatedMkdirFailuresRemaining > 0 && targetPath === stagingDir) {
            simulatedMkdirAttempts += 1;
            if (simulatedMkdirAttempts > 8) {
              throw new Error("exceeded max staging open attempts on mkdir");
            }
            simulatedMkdirFailuresRemaining -= 1;
            throw Object.assign(new Error("ENOENT: no such file or directory, mkdir"), {
              code: "ENOENT",
              syscall: "mkdir",
              path: targetPath,
            });
          }
          const res = await actual.mkdir(target, options);
          if (pauseNextStagingMkdir && targetPath === stagingDir) {
            pauseNextStagingMkdir = false;
            const gate = new Promise<void>((resolve) => {
              releaseStagingMkdir = resolve;
            });
            notifyStagingMkdirReached();
            await gate;
          }
          return res;
        },
        unlink: async (target: Parameters<typeof actual.unlink>[0]) => {
          unlinkedPaths.push(String(target));
          return actual.unlink(target);
        },
        writeFile: async (
          target: Parameters<typeof actual.writeFile>[0],
          data: Parameters<typeof actual.writeFile>[1],
          options?: Parameters<typeof actual.writeFile>[2],
        ) => {
          const targetPath = String(target);
          if (simulatedOpenFailuresRemaining > 0 && targetPath.startsWith(stagingDir)) {
            simulatedOpenAttempts += 1;
            if (simulatedOpenAttempts > 8) {
              throw new Error("exceeded max staging open attempts");
            }
            simulatedOpenFailuresRemaining -= 1;
            throw Object.assign(new Error("ENOENT: no such file or directory, open"), {
              code: "ENOENT",
              syscall: "open",
            });
          }
          try {
            await actual.writeFile(target, data, options);
          } catch (err) {
            onWriteFileError?.(err, targetPath);
            throw err;
          }
          if (failWriteAfterRetryOpen && targetPath.startsWith(stagingDir)) {
            failWriteAfterRetryOpen = false;
            throw Object.assign(new Error("ENOSPC: no space left on device, write"), {
              code: "ENOSPC",
              syscall: "write",
            });
          }
        },
      };
    });

    try {
      const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");

      // Deterministic interleaving 1 (multi-writer cascade): writer B loses the
      // mkdir(stagingDir) -> open(stagingPath) window to writer A1 on attempt 1
      // and again to writer A2 on attempt 2, then succeeds on attempt 3.
      let putGate = resetGate();
      const writerB = isolatedStorage.putObject(
        `outputs/${putConcurrentJobId}/b.bin`,
        Buffer.from("payload-b"),
      );
      await putGate.reached;
      await isolatedStorage.putObject(
        `outputs/${putConcurrentJobId}/a1.bin`,
        Buffer.from("payload-a1"),
      );
      const putRetryGate = resetGate();
      putGate.release();
      await putRetryGate.reached;
      await isolatedStorage.putObject(
        `outputs/${putConcurrentJobId}/a2.bin`,
        Buffer.from("payload-a2"),
      );
      putRetryGate.release();
      await expect(writerB).resolves.toBeUndefined();

      // Deterministic interleaving 2: putObjectStream writer D finishes mkdir(stagingDir),
      // then writer C finishes rename + rmdir(stagingDir) before writer D opens stagingPath.
      const streamGate = resetGate();
      const writerD = isolatedStorage.putObjectStream(
        `outputs/${putConcurrentJobId}/d.bin`,
        Readable.from([Buffer.from("payload-d")]),
      );
      await streamGate.reached;
      await isolatedStorage.putObject(
        `outputs/${putConcurrentJobId}/c.bin`,
        Buffer.from("payload-c"),
      );
      streamGate.release();
      await expect(writerD).resolves.toBe(9);

      // Deterministic interleaving 3: putObjectStream aborted right as attempt 1's
      // writeFile fails with ENOENT on open does not retry attempt 2.
      const abortController = new AbortController();
      const abortGate = resetGate();
      onWriteFileError = (err, targetPath) => {
        if (
          targetPath.includes("aborted-race.bin") &&
          (err as NodeJS.ErrnoException | null)?.code === "ENOENT"
        ) {
          abortController.abort();
        }
      };
      const abortedStream = isolatedStorage.putObjectStream(
        `outputs/${putConcurrentJobId}/aborted-race.bin`,
        Readable.from([Buffer.from("never-written")]),
        { signal: abortController.signal },
      );
      await abortGate.reached;
      await isolatedStorage.putObject(
        `outputs/${putConcurrentJobId}/wiper.bin`,
        Buffer.from("wiper"),
      );
      abortGate.release();
      await expect(abortedStream).rejects.toMatchObject({ name: "AbortError" });
      onWriteFileError = null;
      await expect(
        isolatedStorage.objectExists(`outputs/${putConcurrentJobId}/aborted-race.bin`),
      ).resolves.toBe(false);

      // Deterministic interleaving 4: attempt 1 hits ENOENT on open, attempt 2 opens
      // the staging file and then fails mid-write with ENOSPC; the partial file is
      // unlinked and stagingDir is removed.
      putGate = resetGate();
      const retryPartialWriter = isolatedStorage.putObject(
        `outputs/${putConcurrentJobId}/retry-enospc.bin`,
        Buffer.from("payload-enospc"),
      );
      await putGate.reached;
      await isolatedStorage.putObject(
        `outputs/${putConcurrentJobId}/wiper2.bin`,
        Buffer.from("wiper2"),
      );
      failWriteAfterRetryOpen = true;
      putGate.release();
      await expect(retryPartialWriter).rejects.toMatchObject({
        code: "storage-full",
        statusCode: 503,
        cause: expect.objectContaining({ code: "ENOSPC" }),
      });
      await expect(
        isolatedStorage.objectExists(`outputs/${putConcurrentJobId}/retry-enospc.bin`),
      ).resolves.toBe(false);
      expect(existsSync(stagingDir)).toBe(false);

      // Bounded retry exhaustion: persistent ENOENT on open stops after 8 attempts
      // and surfaces 503 storage-write-failed.
      simulatedOpenFailuresRemaining = 10;
      simulatedOpenAttempts = 0;
      await expect(
        isolatedStorage.putObject(
          `outputs/${putConcurrentJobId}/exhausted.bin`,
          Buffer.from("exhausted"),
        ),
      ).rejects.toMatchObject({
        code: "storage-write-failed",
        statusCode: 503,
        cause: expect.objectContaining({ code: "ENOENT", syscall: "open" }),
      });
      expect(simulatedOpenAttempts).toBe(8);
      simulatedOpenFailuresRemaining = 0;

      // Deterministic interleaving 5 (#3330): mkdir(stagingDir, { recursive: true })
      // loses a race to a sibling rmdir(stagingDir) between EEXIST and stat and
      // rejects with ENOENT (syscall: "mkdir") on attempts 1 and 2, then succeeds on
      // attempt 3 for both putObject and putObjectStream.
      simulatedMkdirFailuresRemaining = 2;
      simulatedMkdirAttempts = 0;
      await expect(
        isolatedStorage.putObject(
          `outputs/${putConcurrentJobId}/mkdir-race-put.bin`,
          Buffer.from("payload-mkdir-put"),
        ),
      ).resolves.toBeUndefined();
      expect(simulatedMkdirAttempts).toBe(2);
      await expect(
        isolatedStorage.getObjectBuffer(`outputs/${putConcurrentJobId}/mkdir-race-put.bin`),
      ).resolves.toEqual(Buffer.from("payload-mkdir-put"));

      simulatedMkdirFailuresRemaining = 2;
      simulatedMkdirAttempts = 0;
      await expect(
        isolatedStorage.putObjectStream(
          `outputs/${putConcurrentJobId}/mkdir-race-stream.bin`,
          Readable.from([Buffer.from("payload-mkdir-stream")]),
        ),
      ).resolves.toBe(20);
      expect(simulatedMkdirAttempts).toBe(2);
      await expect(
        isolatedStorage.getObjectBuffer(`outputs/${putConcurrentJobId}/mkdir-race-stream.bin`),
      ).resolves.toEqual(Buffer.from("payload-mkdir-stream"));

      // Bounded retry exhaustion on mkdir(stagingDir) ENOENT stops after 8 attempts
      // without marking stagingOwned (no unlink attempted on the unopened stagingPath).
      unlinkedPaths.length = 0;
      simulatedMkdirFailuresRemaining = 10;
      simulatedMkdirAttempts = 0;
      await expect(
        isolatedStorage.putObject(
          `outputs/${putConcurrentJobId}/exhausted-mkdir.bin`,
          Buffer.from("exhausted-mkdir"),
        ),
      ).rejects.toMatchObject({
        code: "storage-write-failed",
        statusCode: 503,
        cause: expect.objectContaining({ code: "ENOENT", syscall: "mkdir" }),
      });
      expect(simulatedMkdirAttempts).toBe(8);
      expect(unlinkedPaths).toEqual([]);
      simulatedMkdirFailuresRemaining = 0;

      unlinkedPaths.length = 0;
      simulatedMkdirFailuresRemaining = 10;
      simulatedMkdirAttempts = 0;
      const exhaustedMkdirSource = Readable.from([Buffer.from("exhausted-mkdir-stream")]);
      await expect(
        isolatedStorage.putObjectStream(
          `outputs/${putConcurrentJobId}/exhausted-mkdir-stream.bin`,
          exhaustedMkdirSource,
        ),
      ).rejects.toMatchObject({
        code: "storage-write-failed",
        statusCode: 503,
        cause: expect.objectContaining({ code: "ENOENT", syscall: "mkdir" }),
      });
      expect(simulatedMkdirAttempts).toBe(8);
      expect(exhaustedMkdirSource.destroyed).toBe(true);
      expect(unlinkedPaths).toEqual([]);
      simulatedMkdirFailuresRemaining = 0;

      // Aborting while mkdir(stagingDir) is paused before writeFile does not mark
      // stagingOwned (no unlink attempted on the unopened stagingPath).
      unlinkedPaths.length = 0;
      const mkdirAbortController = new AbortController();
      const mkdirAbortGate = resetGate();
      const mkdirAbortedStream = isolatedStorage.putObjectStream(
        `outputs/${putConcurrentJobId}/aborted-after-mkdir.bin`,
        Readable.from([Buffer.from("never-opened")]),
        { signal: mkdirAbortController.signal },
      );
      await mkdirAbortGate.reached;
      mkdirAbortController.abort();
      mkdirAbortGate.release();
      await expect(mkdirAbortedStream).rejects.toMatchObject({ name: "AbortError" });
      expect(unlinkedPaths).toEqual([]);

      // Burst of concurrent putObject and putObjectStream writes under one job directory.
      for (let round = 0; round < 20; round += 1) {
        await Promise.all([
          isolatedStorage.putObject(
            `outputs/${putConcurrentJobId}/r${round}-0.bin`,
            Buffer.from(`r${round}-0`),
          ),
          isolatedStorage.putObject(
            `outputs/${putConcurrentJobId}/r${round}-1.bin`,
            Buffer.from(`r${round}-1`),
          ),
          isolatedStorage.putObjectStream(
            `outputs/${putConcurrentJobId}/r${round}-2.bin`,
            Readable.from([Buffer.from(`r${round}-2`)]),
          ),
          isolatedStorage.putObjectStream(
            `outputs/${putConcurrentJobId}/r${round}-3.bin`,
            Readable.from([Buffer.from(`r${round}-3`)]),
          ),
        ]);
      }

      await expect(
        isolatedStorage.getObjectBuffer(`outputs/${putConcurrentJobId}/a1.bin`),
      ).resolves.toEqual(Buffer.from("payload-a1"));
      await expect(
        isolatedStorage.getObjectBuffer(`outputs/${putConcurrentJobId}/a2.bin`),
      ).resolves.toEqual(Buffer.from("payload-a2"));
      await expect(
        isolatedStorage.getObjectBuffer(`outputs/${putConcurrentJobId}/b.bin`),
      ).resolves.toEqual(Buffer.from("payload-b"));
      await expect(
        isolatedStorage.getObjectBuffer(`outputs/${putConcurrentJobId}/c.bin`),
      ).resolves.toEqual(Buffer.from("payload-c"));
      await expect(
        isolatedStorage.getObjectBuffer(`outputs/${putConcurrentJobId}/d.bin`),
      ).resolves.toEqual(Buffer.from("payload-d"));
      expect(existsSync(stagingDir)).toBe(false);
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
      await deletePrefix(`outputs/${putConcurrentJobId}`).catch(() => {});
    }
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
        code: "storage-full",
        statusCode: 503,
        cause: expect.objectContaining({ code: "EDQUOT" }),
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
      code: "storage-full",
      statusCode: 503,
      cause: expect.objectContaining({ code: "EDQUOT" }),
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
      ).rejects.toMatchObject({
        code: "storage-write-failed",
        cause: expect.objectContaining({ code: "EEXIST" }),
      });
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
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: expect.objectContaining({ code: "EEXIST" }),
      });
      expect(readFileSync(stagingPath).toString()).toBe("owned by another copy");
    } finally {
      vi.doUnmock("node:crypto");
      vi.resetModules();
      rmSync(stagingPath, { force: true });
    }
  });

  describe("a failed copyReadableToFile write (#2853)", () => {
    function failingSource(error: unknown): Readable {
      return Readable.from(
        (async function* () {
          yield Buffer.from("partial");
          throw error;
        })(),
      );
    }

    it.each([
      ["a full disk", { code: "ENOSPC", syscall: "write" }, "storage-full"],
      ["an exhausted quota", { code: "EDQUOT", syscall: "write" }, "storage-full"],
      ["a read-only volume", { code: "EROFS", syscall: "open" }, "storage-not-writable"],
      ["no permission", { code: "EACCES", syscall: "open" }, "storage-not-writable"],
      ["operation not permitted", { code: "EPERM", syscall: "open" }, "storage-not-writable"],
      ["another I/O failure", { code: "EIO", syscall: "write" }, "storage-write-failed"],
      ["descriptor exhaustion", { code: "EMFILE", syscall: "open" }, "storage-write-failed"],
    ])("answers %s with a 503 naming it", async (_case, errno, code) => {
      const destination = join(copyDir, `copy-fault-${errno.code}.bin`);
      const cause = Object.assign(new Error(`${errno.code}: simulated`), errno);
      await expect(copyReadableToFile(failingSource(cause), destination)).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code,
        statusCode: 503,
        cause,
      });
      expect(existsSync(destination)).toBe(false);
    });

    it("keeps a client's fault as it is", async () => {
      const destination = join(copyDir, "copy-client-fault.bin");
      const clientFault = Object.assign(new Error("Unexpected end of form"), { statusCode: 400 });
      await expect(copyReadableToFile(failingSource(clientFault), destination)).rejects.toBe(
        clientFault,
      );
      expect(clientFault.statusCode).toBe(400);
      expect(existsSync(destination)).toBe(false);
    });

    it("makes anything else ours: a 500, not a malformed request", async () => {
      const destination = join(copyDir, "copy-bug-fault.bin");
      const bug = new TypeError("Cannot read properties of undefined");
      await expect(copyReadableToFile(failingSource(bug), destination)).rejects.toBe(bug);
      expect((bug as TypeError & { statusCode?: number }).statusCode).toBe(500);
      expect(existsSync(destination)).toBe(false);
    });

    it("classifies a destination filesystem fault (mkdir under a file blocker) as 503 storage-write-failed", async () => {
      const blocker = join(copyDir, "file-blocker");
      writeFileSync(blocker, "not-a-dir");
      const destination = join(blocker, "nested", "out.bin");
      try {
        await expect(
          copyReadableToFile(Readable.from([Buffer.from("payload")]), destination),
        ).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-write-failed",
          statusCode: 503,
          cause: expect.objectContaining({ syscall: "mkdir" }),
        });
      } finally {
        rmSync(blocker, { force: true });
      }
    });

    it("preserves a non-AbortError signal reason (such as worker 'timeout') without stamping 500", async () => {
      const destination = join(copyDir, "copy-timeout-reason.bin");
      const controller = new AbortController();
      controller.abort("timeout");
      const caught = await copyReadableToFile(
        Readable.from([Buffer.from("payload")]),
        destination,
        { signal: controller.signal },
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(caught).toBe("timeout");
      expect(existsSync(destination)).toBe(false);
    });
  });

  it("classifies a local stat/open fault in copyObjectToFile as a 503 SafeError and preserves non-AbortError signal reasons (#2853)", async () => {
    const eio = Object.assign(new Error("EIO: i/o error, stat"), {
      code: "EIO",
      syscall: "stat",
    });
    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        stat: async () => {
          throw eio;
        },
      };
    });
    try {
      const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
      await expect(
        isolatedStorage.copyObjectToFile(copyKey, join(copyDir, "stat-eio.bin"), {
          maxBytes: 1024,
        }),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: eio,
      });
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }

    const badKeyErr = await copyObjectToFile("outputs/job-1/.", join(copyDir, "bad-key.bin"), {
      maxBytes: 1024,
    }).catch((e: unknown) => e);
    expect(badKeyErr).toBeInstanceOf(Error);
    expect((badKeyErr as Error).message).toMatch(/invalid object key/i);
    expect((badKeyErr as { statusCode?: unknown }).statusCode).toBeUndefined();
  });

  it("turns local operational write errnos and S3 SDK faults into status-bearing 503 SafeErrors (#1552)", async () => {
    for (const [errno, expectedCode] of [
      ["ENOSPC", "storage-full"],
      ["EDQUOT", "storage-full"],
      ["EACCES", "storage-not-writable"],
      ["EPERM", "storage-not-writable"],
      ["EROFS", "storage-not-writable"],
    ] as const) {
      const cause = Object.assign(new Error(`${errno}: simulated`), { code: errno });
      expect(normalizeOperationalWriteError(cause)).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: expectedCode,
        statusCode: 503,
        cause,
      });
    }

    for (const s3Outage of [
      { name: "ServiceUnavailable", $metadata: { httpStatusCode: 503 } },
      { name: "NoSuchBucket", $metadata: { httpStatusCode: 404 } },
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.9:9000"), { code: "ECONNREFUSED" }),
    ]) {
      expect(normalizeOperationalWriteError(s3Outage)).toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-unavailable",
        statusCode: 503,
        cause: s3Outage,
      });
    }

    const noSuchKey = { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } };
    expect(normalizeOperationalWriteError(noSuchKey)).toBe(noSuchKey);

    const unmodeled404 = { name: "NotFound", $metadata: { httpStatusCode: 404 } };
    expect(normalizeOperationalWriteError(unmodeled404)).toBe(unmodeled404);

    const sdkAbort = Object.assign(new Error("Request aborted"), {
      name: "AbortError",
      $metadata: {},
    });
    expect(normalizeOperationalWriteError(sdkAbort)).toBe(sdkAbort);

    const plain = new Error("render failed");
    expect(normalizeOperationalWriteError(plain)).toBe(plain);
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

  const isRootForList = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRootForList)(
    "propagates a permission fault from listObjects when the prefix directory is unreadable (#1498)",
    async () => {
      const unreadableJobId = `unreadable-list-${process.pid}`;
      const unreadableDir = join(env.WORKSPACE_PATH, "outputs", unreadableJobId);
      await mkdir(unreadableDir, { recursive: true });
      await writeFile(join(unreadableDir, "result.bin"), Buffer.from("done"));
      await chmod(unreadableDir, 0o000);
      try {
        await expect(listObjects(`outputs/${unreadableJobId}/`)).rejects.toMatchObject({
          code: expect.stringMatching(/^(EACCES|EPERM)$/),
        });
      } finally {
        await chmod(unreadableDir, 0o755).catch(() => {});
        await deletePrefix(`outputs/${unreadableJobId}`).catch(() => {});
      }
    },
  );

  it("propagates a non-ENOENT readdir or stat error in listObjects and ignores ENOENT mid-walk (#1498)", async () => {
    const eio = Object.assign(new Error("EIO: i/o error, scandir"), {
      code: "EIO",
      syscall: "scandir",
    });
    const statFault = Object.assign(new Error("EIO: i/o error, stat"), {
      code: "EIO",
      syscall: "stat",
    });
    const vanished = Object.assign(new Error("ENOENT: no such file or directory, stat"), {
      code: "ENOENT",
      syscall: "stat",
    });
    let readdirShouldFail = true;
    let readdirThrowNull = false;
    let statShouldFail = false;

    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        readdir: async (...args: Parameters<typeof actual.readdir>) => {
          if (readdirThrowNull) throw null;
          if (readdirShouldFail) throw eio;
          return actual.readdir(...args);
        },
        stat: async (p: Parameters<typeof actual.stat>[0]) => {
          const pathStr = String(p);
          if (pathStr.endsWith("vanished.bin")) throw vanished;
          if (statShouldFail && pathStr.endsWith("fault.bin")) throw statFault;
          return actual.stat(p);
        },
      };
    });
    try {
      const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
      await expect(isolatedStorage.listObjects(`outputs/${jobId}`)).rejects.toBe(eio);

      readdirThrowNull = true;
      await expect(isolatedStorage.listObjects(`outputs/${jobId}`)).rejects.toBeNull();
      readdirThrowNull = false;

      readdirShouldFail = false;
      const raceJobId = `race-list-${process.pid}`;
      const raceDir = join(env.WORKSPACE_PATH, "outputs", raceJobId);
      await mkdir(raceDir, { recursive: true });
      await writeFile(join(raceDir, "kept.bin"), Buffer.from("ok"));
      await writeFile(join(raceDir, "vanished.bin"), Buffer.from("gone"));
      await writeFile(join(raceDir, "fault.bin"), Buffer.from("bad"));
      try {
        const listed = await isolatedStorage.listObjects(`outputs/${raceJobId}`);
        expect(listed.map((o) => o.key).sort()).toEqual([
          `outputs/${raceJobId}/fault.bin`,
          `outputs/${raceJobId}/kept.bin`,
        ]);

        statShouldFail = true;
        await expect(isolatedStorage.listObjects(`outputs/${raceJobId}`)).rejects.toBe(statFault);
      } finally {
        await deletePrefix(`outputs/${raceJobId}`).catch(() => {});
      }
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
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

  it.skipIf(isRootForList)(
    "propagates a permission fault from listJobDirs when the prefix root is unreadable (#1498)",
    async () => {
      const originalWorkspace = env.WORKSPACE_PATH;
      const lockedWorkspace = mkdtempSync(join(tmpdir(), "snapotter-locked-ws-"));
      const lockedUploads = join(lockedWorkspace, "uploads");
      await mkdir(join(lockedUploads, "job-1"), { recursive: true });
      await chmod(lockedUploads, 0o000);
      (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = lockedWorkspace;
      try {
        await expect(listJobDirs("uploads")).rejects.toMatchObject({
          code: expect.stringMatching(/^(EACCES|EPERM)$/),
        });
      } finally {
        (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = originalWorkspace;
        await chmod(lockedUploads, 0o755).catch(() => {});
        rmSync(lockedWorkspace, { recursive: true, force: true });
      }
    },
  );

  it("propagates a non-ENOENT readdir or stat error in listJobDirs and ignores ENOENT mid-walk (#1498)", async () => {
    const eio = Object.assign(new Error("EIO: i/o error, scandir"), {
      code: "EIO",
      syscall: "scandir",
    });
    const statFault = Object.assign(new Error("EIO: i/o error, stat"), {
      code: "EIO",
      syscall: "stat",
    });
    const vanished = Object.assign(new Error("ENOENT: no such file or directory, stat"), {
      code: "ENOENT",
      syscall: "stat",
    });
    let readdirShouldFail = true;
    let statShouldFail = false;

    const tempWorkspace = mkdtempSync(join(tmpdir(), "snapotter-jobdirs-ws-"));
    await mkdir(join(tempWorkspace, "outputs", "kept-job"), { recursive: true });
    await mkdir(join(tempWorkspace, "outputs", "vanished-job"), { recursive: true });
    await mkdir(join(tempWorkspace, "outputs", "fault-job"), { recursive: true });

    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        readdir: async (...args: Parameters<typeof actual.readdir>) => {
          if (readdirShouldFail) throw eio;
          return actual.readdir(...args);
        },
        stat: async (p: Parameters<typeof actual.stat>[0]) => {
          const pathStr = String(p);
          if (pathStr.endsWith("vanished-job")) throw vanished;
          if (statShouldFail && pathStr.endsWith("fault-job")) throw statFault;
          return actual.stat(p);
        },
      };
    });
    try {
      const isolatedConfig = await import("../../../apps/api/src/config.js");
      const originalIsolatedWorkspace = isolatedConfig.env.WORKSPACE_PATH;
      (isolatedConfig.env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = tempWorkspace;
      try {
        const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
        await expect(isolatedStorage.listJobDirs("outputs")).rejects.toBe(eio);

        readdirShouldFail = false;
        const dirs = await isolatedStorage.listJobDirs("outputs");
        expect(dirs.map((d) => d.key).sort()).toEqual(["outputs/fault-job", "outputs/kept-job"]);

        statShouldFail = true;
        await expect(isolatedStorage.listJobDirs("outputs")).rejects.toBe(statFault);
      } finally {
        (isolatedConfig.env as { WORKSPACE_PATH: string }).WORKSPACE_PATH =
          originalIsolatedWorkspace;
      }
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
      rmSync(tempWorkspace, { recursive: true, force: true });
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

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)(
    "classifies a local permission fault in deletePrefix as a 503 storage-not-writable SafeError (#2632)",
    async () => {
      const stuckJobId = `stuck-prefix-${process.pid}`;
      const stuckDir = join(env.WORKSPACE_PATH, "uploads", stuckJobId);
      await mkdir(stuckDir, { recursive: true });
      await writeFile(join(stuckDir, "doomed.bin"), Buffer.from("keep"));
      const { chmod } = await import("node:fs/promises");
      await chmod(stuckDir, 0o500);
      try {
        await expect(deletePrefix(`uploads/${stuckJobId}`)).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-not-writable",
          statusCode: 503,
          cause: expect.objectContaining({
            code: expect.stringMatching(/^(EACCES|EPERM)$/),
          }),
        });
        expect(existsSync(join(stuckDir, "doomed.bin"))).toBe(true);
      } finally {
        await chmod(stuckDir, 0o755).catch(() => {});
        await deletePrefix(`uploads/${stuckJobId}`).catch(() => {});
      }
    },
  );

  it("classifies a read-only filesystem fault (EROFS) in deletePrefix as a 503 SafeError regardless of UID (#2632)", async () => {
    const erofs = Object.assign(new Error("EROFS: read-only file system, rmdir"), {
      code: "EROFS",
      syscall: "rmdir",
    });
    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        rm: async () => {
          throw erofs;
        },
      };
    });
    try {
      const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
      await expect(isolatedStorage.deletePrefix(`uploads/${jobId}`)).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-not-writable",
        statusCode: 503,
        cause: erofs,
      });
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });
});

describe("object-storage missing-key + robustness paths", () => {
  it("reports a missing object as non-existent instead of throwing", async () => {
    expect(await objectExists(`outputs/absent-${process.pid}/none.bin`)).toBe(false);
  });

  it("propagates a stat error as a rejection from getObjectSize on a missing key", async () => {
    await expect(getObjectSize(`outputs/absent-${process.pid}/none.bin`)).rejects.toBeDefined();
  });

  // #997: a path-based createReadStream defers the open, so a missing or
  // unreadable blob only surfaced as an async "error" event after the route's
  // try/catch had exited and response headers were already on the wire.
  it("rejects getObjectStream with ENOENT up front when the object is missing", async () => {
    const err = (await getObjectStream(`outputs/absent-${process.pid}/none.bin`).then(
      (s) => {
        s.on("error", () => {});
        s.destroy();
        return null;
      },
      (e: unknown) => e,
    )) as NodeJS.ErrnoException | null;
    expect(err).toBeInstanceOf(Error);
    expect(err?.code).toBe("ENOENT");
  });

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)(
    "rejects getObjectStream with EACCES up front when the object is unreadable",
    async () => {
      const lockedJobId = `locked-stream-${process.pid}`;
      const lockedKey = `outputs/${lockedJobId}/locked.bin`;
      const lockedPath = join(env.WORKSPACE_PATH, "outputs", lockedJobId, "locked.bin");
      await putObject(lockedKey, Buffer.from("locked bytes"));
      await chmod(lockedPath, 0o000);
      try {
        for (const range of [undefined, { start: 0, end: 5 }] as const) {
          const err = (await getObjectStream(lockedKey, range).then(
            (s) => {
              s.on("error", () => {});
              s.destroy();
              return null;
            },
            (e: unknown) => e,
          )) as NodeJS.ErrnoException | null;
          expect(err).toBeInstanceOf(Error);
          expect(err?.code).toBe("EACCES");
        }
      } finally {
        await chmod(lockedPath, 0o600).catch(() => {});
        await deletePrefix(`outputs/${lockedJobId}`).catch(() => {});
      }
    },
  );

  it("rejects a single-dot or staging-dir filename segment in isValidObjectKey and object operations", async () => {
    expect(isValidObjectKey("outputs/job-1/.")).toBe(false);
    expect(isValidObjectKey("uploads/job-1/.")).toBe(false);
    expect(isValidObjectKey("outputs/job-1/.snapotter-staging")).toBe(false);
    expect(isValidObjectKey("uploads/job-1/.snapotter-staging")).toBe(false);
    expect(isValidObjectKey("outputs/job-1/.SNAPOTTER-STAGING")).toBe(false);
    expect(isValidObjectKey("uploads/job-1/.SNAPOTTER-STAGING")).toBe(false);
    expect(isValidObjectKey("outputs/job-1/.SnapOtter-Staging")).toBe(false);
    expect(isValidObjectKey("outputs/job-1/.\u{017f}napotter-staging")).toBe(false);
    expect(isValidObjectKey("uploads/job-1/.\u{017f}napotter-staging")).toBe(false);
    expect(isValidObjectKey("outputs/job-1/.snapotter-\u{017f}taging")).toBe(false);
    expect(isValidObjectKey("uploads/job-1/.\u{017f}napotter-\u{017f}taging")).toBe(false);
    expect(isValidObjectKey("outputs/job-1/.\u{017f}NAPOTTER-\u{017f}TAGING")).toBe(false);
    expect(isValidObjectKey("outputs/job-1/.SNAPOTTER-STAGING.png")).toBe(true);
    expect(isValidObjectKey("outputs/job-1/.\u{017f}napotter-staging.png")).toBe(true);
    expect(isValidObjectKey("outputs/job-1/foo.snapotter-staging")).toBe(true);
    expect(isValidObjectKey("outputs/job-1/foo.\u{017f}napotter-staging")).toBe(true);
    expect(isValidObjectKey("outputs/job-1/.hidden")).toBe(true);
    expect(isValidObjectKey("outputs/job-1/file.")).toBe(true);
    await expect(getObjectSize("outputs/job-1/.")).rejects.toThrow(/invalid object key/i);
    await expect(getObjectStream("outputs/job-1/.")).rejects.toThrow(/invalid object key/i);
    await expect(getObjectStream("outputs/job-1/.snapotter-staging")).rejects.toThrow(
      /invalid object key/i,
    );
    await expect(getObjectStream("outputs/job-1/.SNAPOTTER-STAGING")).rejects.toThrow(
      /invalid object key/i,
    );
    await expect(getObjectStream("outputs/job-1/.\u{017f}napotter-staging")).rejects.toThrow(
      /invalid object key/i,
    );
    await expect(putObject("uploads/job-1/.SNAPOTTER-STAGING", Buffer.from("x"))).rejects.toThrow(
      /invalid object key/i,
    );
    await expect(
      putObject("uploads/job-1/.\u{017f}napotter-staging", Buffer.from("x")),
    ).rejects.toThrow(/invalid object key/i);
  });

  it("rejects an invalid byte range before opening a FileHandle", async () => {
    const rangeJobId = `bad-range-${process.pid}`;
    const rangeKey = `outputs/${rangeJobId}/data.bin`;
    await putObject(rangeKey, Buffer.from("0123456789"));
    try {
      await expect(getObjectStream(rangeKey, { start: 8, end: 2 })).rejects.toMatchObject({
        code: "ERR_OUT_OF_RANGE",
      });
      await expect(getObjectStream(rangeKey, { start: -1 })).rejects.toMatchObject({
        code: "ERR_OUT_OF_RANGE",
      });
    } finally {
      await deletePrefix(`outputs/${rangeJobId}`).catch(() => {});
    }
  });

  it("destroys the source stream when copyReadableToFile fails before pipeline()", async () => {
    const source = new Readable({
      read() {
        this.push(Buffer.from("payload"));
        this.push(null);
      },
      destroy(_err, callback) {
        callback(new Error("destroy-time source error"));
      },
    });
    await expect(copyReadableToFile(source, "/tmp/unused", { maxBytes: -1 })).rejects.toThrow(
      /maxBytes/i,
    );
    expect(source.destroyed).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it("destroys the source stream when putObjectStream fails before pipeline() (#2797)", async () => {
    const makeSource = () =>
      new Readable({
        read() {
          this.push(Buffer.from("payload"));
          this.push(null);
        },
        destroy(_err, callback) {
          callback(new Error("destroy-time source error"));
        },
      });

    // 1. Entry assertValidKey failure.
    const invalidKeySource = makeSource();
    const invalidKeyErr = await putObjectStream("outputs/job-1/.", invalidKeySource).catch(
      (e: unknown) => e,
    );
    expect(invalidKeyErr).toBeInstanceOf(Error);
    expect((invalidKeyErr as Error).message).toMatch(/invalid object key/i);
    expect((invalidKeyErr as { statusCode?: unknown }).statusCode).toBeUndefined();
    expect(invalidKeySource.destroyed).toBe(true);

    // 2. Pre-aborted AbortSignal at entry (before any "abort" event fires).
    const preAbortedController = new AbortController();
    preAbortedController.abort();
    const preAbortedSource = makeSource();
    await expect(
      putObjectStream(`outputs/pre-abort-${process.pid}/out.bin`, preAbortedSource, {
        signal: preAbortedController.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(preAbortedSource.destroyed).toBe(true);

    // 3. assertLocalCapacity() rejecting with 503 workspace-cap before pipeline().
    const originalWorkspace = env.WORKSPACE_PATH;
    const originalMaxGb = env.MAX_WORKSPACE_SIZE_GB;
    const capRoot = mkdtempSync(join(tmpdir(), "snapotter-stream-cap-"));
    const seededDir = join(capRoot, "uploads", "job-1");
    await mkdir(seededDir, { recursive: true });
    await writeFile(join(seededDir, "a.bin"), Buffer.alloc(2 * 1024 * 1024));
    (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = capRoot;
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(9_200_000_000_000);
    try {
      const capSource = makeSource();
      await expect(putObjectStream("outputs/job-1/out.bin", capSource)).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "workspace-cap",
        statusCode: 503,
      });
      expect(capSource.destroyed).toBe(true);
    } finally {
      nowSpy.mockRestore();
      (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = originalWorkspace;
      (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = originalMaxGb;
      rmSync(capRoot, { recursive: true, force: true });
    }

    // 4. Pre-pipeline mkdir failure (file blocking the job directory).
    const blockerJobId = `stream-blocker-${process.pid}`;
    const blockerPath = join(env.WORKSPACE_PATH, "outputs", blockerJobId);
    await mkdir(join(env.WORKSPACE_PATH, "outputs"), { recursive: true });
    writeFileSync(blockerPath, "x");
    try {
      const mkdirSource = makeSource();
      await expect(
        putObjectStream(`outputs/${blockerJobId}/out.bin`, mkdirSource),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: expect.objectContaining({ syscall: "mkdir" }),
      });
      expect(mkdirSource.destroyed).toBe(true);
    } finally {
      rmSync(blockerPath, { force: true });
    }
  });

  it("captures a pre-pipeline source error in putObjectStream and copyReadableToFile, cleans up staging, and rejects with the classified fault (#3326)", async () => {
    const prePipelineJobId = `pre-pipeline-err-${process.pid}`;
    const scratch = mkdtempSync(join(tmpdir(), "snapotter-pre-pipeline-copy-"));
    try {
      // 1. Bare createReadStream on a missing scratch file (background fs.open fails with ENOENT during pre-pipeline setup).
      const missingScratch = join(scratch, "nonexistent-input.bin");
      await expect(
        putObjectStream(
          `outputs/${prePipelineJobId}/from-missing.bin`,
          createReadStream(missingScratch),
        ),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: expect.objectContaining({ code: "ENOENT", syscall: "open" }),
      });
      await expect(objectExists(`outputs/${prePipelineJobId}/from-missing.bin`)).resolves.toBe(
        false,
      );
      expect(
        existsSync(join(env.WORKSPACE_PATH, "outputs", prePipelineJobId, ".snapotter-staging")),
      ).toBe(false);

      const copyDest = join(scratch, "copied-missing.bin");
      await expect(
        copyReadableToFile(createReadStream(missingScratch), copyDest),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: expect.objectContaining({ code: "ENOENT", syscall: "open" }),
      });
      expect(existsSync(copyDest)).toBe(false);
      expect(readdirSync(scratch)).toEqual([]);

      // 2. Source emits "error" while writeFile has already created the staging .partial file (before pipeline attaches).
      vi.resetModules();
      let emitDuringStagingWrite: (() => void) | null = null;
      vi.doMock("node:fs/promises", async (importOriginal) => {
        const actual = await importOriginal<typeof import("node:fs/promises")>();
        return {
          ...actual,
          writeFile: async (
            target: Parameters<typeof actual.writeFile>[0],
            data: Parameters<typeof actual.writeFile>[1],
            options?: Parameters<typeof actual.writeFile>[2],
          ) => {
            await actual.writeFile(target, data, options);
            if (String(target).endsWith(".partial")) {
              emitDuringStagingWrite?.();
              await new Promise<void>((resolve) => setImmediate(resolve));
            }
          },
        };
      });
      try {
        const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
        const eacces = Object.assign(new Error("EACCES: permission denied, open"), {
          code: "EACCES",
          syscall: "open",
        });
        const putSource = new PassThrough();
        emitDuringStagingWrite = () => {
          putSource.emit("error", eacces);
        };
        await expect(
          isolatedStorage.putObjectStream(`outputs/${prePipelineJobId}/staged-err.bin`, putSource),
        ).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-not-writable",
          statusCode: 503,
          cause: eacces,
        });
        expect(putSource.destroyed).toBe(true);
        expect(
          existsSync(join(env.WORKSPACE_PATH, "outputs", prePipelineJobId, ".snapotter-staging")),
        ).toBe(false);
        await expect(
          isolatedStorage.objectExists(`outputs/${prePipelineJobId}/staged-err.bin`),
        ).resolves.toBe(false);

        const copySource = new PassThrough();
        emitDuringStagingWrite = () => {
          copySource.emit("error", eacces);
        };
        const stagedCopyDest = join(scratch, "staged-copy.bin");
        await expect(
          isolatedStorage.copyReadableToFile(copySource, stagedCopyDest),
        ).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-not-writable",
          statusCode: 503,
          cause: eacces,
        });
        expect(copySource.destroyed).toBe(true);
        expect(existsSync(stagedCopyDest)).toBe(false);
        expect(readdirSync(scratch)).toEqual([]);
      } finally {
        vi.doUnmock("node:fs/promises");
        vi.resetModules();
      }

      // 3. Stream already errored (source.errored set) before putObjectStream or copyReadableToFile is called.
      const preErroredCause = Object.assign(new Error("EIO: pre-errored source"), {
        code: "EIO",
        syscall: "read",
      });
      const makePreErrored = async (): Promise<PassThrough> => {
        const s = new PassThrough();
        s.on("error", () => {});
        s.destroy(preErroredCause);
        await new Promise<void>((resolve) => setImmediate(resolve));
        s.removeAllListeners("error");
        return s;
      };
      await expect(
        putObjectStream(`outputs/${prePipelineJobId}/pre-errored.bin`, await makePreErrored()),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: preErroredCause,
      });
      await expect(
        copyReadableToFile(await makePreErrored(), join(scratch, "pre-errored-copy.bin")),
      ).rejects.toMatchObject({
        isSafeMessage: true,
        kind: "operational",
        code: "storage-write-failed",
        statusCode: 503,
        cause: preErroredCause,
      });
      expect(readdirSync(scratch)).toEqual([]);

      // 4. Success path detaches onSourceError cleanly via source.off("error", onSourceError).
      const okPutSource = Readable.from([Buffer.from("ok")]);
      const putOffSpy = vi.spyOn(okPutSource, "off");
      await expect(
        putObjectStream(`outputs/${prePipelineJobId}/ok.bin`, okPutSource),
      ).resolves.toBe(2);
      expect(putOffSpy).toHaveBeenCalledWith("error", expect.any(Function));

      const okCopySource = Readable.from([Buffer.from("ok")]);
      const copyOffSpy = vi.spyOn(okCopySource, "off");
      const okCopyDest = join(scratch, "ok-copy.bin");
      await expect(copyReadableToFile(okCopySource, okCopyDest)).resolves.toBe(2);
      expect(copyOffSpy).toHaveBeenCalledWith("error", expect.any(Function));
      rmSync(okCopyDest, { force: true });

      // 5. Destination WriteStream failure mid-pipeline while an un-ended source still has buffered chunks
      // preserves the destination 503 storage-full error instead of overwriting sourceError with for-await's AbortError.
      vi.resetModules();
      vi.doMock("node:fs", async (importOriginal) => {
        const actual = await importOriginal<typeof import("node:fs")>();
        return {
          ...actual,
          createWriteStream: (...args: Parameters<typeof actual.createWriteStream>) => {
            const ws = actual.createWriteStream(...args);
            ws._write = (_chunk, _encoding, callback) => {
              setImmediate(() => {
                callback(
                  Object.assign(new Error("ENOSPC: no space left on device, write"), {
                    code: "ENOSPC",
                    syscall: "write",
                  }),
                );
              });
            };
            return ws;
          },
        };
      });
      try {
        const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
        const makeInfiniteSource = () =>
          new Readable({
            read() {
              this.push(Buffer.alloc(32 * 1024, 0x41));
            },
          });
        const multiChunkPutSource = makeInfiniteSource();
        await expect(
          isolatedStorage.putObjectStream(
            `outputs/${prePipelineJobId}/dest-enospc.bin`,
            multiChunkPutSource,
          ),
        ).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-full",
          statusCode: 503,
          cause: expect.objectContaining({ code: "ENOSPC", syscall: "write" }),
        });
        expect(multiChunkPutSource.destroyed).toBe(true);

        const multiChunkCopySource = makeInfiniteSource();
        await expect(
          isolatedStorage.copyReadableToFile(
            multiChunkCopySource,
            join(scratch, "dest-enospc-copy.bin"),
          ),
        ).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-full",
          statusCode: 503,
          cause: expect.objectContaining({ code: "ENOSPC", syscall: "write" }),
        });
        expect(multiChunkCopySource.destroyed).toBe(true);
        expect(readdirSync(scratch)).toEqual([]);
      } finally {
        vi.doUnmock("node:fs");
        vi.resetModules();
      }
    } finally {
      await deletePrefix(`outputs/${prePipelineJobId}`).catch(() => {});
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("silently ignores deleting an object that is not present", async () => {
    await expect(deleteObject(`outputs/absent-${process.pid}/none.bin`)).resolves.toBeUndefined();
  });

  it("rejects deleteObject for an invalid key without stamping 500", async () => {
    const err = await deleteObject("outputs/../../etc/passwd").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/invalid object key/i);
    expect((err as { statusCode?: unknown }).statusCode).toBeUndefined();
  });

  it.skipIf(isRoot)(
    "classifies a local permission fault in deleteObject as a 503 storage-not-writable SafeError and keeps workspaceSizeCache intact (#2835)",
    async () => {
      const originalWorkspace = env.WORKSPACE_PATH;
      const originalMaxGb = env.MAX_WORKSPACE_SIZE_GB;
      const capRoot = mkdtempSync(join(tmpdir(), "snapotter-del-perm-"));
      const stuckDir = join(capRoot, "uploads", "job-1");
      await mkdir(stuckDir, { recursive: true });
      await writeFile(join(stuckDir, "a.bin"), Buffer.alloc(2 * 1024 * 1024));
      (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = capRoot;
      (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(9_000_000_000_000);
      try {
        // Warm workspaceSizeCache with the 2 MiB over-cap total.
        await expect(assertLocalCapacity()).rejects.toMatchObject({
          statusCode: 503,
          code: "workspace-cap",
        });

        await chmod(stuckDir, 0o500);
        await expect(deleteObject("uploads/job-1/a.bin")).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-not-writable",
          statusCode: 503,
          cause: expect.objectContaining({
            code: expect.stringMatching(/^(EACCES|EPERM)$/),
          }),
        });
        await chmod(stuckDir, 0o755);
        expect(existsSync(join(stuckDir, "a.bin"))).toBe(true);

        // Remove the file behind the store's back: if deleteObject had cleared
        // workspaceSizeCache despite failing, assertLocalCapacity would recompute 0
        // and resolve instead of serving the still-warm cached over-cap total.
        rmSync(join(stuckDir, "a.bin"), { force: true });
        await expect(assertLocalCapacity()).rejects.toMatchObject({
          statusCode: 503,
          code: "workspace-cap",
        });
      } finally {
        nowSpy.mockRestore();
        (env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = originalWorkspace;
        (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = originalMaxGb;
        await chmod(stuckDir, 0o755).catch(() => {});
        rmSync(capRoot, { recursive: true, force: true });
      }
    },
  );

  it("classifies non-ENOENT unlink faults in deleteObject via localWriteFault and preserves workspaceSizeCache regardless of UID (#2835)", async () => {
    const erofs = Object.assign(new Error("EROFS: read-only file system, unlink"), {
      code: "EROFS",
      syscall: "unlink",
    });
    const eio = Object.assign(new Error("EIO: i/o error, unlink"), {
      code: "EIO",
      syscall: "unlink",
    });
    const enoent = Object.assign(new Error("ENOENT: no such file or directory, unlink"), {
      code: "ENOENT",
      syscall: "unlink",
    });
    const unexpectedBug = new TypeError("unexpected unlink failure");
    let unlinkErr: unknown = erofs;

    const capRoot = mkdtempSync(join(tmpdir(), "snapotter-del-mock-"));
    const jobDir = join(capRoot, "uploads", "job-1");
    await mkdir(jobDir, { recursive: true });
    await writeFile(join(jobDir, "a.bin"), Buffer.alloc(2 * 1024 * 1024));

    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        unlink: async () => {
          throw unlinkErr;
        },
      };
    });
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(9_100_000_000_000);
    try {
      const isolatedConfig = await import("../../../apps/api/src/config.js");
      const originalWorkspace = isolatedConfig.env.WORKSPACE_PATH;
      const originalMaxGb = isolatedConfig.env.MAX_WORKSPACE_SIZE_GB;
      (isolatedConfig.env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = capRoot;
      (isolatedConfig.env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 0.001;
      try {
        const isolatedStorage = await import("../../../apps/api/src/lib/object-storage.js");
        await expect(isolatedStorage.assertLocalCapacity()).rejects.toMatchObject({
          statusCode: 503,
          code: "workspace-cap",
        });

        await expect(isolatedStorage.deleteObject("uploads/job-1/a.bin")).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-not-writable",
          statusCode: 503,
          cause: erofs,
        });

        // Remove the file out-of-band: the failed EROFS delete must NOT have
        // cleared workspaceSizeCache, so assertLocalCapacity still trips.
        rmSync(join(jobDir, "a.bin"), { force: true });
        await expect(isolatedStorage.assertLocalCapacity()).rejects.toMatchObject({
          statusCode: 503,
          code: "workspace-cap",
        });

        unlinkErr = eio;
        await expect(isolatedStorage.deleteObject("uploads/job-1/a.bin")).rejects.toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: "storage-write-failed",
          statusCode: 503,
          cause: eio,
        });

        unlinkErr = unexpectedBug;
        await expect(isolatedStorage.deleteObject("uploads/job-1/a.bin")).rejects.toBe(
          unexpectedBug,
        );
        expect((unexpectedBug as TypeError & { statusCode?: number }).statusCode).toBe(500);

        // An ENOENT (file already absent) resolves quietly AND invalidates
        // workspaceSizeCache so the next capacity check sees the freed space.
        unlinkErr = enoent;
        await expect(isolatedStorage.deleteObject("uploads/job-1/a.bin")).resolves.toBeUndefined();
        await expect(isolatedStorage.assertLocalCapacity()).resolves.toBeUndefined();
      } finally {
        (isolatedConfig.env as { WORKSPACE_PATH: string }).WORKSPACE_PATH = originalWorkspace;
        (isolatedConfig.env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB =
          originalMaxGb;
      }
    } finally {
      nowSpy.mockRestore();
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
      rmSync(capRoot, { recursive: true, force: true });
    }
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

  it("treats verifyS3Bucket as a no-op on the local backend (#996)", async () => {
    await expect(verifyS3Bucket()).resolves.toBeUndefined();
  });

  it("rejects an invalid object key in objectExists instead of returning false (#2924)", async () => {
    await expect(objectExists("outputs/job-1/.")).rejects.toThrow(/invalid object key/i);
    await expect(objectExists("outputs/../../etc/passwd")).rejects.toThrow(/invalid object key/i);
  });

  it.skipIf(isRoot)(
    "rethrows a non-ENOENT local stat fault in objectExists instead of returning false (#2924)",
    async () => {
      const lockedJobId = `locked-exists-${process.pid}`;
      const lockedKey = `outputs/${lockedJobId}/locked.bin`;
      const lockedDir = join(env.WORKSPACE_PATH, "outputs", lockedJobId);
      await putObject(lockedKey, Buffer.from("locked bytes"));
      await chmod(lockedDir, 0o000);
      try {
        await expect(objectExists(lockedKey)).rejects.toMatchObject({
          code: "EACCES",
        });
      } finally {
        await chmod(lockedDir, 0o700).catch(() => {});
        await deletePrefix(`outputs/${lockedJobId}`).catch(() => {});
      }
    },
  );
});
