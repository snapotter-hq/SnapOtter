import AdmZip from "adm-zip";
import { afterEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.hoisted(() => vi.fn());
const readStoredFileMock = vi.hoisted(() => vi.fn());
const putObjectMock = vi.hoisted(() => vi.fn());

function queryChain<T>(result: T) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(result)),
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
      users: { id: "users.id" },
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
});
