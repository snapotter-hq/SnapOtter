import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertOcrRuntimeInstallDiskSpace,
  buildOcrRuntimeInstallerCommand,
  canonicalRuntimeJson,
  cleanupDownloadedRuntimeRelease as cleanupDownloadedRuntimeReleaseWithLease,
  downloadVerifiedRuntimeRelease as downloadVerifiedRuntimeReleaseWithLease,
  loadOcrRuntimeTrustKeys,
  OcrRuntimeImportValidationError,
  type OcrRuntimeTrustKey,
  prepareOfflineRuntimeIndex,
  prepareOfflineRuntimeRelease,
  purgeOcrRuntimeDownloads as purgeOcrRuntimeDownloadsWithLease,
  verifyRuntimeIndex,
  writeBufferFully,
} from "../../../apps/api/src/lib/ocr-runtime-install.js";

const TARGET = "linux-amd64-cpu-py312" as const;
const ARCHIVE_BYTES = Buffer.from("immutable runtime archive");

const temporaryDirectories: string[] = [];

function hasOpenDescriptorFor(identity: { dev: bigint; ino: bigint }): boolean {
  return readdirSync("/dev/fd").some((entry) => {
    if (!/^\d+$/.test(entry)) return false;
    try {
      const descriptor = fstatSync(Number(entry), { bigint: true });
      return descriptor.dev === identity.dev && descriptor.ino === identity.ino;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EBADF" || code === "ENOENT") return false;
      throw error;
    }
  });
}

async function withInstallLease<T>(aiDataDir: string, operation: (fd: number) => Promise<T>) {
  mkdirSync(aiDataDir, { recursive: true });
  const lockPath = join(aiDataDir, "install.flock");
  const fd = openSync(lockPath, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o660);
  try {
    return await operation(fd);
  } finally {
    closeSync(fd);
  }
}

async function downloadVerifiedRuntimeRelease(
  options: Omit<Parameters<typeof downloadVerifiedRuntimeReleaseWithLease>[0], "installLockFd">,
) {
  return withInstallLease(options.aiDataDir, (installLockFd) =>
    downloadVerifiedRuntimeReleaseWithLease({ ...options, installLockFd }),
  );
}

async function cleanupDownloadedRuntimeRelease(
  aiDataDir: string,
  release: Parameters<typeof cleanupDownloadedRuntimeReleaseWithLease>[1],
) {
  return withInstallLease(aiDataDir, (installLockFd) =>
    cleanupDownloadedRuntimeReleaseWithLease(aiDataDir, release, installLockFd),
  );
}

async function purgeOcrRuntimeDownloads(aiDataDir: string) {
  return withInstallLease(aiDataDir, (installLockFd) =>
    purgeOcrRuntimeDownloadsWithLease(aiDataDir, installLockFd),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function signedIndex(
  options: {
    archiveFile?: string;
    archiveSha256?: string;
    archiveSize?: number;
    target?: string;
    minimumMemoryBytes?: number | null;
  } = {},
) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = "snapotter-ocr-release-2026";
  const artifact = {
    family: "ocr",
    target: options.target ?? TARGET,
    generation: "2.1.0-deadbeef",
    version: "2.1.0",
    platform: "linux",
    arch: "amd64",
    archive: {
      file: options.archiveFile ?? `ocr-${TARGET}.tar.gz`,
      sha256:
        options.archiveSha256 ?? "22553579e29b27b75c9b6375d816f02483bd2e6f76f9ffcc9ae5311422410917",
      size: options.archiveSize ?? ARCHIVE_BYTES.length,
      expandedSize: 1_000,
    },
    files: [
      {
        path: "venv/bin/python",
        sha256: "a".repeat(64),
        size: 1,
        mode: 493,
      },
    ],
    runtime: { pythonPath: "venv/bin/python", entrypoint: "ocr_runner.py" },
    models: { detection: "a".repeat(64) },
    compatibility: { protocolVersion: 1, snapotterVersion: "2.1.0" },
    capabilities: {
      qualities: ["balanced", "best"],
      providers: ["CPUExecutionProvider"],
    },
    ...(options.minimumMemoryBytes === null
      ? {}
      : { resources: { minimumMemoryBytes: options.minimumMemoryBytes ?? 4 * 1024 ** 3 } }),
  };
  const unsigned = { schemaVersion: 1, artifacts: [artifact] };
  const signature = sign(null, Buffer.from(canonicalRuntimeJson(unsigned)), privateKey).toString(
    "base64",
  );
  const index = {
    ...unsigned,
    signature: { keyId, algorithm: "ed25519", value: signature },
  };
  const trustKey: OcrRuntimeTrustKey = {
    keyId,
    algorithm: "ed25519",
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
  return { artifact, index, raw: Buffer.from(canonicalRuntimeJson(index)), trustKey };
}

describe("verifyRuntimeIndex", () => {
  it("loads the independently pinned release key from the official image environment", () => {
    const fixture = signedIndex();
    vi.stubEnv("OCR_RUNTIME_INDEX_KEY_ID", fixture.trustKey.keyId);
    vi.stubEnv(
      "OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64",
      Buffer.from(fixture.trustKey.publicKey).toString("base64"),
    );

    expect(loadOcrRuntimeTrustKeys()).toEqual([fixture.trustKey]);
  });

  it("rejects an incomplete or non-canonical official image trust environment", () => {
    vi.stubEnv("OCR_RUNTIME_INDEX_KEY_ID", "release-key");
    expect(() => loadOcrRuntimeTrustKeys()).toThrow("incomplete or invalid");

    vi.stubEnv("OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64", "not base64");
    expect(() => loadOcrRuntimeTrustKeys()).toThrow("incomplete or invalid");
  });

  it("authenticates a canonical index against an app-owned Ed25519 key", () => {
    const fixture = signedIndex();
    const verified = verifyRuntimeIndex(fixture.raw, TARGET, [fixture.trustKey], "2.1.0");

    expect(verified.artifact).toEqual(fixture.artifact);
    expect(verified.archiveFile).toBe(`ocr-${TARGET}.tar.gz`);
    expect(verified.archiveSha256).toBe(
      "22553579e29b27b75c9b6375d816f02483bd2e6f76f9ffcc9ae5311422410917",
    );
    expect(verified.minimumMemoryBytes).toBe(4 * 1024 ** 3);
  });

  it("requires a signed positive safe minimum-memory policy", () => {
    for (const minimumMemoryBytes of [null, 0, -1, Number.MAX_SAFE_INTEGER + 1]) {
      const fixture = signedIndex({ minimumMemoryBytes });
      expect(() => verifyRuntimeIndex(fixture.raw, TARGET, [fixture.trustKey], "2.1.0")).toThrow(
        "memory",
      );
    }
  });

  it("rejects non-canonical bytes, unknown keys, tampering, and version drift", () => {
    const fixture = signedIndex();
    expect(() =>
      verifyRuntimeIndex(
        Buffer.from(JSON.stringify(fixture.index)),
        TARGET,
        [fixture.trustKey],
        "2.1.0",
      ),
    ).toThrow("canonical");
    expect(() => verifyRuntimeIndex(fixture.raw, TARGET, [], "2.1.0")).toThrow("trusted");

    const tampered = structuredClone(fixture.index);
    tampered.artifacts[0].archive.size += 1;
    expect(() =>
      verifyRuntimeIndex(
        Buffer.from(canonicalRuntimeJson(tampered)),
        TARGET,
        [fixture.trustKey],
        "2.1.0",
      ),
    ).toThrow("signature");
    expect(() => verifyRuntimeIndex(fixture.raw, TARGET, [fixture.trustKey], "2.2.0")).toThrow(
      "version",
    );
  });

  it("rejects wrong targets, duplicate target objects, and unsafe release-relative paths", () => {
    const wrongTarget = signedIndex({ target: "linux-arm64-cpu-py311" });
    expect(() =>
      verifyRuntimeIndex(wrongTarget.raw, TARGET, [wrongTarget.trustKey], "2.1.0"),
    ).toThrow("exactly one");

    const traversal = signedIndex({ archiveFile: "../stolen.tar.gz" });
    expect(() => verifyRuntimeIndex(traversal.raw, TARGET, [traversal.trustKey], "2.1.0")).toThrow(
      "archive file",
    );

    const absolute = signedIndex({ archiveFile: "https://evil.example/runtime.tar.gz" });
    expect(() => verifyRuntimeIndex(absolute.raw, TARGET, [absolute.trustKey], "2.1.0")).toThrow(
      "archive file",
    );
  });
});

describe("downloadVerifiedRuntimeRelease", () => {
  it("persists every byte when the filesystem returns short writes", async () => {
    const input = Buffer.from("short writes must not truncate runtime archives");
    const persisted: Buffer[] = [];
    const file = {
      write: vi.fn(async (buffer: Uint8Array, offset: number, length: number) => {
        const bytesWritten = Math.min(3, length);
        persisted.push(Buffer.from(buffer.subarray(offset, offset + bytesWritten)));
        return { bytesWritten, buffer };
      }),
    };

    await expect(writeBufferFully(file, input)).resolves.toBe(input.length);
    expect(Buffer.concat(persisted)).toEqual(input);
    expect(file.write).toHaveBeenCalledTimes(Math.ceil(input.length / 3));
  });

  it("rejects an impossible filesystem write count", async () => {
    const input = Buffer.from("bounded write accounting");
    const file = {
      write: vi.fn(async (_buffer: Uint8Array, _offset: number, length: number) => ({
        bytesWritten: length + 1,
      })),
    };

    await expect(writeBufferFully(file, input)).rejects.toThrow("invalid byte count");
  });

  it("downloads only the trusted version directory and verifies archive bytes", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-download-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));
    const progress = vi.fn();

    const result = await downloadVerifiedRuntimeRelease({
      aiDataDir: directory,
      bundleRepo: "snapotter-hq/feature-bundles",
      version: "2.1.0",
      target: TARGET,
      trustKeys: [fixture.trustKey],
      fetchImpl,
      onProgress: progress,
    });

    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      "https://huggingface.co/snapotter-hq/feature-bundles/resolve/main/v2.1.0/v3/ocr-runtime-index.json",
      `https://huggingface.co/snapotter-hq/feature-bundles/resolve/main/v2.1.0/v3/ocr-${TARGET}.tar.gz`,
    ]);
    expect(readFileSync(result.archivePath)).toEqual(ARCHIVE_BYTES);
    expect(readFileSync(result.indexPath)).toEqual(fixture.raw);
    expect(statSync(join(directory, "v3")).mode & 0o7777).toBe(0o2770);
    expect(statSync(join(directory, "v3", "downloads")).mode & 0o7777).toBe(0o2770);
    expect(statSync(join(directory, "v3", "downloads", ".trash")).mode & 0o7777).toBe(0o2770);
    expect(statSync(result.archivePath).mode & 0o777).toBe(0o660);
    expect(statSync(result.indexPath).mode & 0o777).toBe(0o660);
    expect(progress).toHaveBeenCalledWith(90, "Verifying OCR runtime archive");
  });

  it("rejects a symlinked AI data root before creating cache children", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-root-symlink-"));
    temporaryDirectories.push(directory);
    const outside = join(directory, "outside");
    const aiDataDir = join(directory, "ai");
    mkdirSync(outside);
    symlinkSync(outside, aiDataDir);
    const lockFd = openSync(
      join(outside, "install.flock"),
      constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
      0o660,
    );
    const fetchImpl = vi.fn<typeof fetch>();

    try {
      await expect(
        downloadVerifiedRuntimeReleaseWithLease({
          installLockFd: lockFd,
          aiDataDir,
          bundleRepo: "snapotter-hq/feature-bundles",
          version: "2.1.0",
          target: TARGET,
          trustKeys: [fixture.trustKey],
          fetchImpl,
        }),
      ).rejects.toThrow("real directory");
    } finally {
      closeSync(lockFd);
    }

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readdirSync(outside)).toEqual(["install.flock"]);
  });

  it("requires the shared install-lease descriptor before mutating the cache", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-no-lease-"));
    temporaryDirectories.push(directory);

    await expect(
      downloadVerifiedRuntimeReleaseWithLease({
        installLockFd: -1,
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl: vi.fn<typeof fetch>(),
      }),
    ).rejects.toThrow("install lease");
  });

  it("rejects overlapping cache mutations that reuse one install lease", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-overlap-"));
    temporaryDirectories.push(directory);
    const lockFd = openSync(
      join(directory, "install.flock"),
      constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
      0o660,
    );
    let resolveIndex!: (response: Response) => void;
    const pendingIndex = new Promise<Response>((resolve) => {
      resolveIndex = resolve;
    });
    const firstFetch = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => pendingIndex)
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES));
    const first = downloadVerifiedRuntimeReleaseWithLease({
      installLockFd: lockFd,
      aiDataDir: directory,
      bundleRepo: "snapotter-hq/feature-bundles",
      version: "2.1.0",
      target: TARGET,
      trustKeys: [fixture.trustKey],
      fetchImpl: firstFetch,
    });

    try {
      await vi.waitFor(() => expect(firstFetch).toHaveBeenCalledOnce());
      await expect(
        downloadVerifiedRuntimeReleaseWithLease({
          installLockFd: lockFd,
          aiDataDir: directory,
          bundleRepo: "snapotter-hq/feature-bundles",
          version: "2.1.0",
          target: TARGET,
          trustKeys: [fixture.trustKey],
          fetchImpl: vi.fn<typeof fetch>(),
        }),
      ).rejects.toThrow("install lease");
      resolveIndex(new Response(fixture.raw));
      await expect(first).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    } finally {
      closeSync(lockFd);
    }
  });

  it("retries a transient index response after Retry-After and cancels its body", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-index-retry-"));
    temporaryDirectories.push(directory);
    const canceled = vi.fn();
    const retryBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("temporarily unavailable"));
      },
      cancel: canceled,
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(retryBody, {
          status: 503,
          headers: { "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));
    const sleep = vi.fn(async (_delayMs: number) => {});

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 100,
          maxDelayMs: 2_000,
          maxTotalDelayMs: 5_000,
          random: () => 0,
          sleep,
        },
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1_000);
    expect(canceled).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry an oversized index and cancels its unconsumed body", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-index-size-policy-"));
    temporaryDirectories.push(directory);
    const canceled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("oversized by declaration"));
      },
      cancel: canceled,
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-length": String(16 * 1024 * 1024 + 1) },
      }),
    );

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).rejects.toThrow("exceeds its size limit");
    expect(canceled).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("retries an index body truncated below its declared content length", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-index-truncated-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(fixture.raw.subarray(0, Math.floor(fixture.raw.length / 2)), {
          status: 200,
          headers: { "content-length": String(fixture.raw.length) },
        }),
      )
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not compare decoded index bytes to an encoded Content-Length", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-decoded-index-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(fixture.raw, {
          status: 200,
          headers: {
            "content-encoding": "gzip",
            "content-length": String(Math.floor(fixture.raw.length / 2)),
          },
        }),
      )
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
  });

  it("retries transient fetch failures and surfaces the final bounded-attempt error", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-network-attempts-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(
      Object.assign(new Error("socket reset by peer"), {
        code: "ECONNRESET",
      }),
    );
    const sleep = vi.fn(async (_delayMs: number) => {});

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          maxTotalDelayMs: 1_000,
          random: () => 0,
          sleep,
        },
      }),
    ).rejects.toThrow(
      "OCR runtime index download failed after 3 attempts (150ms retry delay): OCR runtime network request failed: socket reset by peer",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[50], [100]]);
  });

  it("does not mistake a local TypeError for a transient network failure", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-local-type-error-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        onProgress: (_percent, stage) => {
          if (stage === "Downloading OCR runtime") throw new TypeError("progress callback failed");
        },
        retry: {
          maxAttempts: 3,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).rejects.toThrow("progress callback failed");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("bounds Retry-After and the cumulative retry delay", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-delay-budget-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "retry-after": "999999999" } }),
      )
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));
    const sleep = vi.fn(async (_delayMs: number) => {});

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 50,
          maxDelayMs: 400,
          maxTotalDelayMs: 1_000,
          random: () => 0.5,
          sleep,
        },
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(400);
  });

  it("honors an HTTP-date Retry-After using the injected clock", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-retry-date-"));
    temporaryDirectories.push(directory);
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 503,
          headers: { "retry-after": new Date(now + 2_000).toUTCString() },
        }),
      )
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));
    const sleep = vi.fn(async (_delayMs: number) => {});

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 100,
          maxDelayMs: 5_000,
          maxTotalDelayMs: 5_000,
          now: () => now,
          sleep,
        },
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(2_000);
  });

  it("stops when the cumulative retry-delay budget is exhausted", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-delay-exhausted-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const sleep = vi.fn(async (_delayMs: number) => {});

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        retry: {
          maxAttempts: 6,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          maxTotalDelayMs: 125,
          random: () => 0,
          sleep,
        },
      }),
    ).rejects.toThrow("retry delay budget was exhausted after 2 attempts");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[50]]);
  });

  it("shares the total retry-delay budget across index and archive transfers", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-shared-delay-budget-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const sleep = vi.fn(async (_delayMs: number) => {});

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          maxTotalDelayMs: 100,
          random: () => 0.5,
          sleep,
        },
      }),
    ).rejects.toThrow("OCR runtime archive download retry delay budget was exhausted");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[75]]);
  });

  it.each([
    { retry: { maxAttempts: 7 }, message: "retry attempts" },
    { retry: { maxDelayMs: 30_001 }, message: "retry maximum delay" },
    { retry: { maxTotalDelayMs: 120_001 }, message: "retry total delay" },
    {
      retry: { baseDelayMs: 1_001, maxDelayMs: 1_000 },
      message: "base delay cannot exceed",
    },
  ])("rejects an unbounded retry policy: $message", async ({ retry, message }) => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-retry-policy-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        retry,
      }),
    ).rejects.toThrow(message);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    408, 425, 429, 500, 502, 503, 504,
  ])("retries the explicitly allowed transient HTTP status %i", async (status) => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), `snapotter-ocr-http-${status}-`));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it.each([
    400, 401, 403, 404, 409, 422, 501, 505,
  ])("does not retry the permanent HTTP status %i", async (status) => {
    const directory = mkdtempSync(join(tmpdir(), `snapotter-ocr-http-${status}-`));
    temporaryDirectories.push(directory);
    const canceled = vi.fn();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("permanent failure"));
      },
      cancel: canceled,
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(responseBody, { status }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).rejects.toThrow(`HTTP ${status}`);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(canceled).toHaveBeenCalledOnce();
  });

  it("accepts zero to disable both download watchdogs", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-no-watchdog-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        timeoutMs: 0,
        stallTimeoutMs: 0,
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
  });

  it("rejects a fresh download before transfer when the data volume cannot stage it", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-low-space-fresh-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        diskFreeBytes: async () => 0n,
      }),
    ).rejects.toThrow("insufficient disk space before OCR runtime download");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects insufficient configured memory after authenticating the index but before archive transfer", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-low-memory-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        memoryOptions: { effectiveMemoryBytes: 4 * 1024 ** 3 - 1 },
      }),
    ).rejects.toThrow("insufficient memory for accurate OCR runtime");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a resumed download before transfer when remaining space cannot stage it", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-low-space-resume-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const offset = 7;
    writeFileSync(
      join(downloads, `${fixture.artifact.archive.sha256}.part`),
      ARCHIVE_BYTES.subarray(0, offset),
    );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(ARCHIVE_BYTES.subarray(offset), {
          status: 206,
          headers: {
            "content-range": `bytes ${offset}-${ARCHIVE_BYTES.length - 1}/${ARCHIVE_BYTES.length}`,
          },
        }),
      );

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        diskFreeBytes: async () => 0n,
      }),
    ).rejects.toThrow("insufficient disk space before OCR runtime download");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reuses a verified cached archive without requiring room for another installation", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-cached-archive-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    writeFileSync(join(downloads, `${fixture.artifact.archive.sha256}.tar.gz`), ARCHIVE_BYTES);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        diskFreeBytes: async () => 0n,
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("promotes a verified complete partial without requiring duplicate staging space", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-complete-partial-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    writeFileSync(join(downloads, `${fixture.artifact.archive.sha256}.part`), ARCHIVE_BYTES);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        diskFreeBytes: async () => 0n,
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(downloads, `${fixture.artifact.archive.sha256}.tar.gz`))).toEqual(
      ARCHIVE_BYTES,
    );
  });

  it("follows only bounded HTTPS redirects on the Hugging Face delivery hosts", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-redirect-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn-lfs-us-1.hf.co/releases/index" },
        }),
      )
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: "https://cas-bridge.xethub.com/releases/archive" },
        }),
      )
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.redirect === "manual")).toBe(true);
  });

  it("rejects a download redirect outside the trusted delivery hosts", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-evil-redirect-"));
    temporaryDirectories.push(directory);
    const canceled = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Buffer.from("redirect"));
          },
          cancel: canceled,
        }),
        {
          status: 302,
          headers: { location: "https://huggingface.co.attacker.invalid/runtime" },
        },
      ),
    );

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
      }),
    ).rejects.toThrow("redirect is not trusted");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(canceled).toHaveBeenCalledOnce();
  });

  it("does not retry a malformed redirect location", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-malformed-redirect-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://[" },
        }),
    );

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).rejects.toThrow("download redirect is invalid");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("resumes a partial archive only when the server honors the exact range", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-resume-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const partialPath = join(
      downloads,
      "22553579e29b27b75c9b6375d816f02483bd2e6f76f9ffcc9ae5311422410917.part",
    );
    writeFileSync(partialPath, ARCHIVE_BYTES.subarray(0, 10), { flag: "wx" });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockImplementationOnce(async (_url, init) => {
        expect(new Headers(init?.headers).get("range")).toBe("bytes=10-");
        return new Response(ARCHIVE_BYTES.subarray(10), {
          status: 206,
          headers: {
            "content-range": `bytes 10-${ARCHIVE_BYTES.length - 1}/${ARCHIVE_BYTES.length}`,
          },
        });
      });

    const result = await downloadVerifiedRuntimeRelease({
      aiDataDir: directory,
      bundleRepo: "snapotter-hq/feature-bundles",
      version: "2.1.0",
      target: TARGET,
      trustKeys: [fixture.trustKey],
      fetchImpl,
    });

    expect(readFileSync(result.archivePath)).toEqual(ARCHIVE_BYTES);
  });

  it("discards a corrupt resumed prefix and retries once from byte zero", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-corrupt-resume-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const offset = 10;
    const partialPath = join(downloads, `${fixture.artifact.archive.sha256}.part`);
    writeFileSync(partialPath, Buffer.alloc(offset, 0x78), { flag: "wx" });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockImplementationOnce(async (_url, init) => {
        expect(new Headers(init?.headers).get("range")).toBe(`bytes=${offset}-`);
        return new Response(ARCHIVE_BYTES.subarray(offset), {
          status: 206,
          headers: {
            "content-range": `bytes ${offset}-${ARCHIVE_BYTES.length - 1}/${ARCHIVE_BYTES.length}`,
          },
        });
      })
      .mockImplementationOnce(async (_url, init) => {
        expect(new Headers(init?.headers).get("range")).toBeNull();
        return new Response(ARCHIVE_BYTES, { status: 200 });
      });

    const result = await downloadVerifiedRuntimeRelease({
      aiDataDir: directory,
      bundleRepo: "snapotter-hq/feature-bundles",
      version: "2.1.0",
      target: TARGET,
      trustKeys: [fixture.trustKey],
      fetchImpl,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        maxTotalDelayMs: 0,
        sleep: async () => {},
      },
    });

    expect(readFileSync(result.archivePath)).toEqual(ARCHIVE_BYTES);
    expect(existsSync(partialPath)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects a non-exact resume range without retrying and cancels its body", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-range-policy-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const offset = 10;
    writeFileSync(
      join(downloads, `${fixture.artifact.archive.sha256}.part`),
      ARCHIVE_BYTES.subarray(0, offset),
    );
    const canceled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(ARCHIVE_BYTES.subarray(offset));
      },
      cancel: canceled,
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(body, {
          status: 206,
          headers: {
            "content-range": `bytes ${offset}-${ARCHIVE_BYTES.length - 2}/${ARCHIVE_BYTES.length}`,
          },
        }),
      );

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        stallTimeoutMs: 10,
        retry: { maxAttempts: 1 },
      }),
    ).rejects.toThrow("mismatched resume range");
    expect(canceled).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("preserves and safely resumes archive bytes after a transient body failure", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-body-retry-"));
    temporaryDirectories.push(directory);
    const prefixLength = 9;
    let firstPull = true;
    const interruptedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (firstPull) {
          firstPull = false;
          controller.enqueue(ARCHIVE_BYTES.subarray(0, prefixLength));
          return;
        }
        controller.error(new TypeError("terminated"));
      },
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(interruptedBody, { status: 200 }))
      .mockImplementationOnce(async (_url, init) => {
        expect(new Headers(init?.headers).get("range")).toBe(`bytes=${prefixLength}-`);
        return new Response(ARCHIVE_BYTES.subarray(prefixLength), {
          status: 206,
          headers: {
            "content-range": `bytes ${prefixLength}-${ARCHIVE_BYTES.length - 1}/${ARCHIVE_BYTES.length}`,
          },
        });
      });

    const result = await downloadVerifiedRuntimeRelease({
      aiDataDir: directory,
      bundleRepo: "snapotter-hq/feature-bundles",
      version: "2.1.0",
      target: TARGET,
      trustKeys: [fixture.trustKey],
      fetchImpl,
      retry: {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        maxTotalDelayMs: 0,
        random: () => 0,
        sleep: async () => {},
      },
    });

    expect(readFileSync(result.archivePath)).toEqual(ARCHIVE_BYTES);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("treats an unexpectedly truncated archive response as resumable transport failure", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-truncated-retry-"));
    temporaryDirectories.push(directory);
    const prefixLength = 8;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES.subarray(0, prefixLength), { status: 200 }))
      .mockImplementationOnce(async (_url, init) => {
        expect(new Headers(init?.headers).get("range")).toBe(`bytes=${prefixLength}-`);
        return new Response(ARCHIVE_BYTES.subarray(prefixLength), {
          status: 206,
          headers: {
            "content-range": `bytes ${prefixLength}-${ARCHIVE_BYTES.length - 1}/${ARCHIVE_BYTES.length}`,
          },
        });
      });

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry an archive size violation and cancels the abandoned body", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-size-policy-"));
    temporaryDirectories.push(directory);
    const canceled = vi.fn();
    const oversizedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.concat([ARCHIVE_BYTES, Buffer.from("!")]));
      },
      cancel: canceled,
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(oversizedBody, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).rejects.toThrow("exceeded its signed size");
    expect(canceled).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry an archive hash failure", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-hash-policy-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(Buffer.alloc(ARCHIVE_BYTES.length, 0x78), { status: 200 }),
      );

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        retry: {
          maxAttempts: 3,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).rejects.toThrow("failed SHA-256 verification");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry signed-index schema or signature failures", async () => {
    const fixture = signedIndex();
    const tampered = structuredClone(fixture.index);
    tampered.artifacts[0].archive.size += 1;
    const cases = [
      { label: "schema", raw: Buffer.from("{}"), message: "schema" },
      {
        label: "signature",
        raw: Buffer.from(canonicalRuntimeJson(tampered)),
        message: "signature",
      },
    ];

    for (const testCase of cases) {
      const directory = mkdtempSync(join(tmpdir(), `snapotter-ocr-${testCase.label}-policy-`));
      temporaryDirectories.push(directory);
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(testCase.raw, { status: 200 }));

      await expect(
        downloadVerifiedRuntimeRelease({
          aiDataDir: directory,
          bundleRepo: "snapotter-hq/feature-bundles",
          version: "2.1.0",
          target: TARGET,
          trustKeys: [fixture.trustKey],
          fetchImpl,
          retry: {
            maxAttempts: 3,
            baseDelayMs: 0,
            maxDelayMs: 0,
            maxTotalDelayMs: 0,
            sleep: async () => {},
          },
        }),
      ).rejects.toThrow(testCase.message);
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  });

  it("does not follow a symlink planted while creating a partial archive", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-create-swap-"));
    temporaryDirectories.push(directory);
    const outsidePath = join(directory, "outside");
    const outsideBytes = Buffer.from("must not be overwritten");
    writeFileSync(outsidePath, outsideBytes);
    const partialPath = join(
      directory,
      "v3",
      "downloads",
      `${fixture.artifact.archive.sha256}.part`,
    );
    const canceled = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockImplementationOnce(async () => {
        symlinkSync(outsidePath, partialPath);
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(ARCHIVE_BYTES);
            },
            cancel: canceled,
          }),
          { status: 200 },
        );
      });

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
      }),
    ).rejects.toThrow();
    expect(readFileSync(outsidePath)).toEqual(outsideBytes);
    expect(canceled).toHaveBeenCalledOnce();
  });

  it("does not follow a partial archive swapped to a symlink during resume", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-resume-swap-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const partialPath = join(downloads, `${fixture.artifact.archive.sha256}.part`);
    const prefix = ARCHIVE_BYTES.subarray(0, 10);
    writeFileSync(partialPath, prefix, { flag: "wx" });
    const outsidePath = join(directory, "outside");
    writeFileSync(outsidePath, prefix);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockImplementationOnce(async (_url, init) => {
        expect(new Headers(init?.headers).get("range")).toBe("bytes=10-");
        rmSync(partialPath);
        symlinkSync(outsidePath, partialPath);
        return new Response(ARCHIVE_BYTES.subarray(10), {
          status: 206,
          headers: {
            "content-range": `bytes 10-${ARCHIVE_BYTES.length - 1}/${ARCHIVE_BYTES.length}`,
          },
        });
      });

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
      }),
    ).rejects.toThrow();
    expect(readFileSync(outsidePath)).toEqual(prefix);
  });

  it("cancels a full-response body when a partial is swapped before safe restart", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-restart-swap-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const partialPath = join(downloads, `${fixture.artifact.archive.sha256}.part`);
    const prefix = ARCHIVE_BYTES.subarray(0, 10);
    writeFileSync(partialPath, prefix, { flag: "wx" });
    const originalIdentity = statSync(partialPath, { bigint: true });
    const canceled = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockImplementationOnce(async (_url, init) => {
        expect(new Headers(init?.headers).get("range")).toBe("bytes=10-");
        expect(hasOpenDescriptorFor(originalIdentity)).toBe(true);
        const replacementPath = `${partialPath}.replacement`;
        writeFileSync(replacementPath, prefix, { flag: "wx" });
        rmSync(partialPath);
        renameSync(replacementPath, partialPath);
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(ARCHIVE_BYTES);
              controller.close();
            },
            cancel: canceled,
          }),
          { status: 200 },
        );
      });

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
      }),
    ).rejects.toThrow("changed while the download was in progress");
    expect(canceled).toHaveBeenCalledOnce();
    expect(readFileSync(partialPath)).toEqual(prefix);
    expect(hasOpenDescriptorFor(originalIdentity)).toBe(false);
  });

  it("rejects a same-size regular-file swap during resume", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-resume-inode-swap-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const partialPath = join(downloads, `${fixture.artifact.archive.sha256}.part`);
    const prefix = ARCHIVE_BYTES.subarray(0, 10);
    writeFileSync(partialPath, prefix, { flag: "wx" });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockImplementationOnce(async (_url, init) => {
        expect(new Headers(init?.headers).get("range")).toBe("bytes=10-");
        const replacementPath = `${partialPath}.replacement`;
        writeFileSync(replacementPath, prefix, { flag: "wx" });
        rmSync(partialPath);
        renameSync(replacementPath, partialPath);
        return new Response(ARCHIVE_BYTES.subarray(10), {
          status: 206,
          headers: {
            "content-range": `bytes 10-${ARCHIVE_BYTES.length - 1}/${ARCHIVE_BYTES.length}`,
          },
        });
      });

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
      }),
    ).rejects.toThrow("changed while the download was in progress");
    expect(readFileSync(partialPath)).toEqual(prefix);
  });

  it("repairs an oversized digest-named index left by an interrupted write", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-index-cache-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const digest = createHash("sha256").update(fixture.raw).digest("hex");
    const indexPath = join(downloads, `${digest}.index.json`);
    writeFileSync(indexPath, Buffer.alloc(17 * 1024 * 1024));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
          .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 })),
      }),
    ).resolves.toMatchObject({ indexPath });
    expect(readFileSync(indexPath)).toEqual(fixture.raw);
  });

  it("repairs a truncated digest-named index left by a prior crash", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-truncated-index-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const digest = createHash("sha256").update(fixture.raw).digest("hex");
    const indexPath = join(downloads, `${digest}.index.json`);
    writeFileSync(indexPath, fixture.raw.subarray(0, Math.floor(fixture.raw.length / 2)));
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
      }),
    ).resolves.toMatchObject({ indexPath });
    expect(readFileSync(indexPath)).toEqual(fixture.raw);
  });

  it("never replaces a digest-named index symlink while repairing the cache", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-index-symlink-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const digest = createHash("sha256").update(fixture.raw).digest("hex");
    const outsidePath = join(directory, "outside-index");
    const outsideBytes = Buffer.from("must not be replaced");
    writeFileSync(outsidePath, outsideBytes);
    symlinkSync(outsidePath, join(downloads, `${digest}.index.json`));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 })),
      }),
    ).rejects.toThrow("private regular file");
    expect(readFileSync(outsidePath)).toEqual(outsideBytes);
  });

  it("cancels and retries a stalled response", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-stall-retry-"));
    temporaryDirectories.push(directory);
    const canceled = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              return new Promise(() => {});
            },
            cancel: canceled,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
      .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 }));

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        timeoutMs: 1_000,
        stallTimeoutMs: 10,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 0,
          maxDelayMs: 0,
          maxTotalDelayMs: 0,
          sleep: async () => {},
        },
      }),
    ).resolves.toMatchObject({ archiveSize: ARCHIVE_BYTES.length });
    expect(canceled).toHaveBeenCalledOnce();
  });

  it("aborts a persistently stalled response instead of holding the install queue forever", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-stall-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            return new Promise(() => {});
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        timeoutMs: 1_000,
        stallTimeoutMs: 10,
        retry: { maxAttempts: 1 },
      }),
    ).rejects.toThrow("stalled");
  });

  it("enforces the overall deadline while a response body is stalled", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-deadline-"));
    temporaryDirectories.push(directory);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            return new Promise(() => {});
          },
        }),
        { status: 200 },
      ),
    );

    const startedAt = Date.now();
    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        timeoutMs: 10,
        stallTimeoutMs: 1_000,
      }),
    ).rejects.toThrow("timed out after 10ms");
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it("does not let an unresponsive body cancellation defeat the stall watchdog", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-cancel-watchdog-"));
    temporaryDirectories.push(directory);
    const canceled = vi.fn(() => new Promise<void>(() => {}));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            return new Promise(() => {});
          },
          cancel: canceled,
        }),
        { status: 200 },
      ),
    );

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        timeoutMs: 500,
        stallTimeoutMs: 10,
        retry: { maxAttempts: 1 },
      }),
    ).rejects.toThrow("stalled");
    expect(canceled).toHaveBeenCalledOnce();
  });

  it("rejects a verified cached archive when hashing crosses the overall deadline", async () => {
    const archiveSize = 128 * 1024 * 1024;
    const archiveSha256 = "254bcc3fc4f27172636df4bf32de9f107f620d559b20d760197e452b97453917";
    const fixture = signedIndex({ archiveSha256, archiveSize });
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-cached-deadline-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const archivePath = join(downloads, `${archiveSha256}.tar.gz`);
    writeFileSync(archivePath, Buffer.alloc(0));
    truncateSync(archivePath, archiveSize);
    const nativeSetTimeout = globalThis.setTimeout;
    let startDeadline: (() => void) | undefined;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((handler, delay, ...args) => {
      if (delay !== 20 || startDeadline) return nativeSetTimeout(handler, delay, ...args);
      const placeholder = nativeSetTimeout(() => {}, 60_000);
      startDeadline = () => {
        clearTimeout(placeholder);
        nativeSetTimeout(handler, delay, ...args);
      };
      return placeholder;
    }) as typeof setTimeout);
    const fetchImpl = vi.fn<typeof fetch>().mockImplementationOnce(async () => {
      if (!startDeadline) throw new Error("overall deadline was not registered before fetch");
      startDeadline();
      return new Response(fixture.raw, { status: 200 });
    });

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [fixture.trustKey],
        fetchImpl,
        timeoutMs: 20,
      }),
    ).rejects.toThrow("timed out after 20ms");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("clears the built-in retry timer when the overall deadline aborts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-retry-abort-"));
    temporaryDirectories.push(directory);
    const nativeSetTimeout = globalThis.setTimeout;
    const retryTimers: ReturnType<typeof setTimeout>[] = [];
    let startDeadline: (() => void) | undefined;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((handler, delay, ...args) => {
      // Defer the overall 100ms deadline until the first fetch is dispatched, so a
      // loaded CI runner cannot fire it before fetch is even called (the source of
      // this test's flakiness). Mirrors the deferred-deadline trick used above.
      if (delay === 100 && !startDeadline) {
        const placeholder = nativeSetTimeout(() => {}, 60_000);
        startDeadline = () => {
          clearTimeout(placeholder);
          nativeSetTimeout(handler, delay, ...args);
        };
        return placeholder;
      }
      const timer = nativeSetTimeout(handler, delay, ...args);
      if (delay === 500) retryTimers.push(timer);
      return timer;
    }) as typeof setTimeout);
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    let armed = false;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (!armed) {
        if (!startDeadline) throw new Error("overall deadline was not registered before fetch");
        startDeadline();
        armed = true;
      }
      return new Response("temporary outage", { status: 503 });
    });

    await expect(
      downloadVerifiedRuntimeRelease({
        aiDataDir: directory,
        bundleRepo: "snapotter-hq/feature-bundles",
        version: "2.1.0",
        target: TARGET,
        trustKeys: [],
        fetchImpl,
        timeoutMs: 100,
        retry: {
          maxAttempts: 2,
          baseDelayMs: 1_000,
          maxDelayMs: 1_000,
          random: () => 0,
        },
      }),
    ).rejects.toThrow("timed out after 100ms");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(retryTimers).toHaveLength(1);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(retryTimers[0]);
  });

  it("roots serialized cache mutations in descriptors and a group-shared quarantine", () => {
    const source = readFileSync(
      join(process.cwd(), "apps/api/src/lib/ocr-runtime-install.ts"),
      "utf8",
    );

    expect(source).toContain("async function quarantineAndRemove");
    expect(source).toContain("/proc/self/fd/");
    expect(source).toContain(".trash");
    expect(source).toContain("observed.isDirectory() ? 0o5002 : 0o7002");
    expect(source).not.toMatch(/await assertPathIdentity\(path, expected\);\s*await rm\(path\)/u);
    expect(source).not.toContain("await rm(finalPath, { force: true });");

    const entrypoint = readFileSync(join(process.cwd(), "docker/entrypoint.sh"), "utf8");
    expect(entrypoint).toMatch(/^umask 0007$/mu);
  });

  it.skipIf(process.platform !== "linux")(
    "never writes through a downloads parent swapped to an external symlink",
    async () => {
      const fixture = signedIndex();
      const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-parent-swap-"));
      temporaryDirectories.push(directory);
      const downloads = join(directory, "v3", "downloads");
      const detachedDownloads = join(directory, "detached-downloads");
      const outside = join(directory, "outside");
      mkdirSync(outside);
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
        .mockImplementationOnce(async () => {
          renameSync(downloads, detachedDownloads);
          symlinkSync(outside, downloads);
          return new Response(ARCHIVE_BYTES, { status: 200 });
        });

      await expect(
        downloadVerifiedRuntimeRelease({
          aiDataDir: directory,
          bundleRepo: "snapotter-hq/feature-bundles",
          version: "2.1.0",
          target: TARGET,
          trustKeys: [fixture.trustKey],
          fetchImpl,
        }),
      ).rejects.toThrow("download cache directory changed");
      expect(readdirSync(outside)).toEqual([]);
      expect(readdirSync(detachedDownloads)).toContain(`${fixture.artifact.archive.sha256}.tar.gz`);
    },
  );

  it("reconciles crash-stranded quarantine links before validating cached objects", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-trash-reconcile-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    const trash = join(downloads, ".trash");
    mkdirSync(trash, { recursive: true, mode: 0o700 });
    const partialName = `${fixture.artifact.archive.sha256}.part`;
    const temporaryTrashPath = join(trash, "pending");
    writeFileSync(temporaryTrashPath, ARCHIVE_BYTES);
    const identity = statSync(temporaryTrashPath, { bigint: true });
    const quarantineName = [
      "delete",
      identity.dev,
      identity.ino,
      identity.size,
      "00000000-0000-4000-8000-000000000000",
      partialName,
    ].join("-");
    const quarantinePath = join(trash, quarantineName);
    renameSync(temporaryTrashPath, quarantinePath);
    linkSync(quarantinePath, join(downloads, partialName));
    expect(statSync(quarantinePath).nlink).toBe(2);

    const result = await downloadVerifiedRuntimeRelease({
      aiDataDir: directory,
      bundleRepo: "snapotter-hq/feature-bundles",
      version: "2.1.0",
      target: TARGET,
      trustKeys: [fixture.trustKey],
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(fixture.raw)),
    });

    expect(readFileSync(result.archivePath)).toEqual(ARCHIVE_BYTES);
    expect(readdirSync(trash)).toEqual([]);
  });

  it("finishes an interrupted mismatched-object restore idempotently", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-trash-restore-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    const trash = join(downloads, ".trash");
    mkdirSync(trash, { recursive: true, mode: 0o2770 });
    const partialName = `${fixture.artifact.archive.sha256}.part`;
    const quarantinePath = join(trash, "pending");
    writeFileSync(quarantinePath, ARCHIVE_BYTES);
    const actual = statSync(quarantinePath, { bigint: true });
    const quarantineName = [
      "delete",
      actual.dev,
      actual.ino + 1n,
      actual.size,
      "00000000-0000-4000-8000-000000000000",
      partialName,
    ].join("-");
    const encodedPath = join(trash, quarantineName);
    renameSync(quarantinePath, encodedPath);
    linkSync(encodedPath, join(downloads, partialName));
    expect(statSync(encodedPath).nlink).toBe(2);

    const result = await downloadVerifiedRuntimeRelease({
      aiDataDir: directory,
      bundleRepo: "snapotter-hq/feature-bundles",
      version: "2.1.0",
      target: TARGET,
      trustKeys: [fixture.trustKey],
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(fixture.raw)),
    });

    expect(readFileSync(result.archivePath)).toEqual(ARCHIVE_BYTES);
    expect(readdirSync(trash)).toEqual([]);
  });

  it("reconciles crash-stranded verified-index temporary files", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-index-temp-reconcile-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    mkdirSync(downloads, { recursive: true });
    const temporaryName = `.${"b".repeat(64)}.00000000-0000-4000-8000-000000000000.tmp`;
    writeFileSync(join(downloads, temporaryName), fixture.raw);

    await downloadVerifiedRuntimeRelease({
      aiDataDir: directory,
      bundleRepo: "snapotter-hq/feature-bundles",
      version: "2.1.0",
      target: TARGET,
      trustKeys: [fixture.trustKey],
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(fixture.raw))
        .mockResolvedValueOnce(new Response(ARCHIVE_BYTES)),
    });

    expect(existsSync(join(downloads, temporaryName))).toBe(false);
  });

  it("removes verified release objects after a successful activation", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-cleanup-"));
    temporaryDirectories.push(directory);
    const release = await downloadVerifiedRuntimeRelease({
      aiDataDir: directory,
      bundleRepo: "snapotter-hq/feature-bundles",
      version: "2.1.0",
      target: TARGET,
      trustKeys: [fixture.trustKey],
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(fixture.raw, { status: 200 }))
        .mockResolvedValueOnce(new Response(ARCHIVE_BYTES, { status: 200 })),
    });

    await cleanupDownloadedRuntimeRelease(directory, release);

    expect(existsSync(release.indexPath)).toBe(false);
    expect(existsSync(release.archivePath)).toBe(false);
  });

  it("purges completed, temporary, partial, and symlink download cache entries", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-purge-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    const outside = join(directory, "outside");
    mkdirSync(downloads, { recursive: true });
    writeFileSync(outside, "keep");
    for (const name of ["archive.tar.gz", "archive.part", "index.json", ".index.tmp"]) {
      writeFileSync(join(downloads, name), name);
    }
    symlinkSync(outside, join(downloads, "untrusted-link"));

    await purgeOcrRuntimeDownloads(directory);

    expect(existsSync(downloads)).toBe(true);
    expect(readFileSync(outside, "utf8")).toBe("keep");
    expect(existsSync(join(downloads, "archive.tar.gz"))).toBe(false);
    expect(existsSync(join(downloads, "archive.part"))).toBe(false);
    expect(existsSync(join(downloads, "index.json"))).toBe(false);
    expect(existsSync(join(downloads, ".index.tmp"))).toBe(false);
    expect(existsSync(join(downloads, "untrusted-link"))).toBe(false);
  });

  it("refuses cleanup outside the cache and unexpected cache directories", async () => {
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-cleanup-safety-"));
    temporaryDirectories.push(directory);
    const downloads = join(directory, "v3", "downloads");
    const outside = join(directory, "outside.tar.gz");
    mkdirSync(join(downloads, "unexpected"), { recursive: true });
    writeFileSync(outside, "keep");

    await expect(
      cleanupDownloadedRuntimeRelease(directory, {
        indexPath: outside,
        archivePath: join(downloads, "archive.tar.gz"),
      }),
    ).rejects.toThrow("outside the download cache");
    expect(existsSync(outside)).toBe(true);
    await expect(purgeOcrRuntimeDownloads(directory)).rejects.toThrow("Unexpected entry");
  });
});

describe("buildOcrRuntimeInstallerCommand", () => {
  it("uses the immutable system Python, authenticated local bytes, and a functional smoke", () => {
    const fixture = signedIndex();
    const verified = verifyRuntimeIndex(fixture.raw, TARGET, [fixture.trustKey], "2.1.0");
    vi.stubEnv("SNAPOTTER_SYSTEM_PYTHON", undefined);
    const command = buildOcrRuntimeInstallerCommand({
      aiDataDir: "/data/ai",
      installerPath: "/app/install_runtime.py",
      release: {
        ...verified,
        indexPath: "/data/ai/v3/downloads/index.json",
        archivePath: "/data/ai/v3/downloads/runtime.tar.gz",
      },
    });

    expect(command.executable).toBe("/usr/bin/python3");
    expect(command.args).toEqual([
      "/app/install_runtime.py",
      "install",
      "--ai-data-dir",
      "/data/ai",
      "--index",
      "/data/ai/v3/downloads/index.json",
      "--archive",
      "/data/ai/v3/downloads/runtime.tar.gz",
      "--family",
      "ocr",
      "--target",
      TARGET,
      "--expected-index-sha256",
      createHash("sha256").update(fixture.raw).digest("hex"),
      "--smoke-command",
      JSON.stringify(["{runtime}/venv/bin/python", "{runtime}/ocr_runner.py", "--smoke"]),
      "--preverified-index",
    ]);
    expect(command.env).not.toHaveProperty("PYTHONPATH");
    expect(command.env).not.toHaveProperty("PYTHONHOME");
    expect(command.env.SNAPOTTER_NETWORK_DISABLED).toBe("1");
  });

  it("keeps explicit and environment system-Python overrides", () => {
    const fixture = signedIndex();
    const verified = verifyRuntimeIndex(fixture.raw, TARGET, [fixture.trustKey], "2.1.0");
    const options = {
      aiDataDir: "/data/ai",
      release: {
        ...verified,
        indexPath: "/data/ai/v3/downloads/index.json",
        archivePath: "/data/ai/v3/downloads/runtime.tar.gz",
      },
    };
    vi.stubEnv("SNAPOTTER_SYSTEM_PYTHON", "/custom/system-python");

    expect(buildOcrRuntimeInstallerCommand(options).executable).toBe("/custom/system-python");
    expect(
      buildOcrRuntimeInstallerCommand({ ...options, pythonPath: "/explicit/system-python" })
        .executable,
    ).toBe("/explicit/system-python");
  });
});

describe("prepareOfflineRuntimeRelease", () => {
  it("classifies malformed signed-index bytes as import validation", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-offline-invalid-index-"));
    temporaryDirectories.push(directory);
    const indexPath = join(directory, "ocr-index.json");
    writeFileSync(indexPath, "not canonical JSON");

    await expect(
      prepareOfflineRuntimeIndex({
        indexPath,
        target: TARGET,
        trustKeys: [fixture.trustKey],
        version: "2.1.0",
      }),
    ).rejects.toBeInstanceOf(OcrRuntimeImportValidationError);
  });

  it("keeps invalid trust-key configuration out of import validation", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-offline-invalid-trust-"));
    temporaryDirectories.push(directory);
    const indexPath = join(directory, "ocr-index.json");
    writeFileSync(indexPath, fixture.raw);

    const rejection = prepareOfflineRuntimeIndex({
      indexPath,
      target: TARGET,
      trustKeys: [{ ...fixture.trustKey, publicKey: "not a public key" }],
      version: "2.1.0",
    });
    await expect(rejection).rejects.not.toBeInstanceOf(OcrRuntimeImportValidationError);
    await expect(rejection).rejects.toThrow(/trusted OCR runtime key.*invalid/i);
  });

  it("authenticates the signed index before any offline archive bytes are accepted", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-offline-index-"));
    temporaryDirectories.push(directory);
    const indexPath = join(directory, "ocr-index.json");
    writeFileSync(indexPath, fixture.raw);

    const verified = await prepareOfflineRuntimeIndex({
      indexPath,
      target: TARGET,
      trustKeys: [fixture.trustKey],
      version: "2.1.0",
    });

    expect(verified.archiveSize).toBe(ARCHIVE_BYTES.length);
    expect(verified.archiveExpandedSize).toBe(1_000);
    expect(verified.canonicalIndexBytes).toBe(fixture.raw.byteLength);
  });

  it("reserves signed archive, expansion, metadata, and index capacity before import", async () => {
    const required = ARCHIVE_BYTES.length + 1_000 + 16 * 1024 * 1024 + 1024 * 1024 + 777;
    const diskFreeBytes = vi.fn(async () => BigInt(required - 1));

    await expect(
      assertOcrRuntimeInstallDiskSpace({
        path: "/data/ai",
        remainingArchiveBytes: ARCHIVE_BYTES.length,
        expandedSize: 1_000,
        authenticatedIndexBytes: 777,
        operation: "import",
        diskFreeBytes,
      }),
    ).rejects.toThrow(`insufficient disk space before OCR runtime import: ${required} bytes`);
    expect(diskFreeBytes).toHaveBeenCalledWith("/data/ai");
  });

  it("authenticates both local files and selects the import transaction", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-offline-"));
    temporaryDirectories.push(directory);
    const indexPath = join(directory, "ocr-index.json");
    const archivePath = join(directory, "ocr.tar.gz");
    writeFileSync(indexPath, fixture.raw);
    writeFileSync(archivePath, ARCHIVE_BYTES);

    const release = await prepareOfflineRuntimeRelease({
      indexPath,
      archivePath,
      target: TARGET,
      trustKeys: [fixture.trustKey],
      version: "2.1.0",
    });
    const command = buildOcrRuntimeInstallerCommand({
      aiDataDir: directory,
      release,
      mode: "import",
      pythonPath: "/opt/venv/bin/python3",
      installerPath: "/app/install_runtime.py",
    });

    expect(command.args[1]).toBe("import");
    writeFileSync(archivePath, Buffer.from("tampered"));
    const rejection = prepareOfflineRuntimeRelease({
      indexPath,
      archivePath,
      target: TARGET,
      trustKeys: [fixture.trustKey],
      version: "2.1.0",
    });
    await expect(rejection).rejects.toBeInstanceOf(OcrRuntimeImportValidationError);
    await expect(rejection).rejects.toThrow("signed index");
  });

  it("rejects insufficient memory before reading or hashing the offline archive", async () => {
    const fixture = signedIndex();
    const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-offline-low-memory-"));
    temporaryDirectories.push(directory);
    const indexPath = join(directory, "index.json");
    const archivePath = join(directory, "ocr.tar.gz");
    writeFileSync(indexPath, fixture.raw);
    writeFileSync(archivePath, Buffer.from("deliberately does not match the signed archive"));

    await expect(
      prepareOfflineRuntimeRelease({
        indexPath,
        archivePath,
        target: TARGET,
        trustKeys: [fixture.trustKey],
        version: "2.1.0",
        memoryOptions: { effectiveMemoryBytes: 4 * 1024 ** 3 - 1 },
      }),
    ).rejects.toThrow("insufficient memory for accurate OCR runtime");
  });
});
