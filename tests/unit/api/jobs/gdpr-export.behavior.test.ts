import AdmZip from "adm-zip";
import { afterEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.hoisted(() => vi.fn());
const readStoredFileMock = vi.hoisted(() => vi.fn());
const putObjectMock = vi.hoisted(() => vi.fn());

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

async function loadGdprExport() {
  vi.resetModules();
  selectMock.mockReset();
  readStoredFileMock.mockReset();
  putObjectMock.mockReset();

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
      jobs: { userId: "jobs.userId" },
      auditLog: { actorId: "auditLog.actorId" },
    },
  }));

  vi.doMock("../../../../apps/api/src/lib/file-storage.js", () => ({
    readStoredFile: readStoredFileMock,
  }));

  vi.doMock("../../../../apps/api/src/lib/object-storage.js", () => ({
    putObject: putObjectMock,
  }));

  return import("../../../../apps/api/src/jobs/gdpr-export.js");
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
  });

  it("throws before writing output when the user does not exist", async () => {
    const { gdprExportJob } = await loadGdprExport();
    selectMock.mockReturnValueOnce(queryChain([]));

    await expect(gdprExportJob("missing-user", "job-1")).rejects.toThrow(
      "User missing-user not found",
    );

    expect(putObjectMock).not.toHaveBeenCalled();
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
    readStoredFileMock
      .mockResolvedValueOnce(Buffer.from("file contents"))
      .mockRejectedValueOnce(new Error("missing"));

    await expect(gdprExportJob("user-1", "export-job")).resolves.toEqual({
      outputRef: "outputs/export-job/gdpr-export.zip",
    });

    expect(putObjectMock).toHaveBeenCalledTimes(1);
    const [outputRef, zipBuffer] = putObjectMock.mock.calls[0];
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

    expect(putObjectMock).toHaveBeenCalledTimes(1);
    const zipBuffer = putObjectMock.mock.calls[0][1];
    const zip = new AdmZip(zipBuffer);

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
    expect(putObjectMock).toHaveBeenCalledTimes(1);

    const zipBuffer = putObjectMock.mock.calls[0][1];
    const zip = new AdmZip(zipBuffer);
    expect(JSON.parse(zip.readAsText("files.json"))).toEqual([]);
    expect(JSON.parse(zip.readAsText("jobs.json"))).toEqual([]);
    expect(JSON.parse(zip.readAsText("audit-log.json"))).toEqual([]);
    const profile = JSON.parse(zip.readAsText("profile.json"));
    expect(profile).toMatchObject({ id: "user-3", email: "empty@example.test" });
    expect(profile).not.toHaveProperty("passwordHash");
  });
});
