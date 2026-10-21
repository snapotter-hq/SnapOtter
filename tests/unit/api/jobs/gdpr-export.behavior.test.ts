import { SafeError } from "@snapotter/shared";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.hoisted(() => vi.fn());
const readStoredFileMock = vi.hoisted(() => vi.fn());
const isStorageServiceFaultMock = vi.hoisted(() => vi.fn<(_err: unknown) => boolean>(() => false));
const loggerWarnMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const putObjectMock = vi.hoisted(() => vi.fn());
const deletePrefixMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const registerCancelableMock = vi.hoisted(() => vi.fn(() => new AbortController()));
const unregisterCancelableMock = vi.hoisted(() => vi.fn());
const wasUserCanceledMock = vi.hoisted(() => vi.fn(() => false));
/** Every archive written through putObjectStream, drained to a buffer. */
const written = vi.hoisted(() => [] as Array<{ key: string; body: Buffer }>);
const putObjectStreamMock = vi.hoisted(() =>
  vi.fn(async (key: string, source: AsyncIterable<Buffer>, _opts?: { signal?: AbortSignal }) => {
    const chunks: Buffer[] = [];
    for await (const chunk of source) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    written.push({ key, body });
    return body.length;
  }),
);

/**
 * Stands in for a Drizzle query builder, including its projection behavior: when
 * `select()` is given a column map, only those keys come back. Without that, a
 * mock would hand every column to the caller regardless of what was selected, and
 * assertions like "the export omits passwordHash" would pass even if the query
 * asked for it.
 */
function queryChain<T>(result: T) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => {
      const callIndex = selectMock.mock.results.findIndex((r) => r.value === chain);
      const columns = callIndex >= 0 ? selectMock.mock.calls[callIndex]?.[0] : undefined;
      if (!columns || !Array.isArray(result)) return Promise.resolve(result);
      const keys = Object.keys(columns as Record<string, unknown>);
      return Promise.resolve(
        (result as Record<string, unknown>[]).map((row) =>
          Object.fromEntries(keys.map((k) => [k, row[k]])),
        ),
      );
    }),
  };
  return chain;
}

/**
 * Intercepts the export-deadline `AbortSignal.timeout(expectedMs)` call in
 * `gdprExportJob` and holds the deadline open until the test's target hang
 * point invokes `fireTimeout()`. Without this, a real 40ms timer armed at
 * job entry races `archiver("zip")` + `archive.finalize()` under CI CPU
 * load and can reject before execution reaches `readStoredFile` or
 * `putObjectStream` (#3082). Secondary timeouts (such as
 * `CLEANUP_TIMEOUT_MS`) still delegate to the real `AbortSignal.timeout`.
 */
function armExportTimeout(expectedMs: number) {
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  let controller: AbortController | undefined;
  const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    if (ms === expectedMs && !controller) {
      controller = new AbortController();
      return controller.signal;
    }
    return realTimeout(ms);
  });
  return {
    timeoutSpy,
    fireTimeout() {
      if (!controller) {
        throw new Error(
          `Expected AbortSignal.timeout(${expectedMs}) to have been called before fireTimeout()`,
        );
      }
      const target = controller;
      queueMicrotask(() => {
        target.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      });
    },
  };
}

async function loadGdprExport() {
  vi.resetModules();
  selectMock.mockReset();
  selectMock.mockImplementation(() => queryChain([{ id: "export-job", status: "queued" }]));
  readStoredFileMock.mockReset();
  isStorageServiceFaultMock.mockReset();
  isStorageServiceFaultMock.mockReturnValue(false);
  loggerWarnMock.mockReset();
  loggerErrorMock.mockReset();
  reportErrorMock.mockReset();
  putObjectMock.mockReset();
  deletePrefixMock.mockReset();
  deletePrefixMock.mockResolvedValue(undefined);
  registerCancelableMock.mockReset();
  registerCancelableMock.mockImplementation(() => new AbortController());
  unregisterCancelableMock.mockReset();
  wasUserCanceledMock.mockReset();
  wasUserCanceledMock.mockReturnValue(false);
  putObjectStreamMock.mockClear();
  written.length = 0;

  vi.doMock("drizzle-orm", () => ({
    eq: vi.fn(() => "eq"),
  }));

  vi.doMock("../../../../apps/api/src/db/index.js", () => ({
    db: {
      select: selectMock,
    },
    schema: {
      users: {
        id: "users.id",
        username: "users.username",
        role: "users.role",
        team: "users.team",
        email: "users.email",
        authProvider: "users.auth_provider",
        externalId: "users.external_id",
        scimExternalId: "users.scim_external_id",
        mustChangePassword: "users.must_change_password",
        legalHold: "users.legal_hold",
        storageUsed: "users.storage_used",
        storageQuota: "users.storage_quota",
        totpEnabled: "users.totp_enabled",
        createdAt: "users.created_at",
        updatedAt: "users.updated_at",
        // Credential material -- present on the table, never exportable.
        passwordHash: "users.password_hash",
        totpSecret: "users.totp_secret",
        recoveryCodesHash: "users.recovery_codes_hash",
      },
      userFiles: { userId: "userFiles.userId" },
      jobs: { id: "jobs.id", userId: "jobs.userId", status: "jobs.status" },
      auditLog: { actorId: "auditLog.actorId" },
    },
  }));

  vi.doMock("../../../../apps/api/src/jobs/cancel.js", () => ({
    registerCancelable: registerCancelableMock,
    unregisterCancelable: unregisterCancelableMock,
    wasUserCanceled: wasUserCanceledMock,
  }));

  const actualErrorReport = await vi.importActual<
    typeof import("../../../../apps/api/src/lib/error-report.js")
  >("../../../../apps/api/src/lib/error-report.js");

  vi.doMock("../../../../apps/api/src/lib/error-report.js", () => ({
    ...actualErrorReport,
    reportError: reportErrorMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/file-storage.js", () => ({
    readStoredFile: readStoredFileMock,
    isStorageServiceFault: isStorageServiceFaultMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({
    logger: {
      warn: loggerWarnMock,
      error: loggerErrorMock,
      info: vi.fn(),
      debug: vi.fn(),
    },
  }));

  const actualObjectStorage = await vi.importActual<
    typeof import("../../../../apps/api/src/lib/object-storage.js")
  >("../../../../apps/api/src/lib/object-storage.js");

  vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
    ...actualObjectStorage,
    deletePrefix: deletePrefixMock,
    putObject: putObjectMock,
    putObjectStream: putObjectStreamMock,
  }));

  return {
    ...(await import("../../../../apps/api/src/jobs/gdpr-export.js")),
    classifyError: actualErrorReport.classifyError,
  };
}

describe("GDPR export job behavior", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A subject-access export is handed to the data subject, a regulator, or outside
  // counsel, so it must never carry authentication material. Naming the columns keeps
  // totpSecret and recoveryCodesHash inside Postgres instead of relying on the caller
  // to subtract them, which also means a future column addition cannot silently leak.
  it("selects an explicit profile column list that omits every credential column", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    await gdprExportJob("user-1", "export-columns");

    const profileColumns = selectMock.mock.calls[0][0];
    expect(profileColumns, "profile select must name its columns rather than select *").toBeTypeOf(
      "object",
    );

    const selected = Object.keys(profileColumns as Record<string, unknown>);
    expect(selected).not.toContain("passwordHash");
    expect(selected).not.toContain("totpSecret");
    expect(selected).not.toContain("recoveryCodesHash");
    // Personal data the subject is genuinely owed still ships.
    expect(selected).toEqual(expect.arrayContaining(["id", "username", "email", "createdAt"]));
    // Both identifiers an IdP knows the subject by: the OIDC/SAML one and, since
    // #1510 gave it its own column, the SCIM one.
    expect(selected).toEqual(expect.arrayContaining(["externalId", "scimExternalId"]));
  });

  it("throws before writing output when the user does not exist", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock.mockReturnValueOnce(queryChain([]));

    await expect(gdprExportJob("missing-user", "job-1")).rejects.toThrow(
      "User missing-user not found",
    );

    expect(putObjectMock).not.toHaveBeenCalled();
    expect(putObjectStreamMock).not.toHaveBeenCalled();
    expect(unregisterCancelableMock).toHaveBeenCalledWith("job-1");
  });

  it("bails out without throwing when the user and export job row were purged before the profile query (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock.mockReturnValueOnce(queryChain([])).mockReturnValueOnce(queryChain([]));

    await expect(gdprExportJob("purged-user", "export-purged-early")).resolves.toEqual({
      outputRef: null,
    });

    expect(putObjectStreamMock).not.toHaveBeenCalled();
    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-purged-early/");
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-purged-early");
  });

  // #1441: stranded-job reconciliation adopts a non-empty file in
  // outputs/<jobId>/ as the finished export. putObject on the local backend
  // writes straight to the final path, so a write that dies partway (ENOSPC,
  // a kill) would leave a truncated archive there to be served as complete.
  // putObjectStream stages under .snapotter-staging/ and renames, and the
  // reconciler never lists that subdirectory.
  it("writes the archive through the staged, atomic stream write", async () => {
    const { gdprExportJob } = await loadGdprExport();
    const ac = new AbortController();
    registerCancelableMock.mockReturnValueOnce(ac);
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    await gdprExportJob("user-1", "export-atomic");

    expect(putObjectMock, "the direct, non-atomic write must not be used").not.toHaveBeenCalled();
    expect(putObjectStreamMock).toHaveBeenCalledTimes(1);
    expect(putObjectStreamMock.mock.calls[0][0]).toBe("outputs/export-atomic/gdpr-export.zip");
    expect(putObjectStreamMock.mock.calls[0][2]).toEqual({ signal: ac.signal });
    expect(new AdmZip(written[0].body).getEntry("profile.json")).not.toBeNull();
  });

  it("writes a ZIP without passwordHash and skips missing library file contents", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(
        queryChain([
          {
            id: "user-1",
            email: "ada@example.test",
            passwordHash: "do-not-export",
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(
        queryChain([
          {
            id: "file-1",
            userId: "user-1",
            storedName: "stored/a",
            originalName: "a.txt",
            createdAt: new Date("2026-06-02T00:00:00.000Z"),
          },
          {
            id: "file-2",
            userId: "user-1",
            storedName: "stored/missing",
            originalName: "missing.txt",
            createdAt: new Date("2026-06-03T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(
        queryChain([
          {
            id: "job-a",
            userId: "user-1",
            createdAt: new Date("2026-06-04T00:00:00.000Z"),
            startedAt: null,
            completedAt: new Date("2026-06-04T00:01:00.000Z"),
            deleteAfter: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        queryChain([
          {
            id: "audit-1",
            actorId: "user-1",
            action: "LOGIN",
            createdAt: new Date("2026-06-05T00:00:00.000Z"),
          },
        ]),
      );
    readStoredFileMock.mockResolvedValueOnce(Buffer.from("file contents")).mockRejectedValueOnce(
      Object.assign(new Error("ENOENT: no such file or directory, open 'stored/missing'"), {
        code: "ENOENT",
        syscall: "open",
      }),
    );

    await expect(gdprExportJob("user-1", "export-job")).resolves.toEqual({
      outputRef: "outputs/export-job/gdpr-export.zip",
    });

    expect(written).toHaveLength(1);
    const { key: outputRef, body: zipBuffer } = written[0];
    expect(outputRef).toBe("outputs/export-job/gdpr-export.zip");

    const zip = new AdmZip(zipBuffer);
    const profile = JSON.parse(zip.readAsText("profile.json"));
    const files = JSON.parse(zip.readAsText("files.json"));
    const jobs = JSON.parse(zip.readAsText("jobs.json"));
    const audit = JSON.parse(zip.readAsText("audit-log.json"));

    expect(profile).toMatchObject({ id: "user-1", email: "ada@example.test" });
    expect(profile).not.toHaveProperty("passwordHash");
    expect(files[0].createdAt).toBe("2026-06-02T00:00:00.000Z");
    expect(jobs[0].completedAt).toBe("2026-06-04T00:01:00.000Z");
    expect(audit[0].createdAt).toBe("2026-06-05T00:00:00.000Z");
    expect(zip.readAsText("library-files/file-1_a.txt")).toBe("file contents");
    expect(zip.getEntry("library-files/file-2_missing.txt")).toBeNull();
    expect(JSON.parse(zip.readAsText("missing-files.json"))).toEqual([
      {
        id: "file-2",
        originalName: "missing.txt",
        storedName: "stored/missing",
      },
    ]);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      {
        jobId: "export-job",
        userId: "user-1",
        fileId: "file-2",
        storedName: "stored/missing",
      },
      "gdpr export: stored library blob missing, skipping",
    );
  });

  it("normalizes S3 storage service faults mid-archive into a 503 storage-unavailable SafeError without writing a partial ZIP (#3306)", async () => {
    const { gdprExportJob, classifyError } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(
        queryChain([
          {
            id: "file-1",
            userId: "user-1",
            storedName: "a.png",
            originalName: "a.png",
            createdAt: new Date("2026-06-02T00:00:00.000Z"),
          },
          {
            id: "file-2",
            userId: "user-1",
            storedName: "b.png",
            originalName: "b.png",
            createdAt: new Date("2026-06-03T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    const s3Fault = Object.assign(new Error("AccessDenied"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    readStoredFileMock
      .mockResolvedValueOnce(Buffer.from("first file bytes"))
      .mockRejectedValueOnce(s3Fault);
    isStorageServiceFaultMock.mockImplementation((err: unknown) => err === s3Fault);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    let caught: unknown;
    try {
      caught = await gdprExportJob("user-1", "export-s3-fault").catch((err: unknown) => err);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(caught).toMatchObject({
      name: "SafeError",
      isSafeMessage: true,
      kind: "operational",
      code: "storage-unavailable",
      statusCode: 503,
      message: "The server's storage service is unavailable.",
      cause: s3Fault,
    });
    expect(classifyError(caught, "worker")).toBe("operational");
    expect(unhandled).toEqual([]);
    expect(putObjectStreamMock).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it.each([
    ["EACCES", "open"],
    ["ERR_FS_FILE_TOO_LARGE", undefined],
  ])(
    "rethrows local filesystem fault %s (syscall=%s) without writing a partial ZIP",
    async (code, syscall) => {
      const { gdprExportJob } = await loadGdprExport();
      selectMock
        .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
        .mockReturnValueOnce(
          queryChain([
            {
              id: "file-1",
              userId: "user-1",
              storedName: "a.png",
              originalName: "a.png",
              createdAt: new Date("2026-06-02T00:00:00.000Z"),
            },
          ]),
        )
        .mockReturnValueOnce(queryChain([]))
        .mockReturnValueOnce(queryChain([]));

      const localFault = Object.assign(new Error(`${code}: local read failed`), {
        code,
        syscall,
      });
      readStoredFileMock.mockRejectedValueOnce(localFault);

      await expect(gdprExportJob("user-1", `export-local-${code}`)).rejects.toBe(localFault);
      expect(putObjectStreamMock).not.toHaveBeenCalled();
      expect(written).toHaveLength(0);
      expect(loggerWarnMock).not.toHaveBeenCalled();
    },
  );

  it("skips a poisoned stored_name (INVALID_STORED_NAME SafeError) with a warning and manifest entry", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(
        queryChain([
          {
            id: "file-poison",
            userId: "user-1",
            storedName: "../../etc/passwd",
            originalName: "imported.bin",
            createdAt: new Date("2026-06-02T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    const invalidName = new SafeError("Invalid stored file name", {
      kind: "operational",
      code: "INVALID_STORED_NAME",
      statusCode: 400,
    });
    readStoredFileMock.mockRejectedValueOnce(invalidName);

    await expect(gdprExportJob("user-1", "export-poisoned")).resolves.toEqual({
      outputRef: "outputs/export-poisoned/gdpr-export.zip",
    });

    expect(loggerWarnMock).toHaveBeenCalledWith(
      {
        jobId: "export-poisoned",
        userId: "user-1",
        fileId: "file-poison",
        storedName: "../../etc/passwd",
      },
      "gdpr export: stored library blob missing, skipping",
    );
    const zip = new AdmZip(written[0].body);
    expect(zip.getEntry("library-files/file-poison_imported.bin")).toBeNull();
    expect(JSON.parse(zip.readAsText("missing-files.json"))).toEqual([
      {
        id: "file-poison",
        originalName: "imported.bin",
        storedName: "../../etc/passwd",
      },
    ]);
  });

  it("serializes null/undefined date fields as null across every export section", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(
        queryChain([
          {
            id: "user-2",
            email: "grace@example.test",
            passwordHash: "secret",
            createdAt: new Date("2026-06-10T00:00:00.000Z"),
          },
        ]),
      )
      // File with a null createdAt exercises the falsy side of f.createdAt?.
      .mockReturnValueOnce(
        queryChain([
          {
            id: "file-9",
            userId: "user-2",
            storedName: "stored/x",
            originalName: "x.bin",
            createdAt: null,
          },
        ]),
      )
      // Job where createdAt and completedAt are null (the two date branches the
      // first test left truthy), startedAt/deleteAfter undefined.
      .mockReturnValueOnce(
        queryChain([
          {
            id: "job-b",
            userId: "user-2",
            createdAt: null,
            startedAt: undefined,
            completedAt: null,
            deleteAfter: undefined,
          },
        ]),
      )
      // Audit entry with a null createdAt exercises the falsy side of a.createdAt?.
      .mockReturnValueOnce(
        queryChain([
          {
            id: "audit-9",
            actorId: "user-2",
            action: "EXPORT",
            createdAt: null,
          },
        ]),
      );
    // Stored file read succeeds so the library-copy append path still runs.
    readStoredFileMock.mockResolvedValueOnce(Buffer.from("bin"));

    await expect(gdprExportJob("user-2", "export-null")).resolves.toEqual({
      outputRef: "outputs/export-null/gdpr-export.zip",
    });

    expect(written).toHaveLength(1);
    const zip = new AdmZip(written[0].body);

    const files = JSON.parse(zip.readAsText("files.json"));
    const jobs = JSON.parse(zip.readAsText("jobs.json"));
    const audit = JSON.parse(zip.readAsText("audit-log.json"));

    // A null date passes through `?.toISOString()` as undefined, so JSON.stringify
    // drops the key entirely rather than serializing it as null.
    expect(files[0]).not.toHaveProperty("createdAt");
    expect(jobs[0]).not.toHaveProperty("createdAt");
    expect(jobs[0]).not.toHaveProperty("completedAt");
    expect(jobs[0]).not.toHaveProperty("startedAt");
    expect(jobs[0]).not.toHaveProperty("deleteAfter");
    expect(audit[0]).not.toHaveProperty("createdAt");
    expect(zip.readAsText("library-files/file-9_x.bin")).toBe("bin");
    expect(zip.getEntry("missing-files.json")).toBeNull();
  });

  it("produces empty JSON collections when the user has no files, jobs, or audit entries", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(
        queryChain([
          {
            id: "user-3",
            email: "empty@example.test",
            passwordHash: "secret",
            createdAt: new Date("2026-06-20T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    await expect(gdprExportJob("user-3", "export-empty")).resolves.toEqual({
      outputRef: "outputs/export-empty/gdpr-export.zip",
    });

    // With no files, the library-copy loop never runs, so readStoredFile is untouched.
    expect(readStoredFileMock).not.toHaveBeenCalled();
    expect(written).toHaveLength(1);

    const zip = new AdmZip(written[0].body);
    expect(JSON.parse(zip.readAsText("files.json"))).toEqual([]);
    expect(JSON.parse(zip.readAsText("jobs.json"))).toEqual([]);
    expect(JSON.parse(zip.readAsText("audit-log.json"))).toEqual([]);
    expect(zip.getEntry("missing-files.json")).toBeNull();
    const profile = JSON.parse(zip.readAsText("profile.json"));
    expect(profile).toMatchObject({ id: "user-3", email: "empty@example.test" });
    expect(profile).not.toHaveProperty("passwordHash");
  });

  it("bails out before writing when the export job row was deleted by a concurrent purge (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    await expect(gdprExportJob("user-1", "export-purged")).resolves.toEqual({
      outputRef: null,
    });

    expect(putObjectStreamMock).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-purged/");
    expect(registerCancelableMock).toHaveBeenCalledWith("export-purged");
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-purged");
  });

  it("bails out before writing when the export job row was canceled (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([{ id: "export-canceled", status: "canceled" }]));

    await expect(gdprExportJob("user-1", "export-canceled")).resolves.toEqual({
      outputRef: null,
    });

    expect(putObjectStreamMock).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-canceled/");
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-canceled");
  });

  it("removes the archive if the export job row was deleted while putObjectStream was writing (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([{ id: "export-raced", status: "queued" }]))
      .mockReturnValueOnce(queryChain([]));

    await expect(gdprExportJob("user-1", "export-raced")).resolves.toEqual({
      outputRef: null,
    });

    expect(putObjectStreamMock).toHaveBeenCalledTimes(1);
    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-raced/");
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-raced");
  });

  it("removes the archive if the export job row was marked canceled while putObjectStream was writing (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([{ id: "export-raced-cancel", status: "processing" }]))
      .mockReturnValueOnce(queryChain([{ id: "export-raced-cancel", status: "canceled" }]));

    await expect(gdprExportJob("user-1", "export-raced-cancel")).resolves.toEqual({
      outputRef: null,
    });

    expect(putObjectStreamMock).toHaveBeenCalledTimes(1);
    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-raced-cancel/");
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-raced-cancel");
  });

  it("removes the written archive and rethrows if the post-write liveness query faults (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    const dbFault = new Error("connection terminated unexpectedly");
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([{ id: "export-db-fault", status: "processing" }]))
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(dbFault),
      });

    await expect(gdprExportJob("user-1", "export-db-fault")).rejects.toBe(dbFault);

    expect(putObjectStreamMock).toHaveBeenCalledTimes(1);
    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-db-fault/");
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-db-fault");
  });

  it("bails out without logging a missing-blob warning when a concurrent purge deleted library files and canceled the job (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(
        queryChain([
          {
            id: "file-1",
            userId: "user-1",
            storedName: "stored/purged",
            originalName: "purged.txt",
            createdAt: new Date("2026-06-02T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([{ id: "export-purged-midloop", status: "canceled" }]));

    readStoredFileMock.mockRejectedValueOnce(
      Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT", syscall: "open" }),
    );

    await expect(gdprExportJob("user-1", "export-purged-midloop")).resolves.toEqual({
      outputRef: null,
    });

    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(putObjectStreamMock).not.toHaveBeenCalled();
    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-purged-midloop/");
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-purged-midloop");
  });

  it("stops copying library files and skips writing when the cancel signal fires (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    const ac = new AbortController();
    registerCancelableMock.mockReturnValueOnce(ac);

    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(
        queryChain([
          {
            id: "file-1",
            userId: "user-1",
            storedName: "stored/a",
            originalName: "a.txt",
            createdAt: new Date("2026-06-02T00:00:00.000Z"),
          },
          {
            id: "file-2",
            userId: "user-1",
            storedName: "stored/b",
            originalName: "b.txt",
            createdAt: new Date("2026-06-03T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    readStoredFileMock.mockImplementationOnce(async () => {
      ac.abort();
      return Buffer.from("first file");
    });

    await expect(gdprExportJob("user-1", "export-aborted")).resolves.toEqual({
      outputRef: null,
    });

    expect(readStoredFileMock).toHaveBeenCalledTimes(1);
    expect(putObjectStreamMock).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-aborted");
  });

  it("skips reading any library file when the cancel signal fires before the copy loop (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    const ac = new AbortController();
    ac.abort();
    registerCancelableMock.mockReturnValueOnce(ac);

    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(
        queryChain([
          {
            id: "file-1",
            userId: "user-1",
            storedName: "stored/a",
            originalName: "a.txt",
            createdAt: new Date("2026-06-02T00:00:00.000Z"),
          },
        ]),
      )
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    await expect(gdprExportJob("user-1", "export-pre-aborted")).resolves.toEqual({
      outputRef: null,
    });

    expect(readStoredFileMock).not.toHaveBeenCalled();
    expect(putObjectStreamMock).not.toHaveBeenCalled();
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-pre-aborted");
  });

  it("cleans up outputs and returns null when putObjectStream aborts on the cancel signal (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    const ac = new AbortController();
    registerCancelableMock.mockReturnValueOnce(ac);

    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([{ id: "export-stream-abort", status: "queued" }]));

    putObjectStreamMock.mockImplementationOnce(async () => {
      ac.abort();
      throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    });

    await expect(gdprExportJob("user-1", "export-stream-abort")).resolves.toEqual({
      outputRef: null,
    });

    expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-stream-abort/");
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-stream-abort");
  });

  it("bails out before writing when the cancel signal fires during the pre-write liveness check (#1496)", async () => {
    const { gdprExportJob } = await loadGdprExport();
    const ac = new AbortController();
    registerCancelableMock.mockReturnValueOnce(ac);

    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockImplementationOnce(() => {
        ac.abort();
        return queryChain([{ id: "export-signal-during-check", status: "processing" }]);
      });

    await expect(gdprExportJob("user-1", "export-signal-during-check")).resolves.toEqual({
      outputRef: null,
    });

    expect(putObjectStreamMock).not.toHaveBeenCalled();
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-signal-during-check");
  });

  it("rethrows non-cancel putObjectStream errors", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock
      .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([{ id: "export-write-err", status: "queued" }]));

    const writeErr = new Error("ENOSPC: disk full");
    putObjectStreamMock.mockRejectedValueOnce(writeErr);

    await expect(gdprExportJob("user-1", "export-write-err")).rejects.toBe(writeErr);
    expect(deletePrefixMock).not.toHaveBeenCalled();
    expect(unregisterCancelableMock).toHaveBeenCalledWith("export-write-err");
  });

  describe("export timeout deadline (#1497)", () => {
    it("passes an AbortSignal to readStoredFile for each library file", async () => {
      const { gdprExportJob } = await loadGdprExport();
      selectMock
        .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
        .mockReturnValueOnce(
          queryChain([
            {
              id: "file-1",
              userId: "user-1",
              storedName: "stored/a",
              originalName: "a.txt",
              createdAt: new Date("2026-06-02T00:00:00.000Z"),
            },
          ]),
        )
        .mockReturnValueOnce(queryChain([]))
        .mockReturnValueOnce(queryChain([]));
      readStoredFileMock.mockResolvedValueOnce(Buffer.from("hello"));

      await gdprExportJob("user-1", "export-signal-arg");

      expect(readStoredFileMock).toHaveBeenCalledWith("stored/a", {
        signal: expect.any(AbortSignal),
      });
    });

    it("aborts a hung library file read and fails the export when GDPR_EXPORT_TIMEOUT_MS fires", async () => {
      const { gdprExportJob } = await loadGdprExport();
      const { env } = await import("../../../../apps/api/src/config.js");
      const prevTimeout = env.GDPR_EXPORT_TIMEOUT_MS;
      env.GDPR_EXPORT_TIMEOUT_MS = 40;
      const { timeoutSpy, fireTimeout } = armExportTimeout(40);
      try {
        selectMock
          .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
          .mockReturnValueOnce(
            queryChain([
              {
                id: "file-1",
                userId: "user-1",
                storedName: "stored/hung",
                originalName: "hung.png",
                createdAt: new Date("2026-06-02T00:00:00.000Z"),
              },
            ]),
          )
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]));

        let readSignal: AbortSignal | undefined;
        readStoredFileMock.mockImplementationOnce(
          (_name: string, opts?: { signal?: AbortSignal }) => {
            readSignal = opts?.signal;
            fireTimeout();
            // Simulate a read that never resolves on its own.
            return new Promise<Buffer>(() => {});
          },
        );

        await expect(gdprExportJob("user-1", "export-hung-read")).rejects.toMatchObject({
          name: "TimeoutError",
          code: "ETIMEDOUT",
          message: expect.stringContaining("GDPR export timed out after 40ms"),
        });

        expect(timeoutSpy).toHaveBeenCalledWith(40);
        expect(readSignal).toBeInstanceOf(AbortSignal);
        expect(readSignal?.aborted).toBe(true);
        expect(putObjectStreamMock).not.toHaveBeenCalled();
        expect(loggerWarnMock).not.toHaveBeenCalled();
        expect(unregisterCancelableMock).toHaveBeenCalledWith("export-hung-read");
      } finally {
        timeoutSpy.mockRestore();
        env.GDPR_EXPORT_TIMEOUT_MS = prevTimeout;
      }
    });

    it("cleans up outputs and fails (rather than returning null as canceled) when the timeout fires during putObjectStream", async () => {
      const { gdprExportJob } = await loadGdprExport();
      const { env } = await import("../../../../apps/api/src/config.js");
      const prevTimeout = env.GDPR_EXPORT_TIMEOUT_MS;
      env.GDPR_EXPORT_TIMEOUT_MS = 40;
      const { timeoutSpy, fireTimeout } = armExportTimeout(40);
      try {
        selectMock
          .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([{ id: "export-hung-write", status: "processing" }]));

        putObjectStreamMock.mockImplementationOnce(
          (_key: string, _source: AsyncIterable<Buffer>, opts?: { signal?: AbortSignal }) => {
            fireTimeout();
            return new Promise<number>((_resolve, reject) => {
              opts?.signal?.addEventListener(
                "abort",
                () => {
                  reject(
                    Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
                  );
                },
                { once: true },
              );
            });
          },
        );

        await expect(gdprExportJob("user-1", "export-hung-write")).rejects.toMatchObject({
          name: "TimeoutError",
          code: "ETIMEDOUT",
          message: expect.stringContaining("GDPR export timed out after 40ms"),
        });

        expect(timeoutSpy).toHaveBeenCalledWith(40);
        expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-hung-write/");
        expect(unregisterCancelableMock).toHaveBeenCalledWith("export-hung-write");
      } finally {
        timeoutSpy.mockRestore();
        env.GDPR_EXPORT_TIMEOUT_MS = prevTimeout;
      }
    });

    it("treats GDPR_EXPORT_TIMEOUT_MS=0 as unlimited", async () => {
      const { gdprExportJob } = await loadGdprExport();
      const { env } = await import("../../../../apps/api/src/config.js");
      const prevTimeout = env.GDPR_EXPORT_TIMEOUT_MS;
      env.GDPR_EXPORT_TIMEOUT_MS = 0;
      try {
        const ac = new AbortController();
        registerCancelableMock.mockReturnValueOnce(ac);
        selectMock
          .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
          .mockReturnValueOnce(
            queryChain([
              {
                id: "file-1",
                userId: "user-1",
                storedName: "stored/a",
                originalName: "a.txt",
                createdAt: new Date("2026-06-02T00:00:00.000Z"),
              },
            ]),
          )
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]));
        readStoredFileMock.mockResolvedValueOnce(Buffer.from("ok"));

        await expect(gdprExportJob("user-1", "export-unlimited")).resolves.toEqual({
          outputRef: "outputs/export-unlimited/gdpr-export.zip",
        });

        expect(readStoredFileMock).toHaveBeenCalledWith("stored/a", { signal: ac.signal });
      } finally {
        env.GDPR_EXPORT_TIMEOUT_MS = prevTimeout;
      }
    });

    it("fails with TimeoutError when an initial metadata query hangs past GDPR_EXPORT_TIMEOUT_MS", async () => {
      const { gdprExportJob } = await loadGdprExport();
      const { env } = await import("../../../../apps/api/src/config.js");
      const prevTimeout = env.GDPR_EXPORT_TIMEOUT_MS;
      env.GDPR_EXPORT_TIMEOUT_MS = 40;
      try {
        selectMock.mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn(() => new Promise(() => {})),
        });

        await expect(gdprExportJob("user-1", "export-hung-db")).rejects.toMatchObject({
          name: "TimeoutError",
          code: "ETIMEDOUT",
          message: expect.stringContaining("GDPR export timed out after 40ms"),
        });
        expect(unregisterCancelableMock).toHaveBeenCalledWith("export-hung-db");
      } finally {
        env.GDPR_EXPORT_TIMEOUT_MS = prevTimeout;
      }
    });

    it("cleans up outputs and throws TimeoutError if the deadline fires during the post-write liveness check", async () => {
      const { gdprExportJob } = await loadGdprExport();
      const { env } = await import("../../../../apps/api/src/config.js");
      const prevTimeout = env.GDPR_EXPORT_TIMEOUT_MS;
      env.GDPR_EXPORT_TIMEOUT_MS = 40;
      const { timeoutSpy, fireTimeout } = armExportTimeout(40);
      try {
        selectMock
          .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([{ id: "export-post-write-timeout", status: "queued" }]))
          .mockReturnValueOnce({
            from: vi.fn().mockReturnThis(),
            where: vi.fn(() => {
              fireTimeout();
              return new Promise(() => {});
            }),
          });

        await expect(gdprExportJob("user-1", "export-post-write-timeout")).rejects.toMatchObject({
          name: "TimeoutError",
          code: "ETIMEDOUT",
        });

        expect(timeoutSpy).toHaveBeenCalledWith(40);
        expect(putObjectStreamMock).toHaveBeenCalledTimes(1);
        expect(deletePrefixMock).toHaveBeenCalledWith("outputs/export-post-write-timeout/");
        expect(unregisterCancelableMock).toHaveBeenCalledWith("export-post-write-timeout");
      } finally {
        timeoutSpy.mockRestore();
        env.GDPR_EXPORT_TIMEOUT_MS = prevTimeout;
      }
    });

    it("returns null (canceled) rather than TimeoutError when a user cancel arrives after the deadline fired", async () => {
      const { gdprExportJob } = await loadGdprExport();
      const { env } = await import("../../../../apps/api/src/config.js");
      const prevTimeout = env.GDPR_EXPORT_TIMEOUT_MS;
      env.GDPR_EXPORT_TIMEOUT_MS = 40;
      const { timeoutSpy, fireTimeout } = armExportTimeout(40);
      try {
        selectMock
          .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
          .mockReturnValueOnce(
            queryChain([
              {
                id: "file-1",
                userId: "user-1",
                storedName: "stored/a",
                originalName: "a.png",
                createdAt: new Date("2026-06-02T00:00:00.000Z"),
              },
            ]),
          )
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]));

        readStoredFileMock.mockImplementationOnce(
          (_name: string, opts?: { signal?: AbortSignal }) => {
            fireTimeout();
            return new Promise<Buffer>((_resolve, reject) => {
              opts?.signal?.addEventListener(
                "abort",
                () => {
                  wasUserCanceledMock.mockReturnValue(true);
                  reject(
                    Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
                  );
                },
                { once: true },
              );
            });
          },
        );

        await expect(gdprExportJob("user-1", "export-cancel-wins")).resolves.toEqual({
          outputRef: null,
        });
        expect(timeoutSpy).toHaveBeenCalledWith(40);
        expect(putObjectStreamMock).not.toHaveBeenCalled();
      } finally {
        timeoutSpy.mockRestore();
        env.GDPR_EXPORT_TIMEOUT_MS = prevTimeout;
      }
    });

    it("logs and reports when deletePrefix fails during timeout cleanup and still throws TimeoutError", async () => {
      const { gdprExportJob } = await loadGdprExport();
      const { env } = await import("../../../../apps/api/src/config.js");
      const prevTimeout = env.GDPR_EXPORT_TIMEOUT_MS;
      env.GDPR_EXPORT_TIMEOUT_MS = 40;
      const { timeoutSpy, fireTimeout } = armExportTimeout(40);
      try {
        selectMock
          .mockReturnValueOnce(queryChain([{ id: "user-1", email: "ada@example.test" }]))
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([{ id: "export-cleanup-fault", status: "processing" }]));

        const cleanupFault = new Error("S3 cleanup failed");
        deletePrefixMock.mockRejectedValueOnce(cleanupFault);
        putObjectStreamMock.mockImplementationOnce(() => {
          fireTimeout();
          return new Promise<number>(() => {});
        });

        await expect(gdprExportJob("user-1", "export-cleanup-fault")).rejects.toMatchObject({
          name: "TimeoutError",
          code: "ETIMEDOUT",
        });

        expect(timeoutSpy).toHaveBeenCalledWith(40);
        expect(loggerErrorMock).toHaveBeenCalledWith(
          expect.objectContaining({
            err: cleanupFault,
            jobId: "export-cleanup-fault",
            userId: "user-1",
            prefix: "outputs/export-cleanup-fault/",
          }),
          "gdpr export: failed to clean up outputs after abort or fault",
        );
        expect(reportErrorMock).toHaveBeenCalledWith(
          cleanupFault,
          expect.objectContaining({
            source: "worker",
            pool: "system",
            toolId: "gdpr-export",
            jobId: "export-cleanup-fault",
          }),
        );
      } finally {
        timeoutSpy.mockRestore();
        env.GDPR_EXPORT_TIMEOUT_MS = prevTimeout;
      }
    });
  });

  describe("with real file-storage S3 classification (#975)", () => {
    async function loadGdprExportWithRealFileStorage() {
      vi.resetModules();
      selectMock.mockReset();
      selectMock.mockImplementation(() => queryChain([{ id: "export-job", status: "queued" }]));
      loggerWarnMock.mockReset();
      putObjectMock.mockReset();
      deletePrefixMock.mockReset();
      deletePrefixMock.mockResolvedValue(undefined);
      registerCancelableMock.mockReset();
      registerCancelableMock.mockImplementation(() => new AbortController());
      unregisterCancelableMock.mockReset();
      putObjectStreamMock.mockClear();
      written.length = 0;

      vi.doMock("drizzle-orm", () => ({
        eq: vi.fn(() => "eq"),
      }));

      vi.doMock("../../../../apps/api/src/db/index.js", () => ({
        db: { select: selectMock },
        schema: {
          users: {
            id: "users.id",
            username: "users.username",
            role: "users.role",
            team: "users.team",
            email: "users.email",
            authProvider: "users.auth_provider",
            externalId: "users.external_id",
            scimExternalId: "users.scim_external_id",
            mustChangePassword: "users.must_change_password",
            legalHold: "users.legal_hold",
            storageUsed: "users.storage_used",
            storageQuota: "users.storage_quota",
            totpEnabled: "users.totp_enabled",
            createdAt: "users.created_at",
            updatedAt: "users.updated_at",
          },
          userFiles: { userId: "userFiles.userId" },
          jobs: { id: "jobs.id", userId: "jobs.userId", status: "jobs.status" },
          auditLog: { actorId: "auditLog.actorId" },
        },
      }));

      vi.doMock("../../../../apps/api/src/jobs/cancel.js", () => ({
        registerCancelable: registerCancelableMock,
        unregisterCancelable: unregisterCancelableMock,
        wasUserCanceled: wasUserCanceledMock,
      }));

      vi.doUnmock("../../../../apps/api/src/lib/file-storage.js");

      vi.doMock("../../../../apps/api/src/lib/logger.js", () => ({
        logger: {
          warn: loggerWarnMock,
          error: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
        },
      }));

      const actualObjectStorage = await vi.importActual<
        typeof import("../../../../apps/api/src/lib/object-storage.js")
      >("../../../../apps/api/src/lib/object-storage.js");

      vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
        ...actualObjectStorage,
        deletePrefix: deletePrefixMock,
        putObject: putObjectMock,
        putObjectStream: putObjectStreamMock,
      }));

      const { classifyError } = await vi.importActual<
        typeof import("../../../../apps/api/src/lib/error-report.js")
      >("../../../../apps/api/src/lib/error-report.js");

      const { friendlyError } = await vi.importActual<
        typeof import("../../../../apps/api/src/lib/errors.js")
      >("../../../../apps/api/src/lib/errors.js");

      const { env } = await import("../../../../apps/api/src/config.js");
      (env as Record<string, unknown>).STORAGE_MODE = "s3";

      const { loadS3Storage } = await import("@snapotter/enterprise");
      const s3 = await loadS3Storage();
      const getObjectSpy = vi.spyOn(s3, "getObject");

      const { gdprExportJob } = await import("../../../../apps/api/src/jobs/gdpr-export.js");
      return { env, getObjectSpy, gdprExportJob, classifyError, friendlyError };
    }

    it("skips S3 NoSuchKey and poisoned stored_name while exporting valid blobs", async () => {
      const { env, getObjectSpy, gdprExportJob } = await loadGdprExportWithRealFileStorage();
      try {
        selectMock
          .mockReturnValueOnce(queryChain([{ id: "user-s3", email: "s3@example.test" }]))
          .mockReturnValueOnce(
            queryChain([
              // Put the traversal name first so assertSafeStoredName throws SafeError
              // before getS3() initializes the lazy s3Mod singleton.
              {
                id: "file-traversal",
                userId: "user-s3",
                storedName: "../outside.png",
                originalName: "legacy.png",
                createdAt: new Date("2026-06-01T00:00:00.000Z"),
              },
              {
                id: "file-ok",
                userId: "user-s3",
                storedName: "11111111-1111-1111-1111-111111111111.png",
                originalName: "ok.png",
                createdAt: new Date("2026-06-02T00:00:00.000Z"),
              },
              {
                id: "file-gone",
                userId: "user-s3",
                storedName: "22222222-2222-2222-2222-222222222222.png",
                originalName: "gone.png",
                createdAt: new Date("2026-06-03T00:00:00.000Z"),
              },
            ]),
          )
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]));

        getObjectSpy.mockResolvedValueOnce(Buffer.from("s3-png-bytes")).mockRejectedValueOnce(
          Object.assign(new Error("NoSuchKey"), {
            name: "NoSuchKey",
            $metadata: { httpStatusCode: 404 },
          }),
        );

        await expect(gdprExportJob("user-s3", "export-s3-skip")).resolves.toEqual({
          outputRef: "outputs/export-s3-skip/gdpr-export.zip",
        });

        expect(getObjectSpy).toHaveBeenCalledTimes(2);
        expect(written).toHaveLength(1);
        const zip = new AdmZip(written[0].body);
        expect(zip.readAsText("library-files/file-ok_ok.png")).toBe("s3-png-bytes");
        expect(zip.getEntry("library-files/file-gone_gone.png")).toBeNull();
        expect(zip.getEntry("library-files/file-traversal_legacy.png")).toBeNull();
        expect(JSON.parse(zip.readAsText("missing-files.json"))).toEqual([
          {
            id: "file-traversal",
            originalName: "legacy.png",
            storedName: "../outside.png",
          },
          {
            id: "file-gone",
            originalName: "gone.png",
            storedName: "22222222-2222-2222-2222-222222222222.png",
          },
        ]);
        expect(loggerWarnMock).toHaveBeenCalledTimes(2);
      } finally {
        (env as Record<string, unknown>).STORAGE_MODE = "local";
      }
    });

    it.each([
      ["AccessDenied", 403],
      ["SlowDown", 503],
      ["NoSuchBucket", 404],
      ["InternalError", 500],
      ["TimeoutError", undefined],
      ["TimeoutError", 404],
    ])(
      "fails the export with a normalized 503 storage-unavailable SafeError when S3 rejects getObject with %s (HTTP %s) (#3306)",
      async (name, httpStatusCode) => {
        const { env, getObjectSpy, gdprExportJob, classifyError, friendlyError } =
          await loadGdprExportWithRealFileStorage();
        try {
          selectMock
            .mockReturnValueOnce(queryChain([{ id: "user-s3", email: "s3@example.test" }]))
            .mockReturnValueOnce(
              queryChain([
                {
                  id: "file-1",
                  userId: "user-s3",
                  storedName: "11111111-1111-1111-1111-111111111111.png",
                  originalName: "one.png",
                  createdAt: new Date("2026-06-02T00:00:00.000Z"),
                },
              ]),
            )
            .mockReturnValueOnce(queryChain([]))
            .mockReturnValueOnce(queryChain([]));

          const sdkFault = Object.assign(new Error(name), {
            name,
            $metadata: { httpStatusCode },
          });
          getObjectSpy.mockRejectedValueOnce(sdkFault);

          const caught = await gdprExportJob("user-s3", `export-s3-${name}`).catch(
            (err: unknown) => err,
          );
          expect(caught).toMatchObject({
            name: "SafeError",
            isSafeMessage: true,
            kind: "operational",
            code: "storage-unavailable",
            statusCode: 503,
            message: "The server's storage service is unavailable.",
            cause: sdkFault,
          });
          expect(classifyError(caught, "worker")).toBe("operational");
          expect(friendlyError((caught as Error).message)).toBe(
            "The server's storage service is unavailable.",
          );
          expect(putObjectStreamMock).not.toHaveBeenCalled();
          expect(written).toHaveLength(0);
          expect(loggerWarnMock).not.toHaveBeenCalled();
        } finally {
          (env as Record<string, unknown>).STORAGE_MODE = "local";
        }
      },
    );

    it("passes unexpected non-S3 code defects through unwrapped so classifyError reports them as bug (#3306)", async () => {
      const { env, getObjectSpy, gdprExportJob, classifyError } =
        await loadGdprExportWithRealFileStorage();
      try {
        selectMock
          .mockReturnValueOnce(queryChain([{ id: "user-s3", email: "s3@example.test" }]))
          .mockReturnValueOnce(
            queryChain([
              {
                id: "file-1",
                userId: "user-s3",
                storedName: "11111111-1111-1111-1111-111111111111.png",
                originalName: "one.png",
                createdAt: new Date("2026-06-02T00:00:00.000Z"),
              },
            ]),
          )
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]));

        const unexpectedBug = new TypeError("unexpected S3 client defect");
        getObjectSpy.mockRejectedValueOnce(unexpectedBug);

        const caught = await gdprExportJob("user-s3", "export-s3-bug").catch((err: unknown) => err);
        expect(caught).toBe(unexpectedBug);
        expect(classifyError(caught, "worker")).toBe("bug");
        expect(putObjectStreamMock).not.toHaveBeenCalled();
        expect(written).toHaveLength(0);
        expect(loggerWarnMock).not.toHaveBeenCalled();
      } finally {
        (env as Record<string, unknown>).STORAGE_MODE = "local";
      }
    });

    it.each([
      ["EIO", "read"],
      ["ERR_STREAM_PREMATURE_CLOSE", undefined],
      ["ECONNRESET", "read"],
    ])(
      "normalizes mid-stream S3 getObject fault %s (syscall=%s) into a 503 storage-unavailable SafeError (#3306)",
      async (code, syscall) => {
        const { env, getObjectSpy, gdprExportJob, classifyError } =
          await loadGdprExportWithRealFileStorage();
        try {
          selectMock
            .mockReturnValueOnce(queryChain([{ id: "user-s3", email: "s3@example.test" }]))
            .mockReturnValueOnce(
              queryChain([
                {
                  id: "file-1",
                  userId: "user-s3",
                  storedName: "11111111-1111-1111-1111-111111111111.png",
                  originalName: "one.png",
                  createdAt: new Date("2026-06-02T00:00:00.000Z"),
                },
              ]),
            )
            .mockReturnValueOnce(queryChain([]))
            .mockReturnValueOnce(queryChain([]));

          const streamFault = Object.assign(new Error(`S3 stream ${code}`), {
            code,
            ...(syscall ? { syscall } : {}),
          });
          getObjectSpy.mockRejectedValueOnce(streamFault);

          const caught = await gdprExportJob("user-s3", `export-s3-stream-${code}`).catch(
            (err: unknown) => err,
          );
          expect(caught).toMatchObject({
            name: "SafeError",
            isSafeMessage: true,
            kind: "operational",
            code: "storage-unavailable",
            statusCode: 503,
            message: "The server's storage service is unavailable.",
            cause: streamFault,
          });
          expect(classifyError(caught, "worker")).toBe("operational");
          expect(putObjectStreamMock).not.toHaveBeenCalled();
          expect(written).toHaveLength(0);
          expect(loggerWarnMock).not.toHaveBeenCalled();
        } finally {
          (env as Record<string, unknown>).STORAGE_MODE = "local";
        }
      },
    );

    it("forwards the export AbortSignal through readStoredFile to s3.getObject and aborts a hung S3 read on timeout (#1497)", async () => {
      const { env, getObjectSpy, gdprExportJob } = await loadGdprExportWithRealFileStorage();
      const prevTimeout = env.GDPR_EXPORT_TIMEOUT_MS;
      env.GDPR_EXPORT_TIMEOUT_MS = 40;
      const { timeoutSpy, fireTimeout } = armExportTimeout(40);
      try {
        selectMock
          .mockReturnValueOnce(queryChain([{ id: "user-s3", email: "s3@example.test" }]))
          .mockReturnValueOnce(
            queryChain([
              {
                id: "file-1",
                userId: "user-s3",
                storedName: "11111111-1111-1111-1111-111111111111.png",
                originalName: "hung-s3.png",
                createdAt: new Date("2026-06-02T00:00:00.000Z"),
              },
            ]),
          )
          .mockReturnValueOnce(queryChain([]))
          .mockReturnValueOnce(queryChain([]));

        let s3Signal: AbortSignal | undefined;
        getObjectSpy.mockImplementationOnce((...args: unknown[]) => {
          const sig = args[1] as AbortSignal | undefined;
          s3Signal = sig;
          fireTimeout();
          return new Promise<Buffer>((_resolve, reject) => {
            sig?.addEventListener(
              "abort",
              () => {
                reject(
                  Object.assign(new Error("Request aborted"), {
                    name: "AbortError",
                  }),
                );
              },
              { once: true },
            );
          });
        });

        await expect(gdprExportJob("user-s3", "export-s3-hung")).rejects.toMatchObject({
          name: "TimeoutError",
          code: "ETIMEDOUT",
          message: expect.stringContaining("GDPR export timed out after 40ms"),
        });

        expect(timeoutSpy).toHaveBeenCalledWith(40);
        expect(getObjectSpy).toHaveBeenCalledWith(
          "11111111-1111-1111-1111-111111111111.png",
          expect.any(AbortSignal),
        );
        expect(s3Signal?.aborted).toBe(true);
        expect(putObjectStreamMock).not.toHaveBeenCalled();
        expect(loggerWarnMock).not.toHaveBeenCalled();
      } finally {
        timeoutSpy.mockRestore();
        env.GDPR_EXPORT_TIMEOUT_MS = prevTimeout;
        (env as Record<string, unknown>).STORAGE_MODE = "local";
      }
    });
  });
});
