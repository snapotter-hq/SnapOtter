import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { deletePrefix, objectExists, putObject } from "../../../apps/api/src/lib/object-storage.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

describe("GDPR lifecycle without enterprise license", () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
  }, 10_000);

  describe("GDPR data export", () => {
    it("returns 403 for POST without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/users/some-id/export",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("enterprise");
    });

    it("returns 403 for GET without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/users/some-id/export/some-job-id",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("enterprise");
    });

    it("returns 401 for POST without auth", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/users/some-id/export",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 for GET without auth", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/users/some-id/export/some-job-id",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 for DELETE purge without auth", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        payload: { confirm: true },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      // Create a regular user
      await testApp.app.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: "gdprexportuser",
          password: "TestPass1",
          role: "user",
        },
      });
      await db
        .update(schema.users)
        .set({ mustChangePassword: false })
        .where(eq(schema.users.username, "gdprexportuser"));

      const loginRes = await testApp.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "gdprexportuser", password: "TestPass1" },
      });
      const userToken = JSON.parse(loginRes.body).token;

      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/users/some-id/export",
        headers: { authorization: `Bearer ${userToken}` },
      });
      // Regular users lack compliance:manage, so they get 403 before the enterprise check
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GDPR data purge", () => {
    it("returns 403 without enterprise license for user purge", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { confirm: true },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("enterprise");
    });

    it("returns 403 without enterprise license for team purge", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/teams/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { confirm: true },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("enterprise");
    });

    it("requires confirmation body for purge", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      // Should fail validation (400 or 403 depending on feature check order)
      expect([400, 403]).toContain(res.statusCode);
    });

    it("rejects purge with confirm: false", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { confirm: false },
      });
      expect([400, 403]).toContain(res.statusCode);
    });

    it("returns 401 for user purge without auth", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        payload: { confirm: true },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 for team purge without auth", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/teams/some-id/purge",
        payload: { confirm: true },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GDPR export additional validation", () => {
    it("returns 401 for POST export with invalid token", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/users/some-id/export",
        headers: { authorization: "Bearer invalid-token-value" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 for GET export status with invalid token", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/users/some-id/export/some-job-id",
        headers: { authorization: "Bearer invalid-token-value" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GDPR purge body validation", () => {
    it("rejects purge with confirm as string instead of boolean", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { confirm: "true" },
      });
      expect([400, 403]).toContain(res.statusCode);
    });

    it("rejects purge with confirm: null", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { confirm: null },
      });
      expect([400, 403]).toContain(res.statusCode);
    });

    it("rejects purge with no body at all", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect([400, 403]).toContain(res.statusCode);
    });

    it("returns 403 for non-existent user ID without enterprise license", async () => {
      const res = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/00000000-0000-0000-0000-000000000000/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { confirm: true },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("enterprise");
    });
  });

  describe("GDPR edge cases", () => {
    it("sequential purge requests for same user return consistent results", async () => {
      const first = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { confirm: true },
      });
      const second = await testApp.app.inject({
        method: "DELETE",
        url: "/api/v1/enterprise/users/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { confirm: true },
      });
      expect(first.statusCode).toBe(second.statusCode);
      expect(first.statusCode).toBe(403);
    });

    it("export initiation rejects GET method", async () => {
      const res = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/enterprise/users/some-id/export",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("purge endpoint rejects POST method", async () => {
      const res = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/enterprise/users/some-id/purge",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { confirm: true },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

describe("GDPR purge role hierarchy", () => {
  let licensedApp: TestApp;
  let licensedAdminToken: string;
  let complianceManagerToken: string;
  let complianceRoleId: string;
  let complianceManagerId: string;
  let targetSequence = 0;

  beforeAll(async () => {
    vi.resetModules();
    const { mockEnterpriseFeatures } = await import("../../helpers/enterprise-mock.js");
    mockEnterpriseFeatures(["gdpr_lifecycle"]);
    const { buildTestApp, loginAsAdmin } = await import("../test-server.js");
    licensedApp = await buildTestApp();
    licensedAdminToken = await loginAsAdmin(licensedApp.app);

    const suffix = Date.now().toString(36);
    const roleName = `compliance-${suffix}`;
    const username = `compliance-manager-${suffix}`;
    const roleRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: { name: roleName, permissions: ["compliance:manage"] },
    });
    if (roleRes.statusCode !== 201) {
      throw new Error(`Failed to create compliance manager role: ${roleRes.body}`);
    }
    complianceRoleId = JSON.parse(roleRes.body).id as string;

    const registerRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: { username, password: "TestPass1", role: roleName },
    });
    if (registerRes.statusCode !== 201) {
      throw new Error(`Failed to create compliance manager user: ${registerRes.body}`);
    }
    complianceManagerId = JSON.parse(registerRes.body).id as string;
    await db
      .update(schema.users)
      .set({ mustChangePassword: false })
      .where(eq(schema.users.id, complianceManagerId));

    const loginRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password: "TestPass1" },
    });
    complianceManagerToken = JSON.parse(loginRes.body).token as string;
  }, 30_000);

  afterAll(async () => {
    if (complianceManagerId) {
      await db.delete(schema.users).where(eq(schema.users.id, complianceManagerId));
    }
    if (complianceRoleId) {
      await db.delete(schema.roles).where(eq(schema.roles.id, complianceRoleId));
    }
    await licensedApp.cleanup();
    vi.restoreAllMocks();
  }, 10_000);

  async function createTarget(role: string, teamId?: string): Promise<string> {
    targetSequence += 1;
    const username = `gdpr-target-${role}-${Date.now().toString(36)}-${targetSequence}`;
    const registerRes = await licensedApp.app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { authorization: `Bearer ${licensedAdminToken}` },
      payload: { username, password: "TargetPass1", role },
    });
    if (registerRes.statusCode !== 201) {
      throw new Error(`Failed to create GDPR target user: ${registerRes.body}`);
    }
    const id = JSON.parse(registerRes.body).id as string;
    await db
      .update(schema.users)
      .set({
        mustChangePassword: false,
        ...(teamId ? { team: teamId } : {}),
      })
      .where(eq(schema.users.id, id));
    return id;
  }

  it("denies direct purge of a disabled administrator and preserves the account", async () => {
    const targetId = await createTarget("admin");
    await db
      .update(schema.users)
      .set({ role: "disabled:admin" })
      .where(eq(schema.users.id, targetId));

    try {
      const res = await licensedApp.app.inject({
        method: "DELETE",
        url: `/api/v1/enterprise/users/${targetId}/purge`,
        headers: { authorization: `Bearer ${complianceManagerToken}` },
        payload: { confirm: true },
      });
      const body = JSON.parse(res.body);
      const [remainingTarget] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, targetId));

      expect.soft(res.statusCode).toBe(403);
      expect.soft(body.code).toBe("ESCALATION_DENIED");
      expect(remainingTarget?.role).toBe("disabled:admin");
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
    }
  });

  it("preflights a mixed team and preserves subordinate members when a disabled admin is denied", async () => {
    const teamId = randomUUID();
    await db.insert(schema.teams).values({
      id: teamId,
      name: `GDPR hierarchy ${Date.now().toString(36)}`,
    });
    const subordinateId = await createTarget("user", teamId);
    const disabledAdminId = await createTarget("admin", teamId);
    await db
      .update(schema.users)
      .set({ role: "disabled:admin" })
      .where(eq(schema.users.id, disabledAdminId));

    try {
      const res = await licensedApp.app.inject({
        method: "DELETE",
        url: `/api/v1/enterprise/teams/${teamId}/purge`,
        headers: { authorization: `Bearer ${complianceManagerToken}` },
        payload: { confirm: true },
      });
      const body = JSON.parse(res.body);
      const [remainingSubordinate] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, subordinateId));
      const [remainingDisabledAdmin] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, disabledAdminId));
      const [remainingTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.id, teamId));

      expect.soft(res.statusCode).toBe(403);
      expect.soft(body.code).toBe("ESCALATION_DENIED");
      expect.soft(remainingSubordinate?.role).toBe("user");
      expect.soft(remainingDisabledAdmin?.role).toBe("disabled:admin");
      expect(remainingTeam?.id).toBe(teamId);
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, subordinateId));
      await db.delete(schema.users).where(eq(schema.users.id, disabledAdminId));
      await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
    }
  });

  it("allows the full built-in admin to purge a subordinate team", async () => {
    const teamId = randomUUID();
    await db.insert(schema.teams).values({
      id: teamId,
      name: `GDPR subordinate ${Date.now().toString(36)}`,
    });
    const targetId = await createTarget("user", teamId);

    try {
      const res = await licensedApp.app.inject({
        method: "DELETE",
        url: `/api/v1/enterprise/teams/${teamId}/purge`,
        headers: { authorization: `Bearer ${licensedAdminToken}` },
        payload: { confirm: true },
      });
      const [remainingTarget] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, targetId));
      const [remainingTeam] = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.id, teamId));

      expect(res.statusCode).toBe(200);
      expect(remainingTarget).toBeUndefined();
      expect(remainingTeam).toBeUndefined();
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
      await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
    }
  });

  it("returns a terminal canceled status without progress when a GDPR export is canceled (#2633)", async () => {
    const targetId = await createTarget("user");
    const jobId = randomUUID();
    await db.insert(schema.jobs).values({
      id: jobId,
      userId: targetId,
      toolId: "gdpr-export",
      pool: "system",
      type: "system",
      status: "canceled",
      progress: { percent: 40, stage: "archiving" },
    });

    try {
      const res = await licensedApp.app.inject({
        method: "GET",
        url: `/api/v1/enterprise/users/${targetId}/export/${jobId}`,
        headers: { authorization: `Bearer ${licensedAdminToken}` },
      });

      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body)).toEqual({
        status: "canceled",
        error: "Export canceled",
      });
    } finally {
      await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
    }
  });

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)(
    "aborts purge before deleting jobs and users rows when job-storage deletePrefix fails (#2632)",
    async () => {
      const targetId = await createTarget("user");
      const jobId = randomUUID();
      const jobDir = join(env.WORKSPACE_PATH, "outputs", jobId);
      await db.insert(schema.jobs).values({
        id: jobId,
        userId: targetId,
        toolId: "resize",
        pool: "image",
        type: "single",
        status: "completed",
        outputRefs: [`outputs/${jobId}/result.png`],
      });
      await putObject(`outputs/${jobId}/result.png`, Buffer.from("artifact"));
      await chmod(jobDir, 0o500);

      try {
        const failedRes = await licensedApp.app.inject({
          method: "DELETE",
          url: `/api/v1/enterprise/users/${targetId}/purge`,
          headers: { authorization: `Bearer ${licensedAdminToken}` },
          payload: { confirm: true },
        });
        const [remainingJob] = await db
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, jobId));
        const [remainingUser] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.id, targetId));

        expect(failedRes.statusCode, failedRes.body).toBe(503);
        expect(JSON.parse(failedRes.body).code).toBe("storage-not-writable");
        expect(remainingJob?.id, "job row must remain so a retry can finish the delete").toBe(
          jobId,
        );
        expect(remainingUser?.id, "user row must remain when storage purge fails").toBe(targetId);
        expect(existsSync(join(jobDir, "result.png"))).toBe(true);

        // Once permissions are restored, retrying the purge removes both the storage prefix and rows.
        await chmod(jobDir, 0o755);
        const retryRes = await licensedApp.app.inject({
          method: "DELETE",
          url: `/api/v1/enterprise/users/${targetId}/purge`,
          headers: { authorization: `Bearer ${licensedAdminToken}` },
          payload: { confirm: true },
        });
        const [jobAfterRetry] = await db
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, jobId));
        const [userAfterRetry] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.id, targetId));

        expect(retryRes.statusCode, retryRes.body).toBe(200);
        expect(jobAfterRetry).toBeUndefined();
        expect(userAfterRetry).toBeUndefined();
        expect(existsSync(jobDir)).toBe(false);
      } finally {
        await chmod(jobDir, 0o755).catch(() => {});
        await deletePrefix(`outputs/${jobId}`).catch(() => {});
        await db.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
        await db.delete(schema.users).where(eq(schema.users.id, targetId));
      }
    },
  );

  it("does not write an export archive after its jobs row has been deleted (#1496)", async () => {
    const { gdprExportJob } = await import("../../../apps/api/src/jobs/gdpr-export.js");
    const targetId = await createTarget("user");
    const exportJobId = randomUUID();

    try {
      await db.insert(schema.jobs).values({
        id: exportJobId,
        userId: targetId,
        toolId: "gdpr-export",
        pool: "system",
        type: "system",
        status: "queued",
      });

      await db.delete(schema.jobs).where(eq(schema.jobs.id, exportJobId));

      const result = await gdprExportJob(targetId, exportJobId);
      expect(result.outputRef).toBeNull();
      expect(await objectExists(`outputs/${exportJobId}/gdpr-export.zip`)).toBe(false);

      const downloadRes = await licensedApp.app.inject({
        method: "GET",
        url: `/api/v1/download/${exportJobId}/gdpr-export.zip`,
      });
      expect(downloadRes.statusCode).toBe(404);
    } finally {
      await deletePrefix(`outputs/${exportJobId}/`).catch(() => {});
      await db.delete(schema.jobs).where(eq(schema.jobs.id, exportJobId));
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
    }
  });

  it("purging a user while their GDPR export is in progress leaves no archive behind (#1496)", async () => {
    const cancelMod = await import("../../../apps/api/src/jobs/cancel.js");
    const fileStorage = await import("../../../apps/api/src/lib/file-storage.js");
    const { gdprExportJob } = await import("../../../apps/api/src/jobs/gdpr-export.js");
    const targetId = await createTarget("user");
    const fileId = randomUUID();
    const exportJobId = randomUUID();
    const storedName = await fileStorage.saveFile(
      Buffer.from("sensitive library contents"),
      "secret.png",
    );
    await db.insert(schema.userFiles).values({
      id: fileId,
      userId: targetId,
      originalName: "secret.png",
      storedName,
      mimeType: "image/png",
      size: 26,
    });
    await db.insert(schema.jobs).values({
      id: exportJobId,
      userId: targetId,
      toolId: "gdpr-export",
      pool: "system",
      type: "system",
      status: "processing",
    });

    let notifyReadingFile!: () => void;
    const readingFile = new Promise<void>((resolve) => {
      notifyReadingFile = resolve;
    });
    let releaseFileRead!: () => void;
    const fileReadGate = new Promise<void>((resolve) => {
      releaseFileRead = resolve;
    });

    const realReadStoredFile = fileStorage.readStoredFile;
    const readSpy = vi.spyOn(fileStorage, "readStoredFile").mockImplementationOnce(async (name) => {
      const buf = await realReadStoredFile(name);
      notifyReadingFile();
      await fileReadGate;
      return buf;
    });

    const realRequestCancel = cancelMod.requestCancel;
    const cancelSpy = vi.spyOn(cancelMod, "requestCancel").mockImplementationOnce(async (id) => {
      const result = await realRequestCancel(id);
      // Release the export while purgeUserData is still in flight (entering its
      // 500ms propagation wait) so the export races the purge rather than
      // resuming after the purge has already returned.
      setTimeout(() => releaseFileRead(), 50);
      return result;
    });

    try {
      const exportPromise = gdprExportJob(targetId, exportJobId);
      await readingFile;

      const purgeRes = await licensedApp.app.inject({
        method: "DELETE",
        url: `/api/v1/enterprise/users/${targetId}/purge`,
        headers: { authorization: `Bearer ${licensedAdminToken}` },
        payload: { confirm: true },
      });
      expect(purgeRes.statusCode).toBe(200);

      releaseFileRead();
      const exportResult = await exportPromise;
      expect(exportResult.outputRef).toBeNull();

      expect(await objectExists(`outputs/${exportJobId}/gdpr-export.zip`)).toBe(false);
      const statusRes = await licensedApp.app.inject({
        method: "GET",
        url: `/api/v1/enterprise/users/${targetId}/export/${exportJobId}`,
        headers: { authorization: `Bearer ${licensedAdminToken}` },
      });
      expect(statusRes.statusCode).toBe(404);
      expect(JSON.parse(statusRes.body)).toEqual({ error: "Export job not found" });
      const publicDownloadRes = await licensedApp.app.inject({
        method: "GET",
        url: `/api/v1/download/${exportJobId}/gdpr-export.zip`,
      });
      expect(publicDownloadRes.statusCode).toBe(404);
    } finally {
      cancelSpy.mockRestore();
      readSpy.mockRestore();
      releaseFileRead();
      await deletePrefix(`outputs/${exportJobId}/`).catch(() => {});
      await fileStorage.deleteStoredFile(storedName).catch(() => {});
      await db.delete(schema.userFiles).where(eq(schema.userFiles.id, fileId));
      await db.delete(schema.jobs).where(eq(schema.jobs.id, exportJobId));
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
    }
  });

  it("purge sweeps outputs again after canceling active jobs and deleting job rows (#1496)", async () => {
    const cancelMod = await import("../../../apps/api/src/jobs/cancel.js");
    const targetId = await createTarget("user");
    const exportJobId = randomUUID();

    await db.insert(schema.jobs).values({
      id: exportJobId,
      userId: targetId,
      toolId: "gdpr-export",
      pool: "system",
      type: "system",
      status: "processing",
    });

    const realRequestCancel = cancelMod.requestCancel;
    const cancelSpy = vi.spyOn(cancelMod, "requestCancel").mockImplementationOnce(async (id) => {
      const result = await realRequestCancel(id);
      await putObject(`outputs/${exportJobId}/gdpr-export.zip`, Buffer.from("late-export-bytes"));
      return result;
    });

    try {
      const purgeRes = await licensedApp.app.inject({
        method: "DELETE",
        url: `/api/v1/enterprise/users/${targetId}/purge`,
        headers: { authorization: `Bearer ${licensedAdminToken}` },
        payload: { confirm: true },
      });
      expect(purgeRes.statusCode).toBe(200);
      expect(cancelSpy).toHaveBeenCalledWith(exportJobId);
      expect(await objectExists(`outputs/${exportJobId}/gdpr-export.zip`)).toBe(false);
    } finally {
      cancelSpy.mockRestore();
      await deletePrefix(`outputs/${exportJobId}/`).catch(() => {});
      await db.delete(schema.jobs).where(eq(schema.jobs.id, exportJobId));
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
    }
  });

  it("times out a GDPR export hung on a library file read so subsequent system jobs still run (#1497)", async () => {
    const { env: activeEnv } = await import("../../../apps/api/src/config.js");
    const fileStorage = await import("../../../apps/api/src/lib/file-storage.js");
    const { getQueue } = await import("../../../apps/api/src/jobs/queues.js");
    const { SYSTEM_JOBS } = await import("../../../apps/api/src/jobs/system-jobs.js");
    const targetId = await createTarget("user");
    const fileId = randomUUID();
    const exportJobId = randomUUID();
    const followUpJobId = `session-purge-after-${exportJobId}`;
    const storedName = await fileStorage.saveFile(Buffer.from("library bytes"), "hung.png");
    await db.insert(schema.userFiles).values({
      id: fileId,
      userId: targetId,
      originalName: "hung.png",
      storedName,
      mimeType: "image/png",
      size: 13,
    });
    await db.insert(schema.jobs).values({
      id: exportJobId,
      userId: targetId,
      toolId: "gdpr-export",
      pool: "system",
      type: "system",
      status: "queued",
    });

    const prevTimeout = activeEnv.GDPR_EXPORT_TIMEOUT_MS;
    activeEnv.GDPR_EXPORT_TIMEOUT_MS = 100;

    let observedSignal: AbortSignal | undefined;
    const readSpy = vi
      .spyOn(fileStorage, "readStoredFile")
      .mockImplementationOnce((_name, opts) => {
        observedSignal = opts instanceof AbortSignal ? opts : opts?.signal;
        // Hang indefinitely unless the export deadline aborts the read.
        return new Promise<Buffer>(() => {});
      });

    const systemQueue = getQueue("system");
    try {
      const exportQueueJob = await systemQueue.add(
        SYSTEM_JOBS.gdprExport,
        { userId: targetId, jobId: exportJobId } as never,
        { jobId: exportJobId, attempts: 1 },
      );
      const followUpQueueJob = await systemQueue.add(SYSTEM_JOBS.sessionPurge, {} as never, {
        jobId: followUpJobId,
        attempts: 1,
      });

      await vi.waitFor(async () => expect(await exportQueueJob.getState()).toBe("failed"), {
        timeout: 10_000,
        interval: 50,
      });
      const failedExportJob = await systemQueue.getJob(exportJobId);
      expect(failedExportJob?.failedReason).toMatch(/GDPR export timed out after 100ms/);
      expect(observedSignal).toBeInstanceOf(AbortSignal);
      expect(observedSignal?.aborted).toBe(true);
      expect(await objectExists(`outputs/${exportJobId}/gdpr-export.zip`)).toBe(false);

      // The concurrency-1 system worker is no longer wedged behind the hung export.
      await vi.waitFor(async () => expect(await followUpQueueJob.getState()).toBe("completed"), {
        timeout: 10_000,
        interval: 50,
      });
    } finally {
      activeEnv.GDPR_EXPORT_TIMEOUT_MS = prevTimeout;
      readSpy.mockRestore();
      await systemQueue.remove(exportJobId).catch(() => {});
      await systemQueue.remove(followUpJobId).catch(() => {});
      await deletePrefix(`outputs/${exportJobId}/`).catch(() => {});
      await fileStorage.deleteStoredFile(storedName).catch(() => {});
      await db.delete(schema.userFiles).where(eq(schema.userFiles.id, fileId));
      await db.delete(schema.jobs).where(eq(schema.jobs.id, exportJobId));
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
    }
  });

  it("records the sanitized failure reason and logs the full error after BullMQ exhausts its retries (#1495)", async () => {
    const objectStorage = await import("../../../apps/api/src/lib/object-storage.js");
    const { logger } = await import("../../../apps/api/src/lib/logger.js");
    const { getQueue } = await import("../../../apps/api/src/jobs/queues.js");
    const { reconcileStrandedJobs, UNRECOVERABLE_STRANDED_JOB_ERROR } = await import(
      "../../../apps/api/src/jobs/job-reconciliation.js"
    );
    const targetId = await createTarget("user");
    const storageErr = new Error(
      "EntityTooLarge: Your proposed upload exceeds the maximum allowed size at /data/workspace/outputs/gdpr-export.zip",
    );
    let writeAttempts = 0;
    let cancelDuringWriteJobId = "";
    const failPutStream = async () => {
      writeAttempts += 1;
      if (cancelDuringWriteJobId) {
        await db
          .update(schema.jobs)
          .set({ status: "canceled", completedAt: new Date() })
          .where(eq(schema.jobs.id, cancelDuringWriteJobId));
      }
      throw storageErr;
    };
    const putStreamSpy = vi
      .spyOn(objectStorage, "putObjectStream")
      .mockImplementation(failPutStream);
    const errorSpy = vi.spyOn(logger, "error");
    const systemQueue = getQueue("system");
    let exportJobId = "";

    try {
      const startRes = await licensedApp.app.inject({
        method: "POST",
        url: `/api/v1/enterprise/users/${targetId}/export`,
        headers: { authorization: `Bearer ${licensedAdminToken}` },
      });
      expect(startRes.statusCode, startRes.body).toBe(202);
      exportJobId = JSON.parse(startRes.body).jobId as string;

      // Pin #2900: if moveToFailed on attempt 2 lands between getJob() and
      // getState(), the Job instance on which getState() was called still holds
      // the pre-script attemptsMade=1 snapshot.
      const realGetJob = systemQueue.getJob.bind(systemQueue);
      let injectedSplitRead = false;
      const getJobSpy = vi.spyOn(systemQueue, "getJob").mockImplementation(async (id) => {
        const job = await realGetJob(id);
        if (job && id === exportJobId && !injectedSplitRead) {
          const realGetState = job.getState.bind(job);
          job.getState = async () => {
            const state = await realGetState();
            if (state === "failed" && !injectedSplitRead) {
              injectedSplitRead = true;
              job.attemptsMade = 1;
            }
            return state;
          };
        }
        return job;
      });
      const failedJob = await vi
        .waitFor(
          async () => {
            const job = await systemQueue.getJob(exportJobId);
            expect(await job?.getState()).toBe("failed");
            const settled = await systemQueue.getJob(exportJobId);
            expect(settled).toBeDefined();
            return settled;
          },
          { timeout: 15_000, interval: 100 },
        )
        .finally(() => {
          getJobSpy.mockRestore();
        });
      expect(failedJob?.attemptsMade).toBe(2);
      expect(writeAttempts).toBe(2);

      await vi.waitFor(
        async () => {
          const statusRes = await licensedApp.app.inject({
            method: "GET",
            url: `/api/v1/enterprise/users/${targetId}/export/${exportJobId}`,
            headers: { authorization: `Bearer ${licensedAdminToken}` },
          });
          expect(statusRes.statusCode).toBe(200);
          expect(JSON.parse(statusRes.body)).toEqual({
            status: "failed",
            error:
              "EntityTooLarge: Your proposed upload exceeds the maximum allowed size at [internal]",
          });
        },
        { timeout: 5_000, interval: 50 },
      );

      const matchingErrorLogs = errorSpy.mock.calls.filter(
        ([ctx, msg]) =>
          (ctx as { jobId?: string } | undefined)?.jobId === exportJobId &&
          typeof msg === "string" &&
          msg.includes("gdpr export"),
      );
      expect(matchingErrorLogs).toHaveLength(1);
      expect(matchingErrorLogs[0]?.[0]).toMatchObject({
        err: storageErr,
        jobId: exportJobId,
        userId: targetId,
      });

      // Stranded-job reconciliation finds the row already terminal and does not
      // overwrite the actionable error with UNRECOVERABLE_STRANDED_JOB_ERROR.
      await db
        .update(schema.jobs)
        .set({ createdAt: new Date(Date.now() - 10 * 60_000) })
        .where(eq(schema.jobs.id, exportJobId));
      const summary = await reconcileStrandedJobs({ graceMs: 0 });
      expect(summary.outcomes.some((o) => o.jobId === exportJobId)).toBe(false);

      const afterReconcileRes = await licensedApp.app.inject({
        method: "GET",
        url: `/api/v1/enterprise/users/${targetId}/export/${exportJobId}`,
        headers: { authorization: `Bearer ${licensedAdminToken}` },
      });
      const body = JSON.parse(afterReconcileRes.body);
      expect(body.status).toBe("failed");
      expect(body.error).not.toBe(UNRECOVERABLE_STRANDED_JOB_ERROR);
      expect(body.error).toBe(
        "EntityTooLarge: Your proposed upload exceeds the maximum allowed size at [internal]",
      );

      // A row that becomes canceled while putObjectStream is in flight must
      // not be overwritten when the subsequent throw triggers worker.on("failed").
      const canceledJobId = randomUUID();
      cancelDuringWriteJobId = canceledJobId;
      await db.insert(schema.jobs).values({
        id: canceledJobId,
        userId: targetId,
        toolId: "gdpr-export",
        pool: "system",
        type: "system",
        status: "processing",
      });
      try {
        const canceledQueueJob = await systemQueue.add(
          "system:gdpr-export",
          { userId: targetId, jobId: canceledJobId } as never,
          { jobId: canceledJobId, attempts: 1 },
        );
        await vi.waitFor(async () => expect(await canceledQueueJob.getState()).toBe("failed"), {
          timeout: 10_000,
          interval: 50,
        });
        const [canceledRow] = await db
          .select()
          .from(schema.jobs)
          .where(eq(schema.jobs.id, canceledJobId));
        expect(canceledRow?.status).toBe("canceled");
        expect(writeAttempts).toBe(3);
        const canceledErrorLogs = errorSpy.mock.calls.filter(
          ([ctx, msg]) =>
            (ctx as { jobId?: string } | undefined)?.jobId === canceledJobId &&
            typeof msg === "string" &&
            msg.includes("gdpr export"),
        );
        expect(canceledErrorLogs).toHaveLength(1);
      } finally {
        cancelDuringWriteJobId = "";
        await systemQueue.remove(canceledJobId).catch(() => {});
        await db.delete(schema.jobs).where(eq(schema.jobs.id, canceledJobId));
      }
    } finally {
      putStreamSpy.mockRestore();
      errorSpy.mockRestore();
      if (exportJobId) {
        await systemQueue.remove(exportJobId).catch(() => {});
        await deletePrefix(`outputs/${exportJobId}/`).catch(() => {});
        await db.delete(schema.jobs).where(eq(schema.jobs.id, exportJobId));
      }
      await db.delete(schema.users).where(eq(schema.users.id, targetId));
    }
  }, 30_000);
});
