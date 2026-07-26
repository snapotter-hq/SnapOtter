/**
 * Route enforcement for files:own and pipelines:own.
 *
 * Both permissions shipped in the roles editor, in all three built-in roles and
 * in the API-key scoping list, but no route guard consulted either one. A custom
 * role holding only tools:use could still list files, upload, list pipelines and
 * create them. A toggle that silently does nothing is worse than an absent one:
 * it manufactures false confidence (SEC-20260726-C01).
 *
 * Precedence: holding either the :own or the :all permission is enough. That
 * mirrors requireApiKeyManagement in routes/api-keys.ts, which is the shipped
 * treatment of the identical apikeys:own / apikeys:all pair, and it means a
 * files:all holder is never locked out for lacking files:own. The roles UI
 * presents Files and API Keys as the same shape of group, so they behave the
 * same way.
 *
 * Scope: the file-library and saved-pipeline routes. Ad-hoc pipeline execution
 * (/execute, /batch) stores nothing and is governed by tools:use plus the
 * per-tool access gate; that boundary is asserted rather than left implicit.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

let testApp: TestApp;
let adminToken: string;

const ts = Date.now();
const ROLE_NO_FILES = `nofiles_${ts}`;
const ROLE_NO_PIPES = `nopipes_${ts}`;
const ROLE_ALL_ONLY = `allonly_${ts}`;

let noFilesToken: string;
let noPipesToken: string;
let allOnlyToken: string;
let ownerToken: string;

/** A file and a pipeline owned by a plain `user`, used for the granted paths. */
let ownedFileId: string;
let ownedPipelineId: string;

const fixtureBuffer = readFileSync(
  join(import.meta.dirname, "..", "..", "fixtures", "image", "edge", "test-1x1.png"),
);

async function createRole(name: string, permissions: string[]): Promise<void> {
  const res = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/roles",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name, description: `SEC-20260726-C01 fixture ${name}`, permissions },
  });
  if (res.statusCode !== 201) throw new Error(`Role ${name} failed: ${res.body}`);
}

async function createAndLogin(username: string, role: string): Promise<string> {
  const reg = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password: "TestPass1", role },
  });
  if (reg.statusCode !== 201 && reg.statusCode !== 200) {
    throw new Error(`Register ${username} failed: ${reg.body}`);
  }
  await db
    .update(schema.users)
    .set({ mustChangePassword: false })
    .where(eq(schema.users.username, username));
  const login = await testApp.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password: "TestPass1" },
  });
  const body = JSON.parse(login.body);
  if (!body.token) throw new Error(`Login ${username} failed: ${login.body}`);
  return body.token as string;
}

function uploadPayload() {
  return createMultipartPayload([
    {
      name: "file",
      filename: "own-perm.png",
      contentType: "image/png",
      content: fixtureBuffer,
    },
  ]);
}

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);

  // Everything except the file permissions, so a denial can only be files:own.
  await createRole(ROLE_NO_FILES, ["tools:use", "pipelines:own", "apikeys:own", "settings:read"]);
  // Everything except the pipeline permissions.
  await createRole(ROLE_NO_PIPES, ["tools:use", "files:own", "apikeys:own", "settings:read"]);
  // The precedence case: the broad permissions without the narrow ones.
  await createRole(ROLE_ALL_ONLY, ["tools:use", "files:all", "pipelines:all", "settings:read"]);

  noFilesToken = await createAndLogin(`u_nofiles_${ts}`, ROLE_NO_FILES);
  noPipesToken = await createAndLogin(`u_nopipes_${ts}`, ROLE_NO_PIPES);
  allOnlyToken = await createAndLogin(`u_allonly_${ts}`, ROLE_ALL_ONLY);
  ownerToken = await createAndLogin(`u_owner_${ts}`, "user");

  const { body, contentType } = uploadPayload();
  const upload = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/files/upload",
    headers: { "content-type": contentType, authorization: `Bearer ${ownerToken}` },
    body,
  });
  if (upload.statusCode !== 201) throw new Error(`Seed upload failed: ${upload.body}`);
  ownedFileId = JSON.parse(upload.body).files[0].id;

  const save = await testApp.app.inject({
    method: "POST",
    url: "/api/v1/pipeline/save",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      name: `own-perm-${ts}`,
      steps: [{ toolId: "rotate", settings: { angle: 90 } }],
    },
  });
  if (save.statusCode !== 200 && save.statusCode !== 201) {
    throw new Error(`Seed pipeline failed: ${save.body}`);
  }
  ownedPipelineId = JSON.parse(save.body).id;
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
}, 15_000);

describe("files:own is enforced on the file library routes", () => {
  it("denies listing to a role without files:own", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${noFilesToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("FORBIDDEN");
  });

  it("denies upload to a role without files:own", async () => {
    const { body, contentType } = uploadPayload();
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": contentType, authorization: `Bearer ${noFilesToken}` },
      body,
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies metadata, download and thumbnail before resolving the resource", async () => {
    // A random id, so a 404 would mean the guard never ran. 403 proves the
    // permission is checked ahead of the lookup and no existence is leaked.
    const missing = randomUUID();
    for (const url of [
      `/api/v1/files/${missing}`,
      `/api/v1/files/${missing}/download`,
      `/api/v1/files/${missing}/thumbnail`,
    ]) {
      const res = await testApp.app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${noFilesToken}` },
      });
      expect(res.statusCode, `expected 403 for ${url}`).toBe(403);
    }
  });

  it("denies bulk delete to a role without files:own", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${noFilesToken}` },
      payload: { ids: [ownedFileId] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies save-result to a role without files:own", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "parentId", content: ownedFileId },
      { name: "toolId", content: "rotate" },
      {
        name: "file",
        filename: "result.png",
        contentType: "image/png",
        content: fixtureBuffer,
      },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/save-result",
      headers: { "content-type": contentType, authorization: `Bearer ${noFilesToken}` },
      body,
    });
    expect(res.statusCode).toBe(403);
  });

  it("still lets a role holding files:own list and upload", async () => {
    const list = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(list.statusCode).toBe(200);

    const { body, contentType } = uploadPayload();
    const upload = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": contentType, authorization: `Bearer ${ownerToken}` },
      body,
    });
    expect(upload.statusCode).toBe(201);
  });

  it("does not lock out a role holding files:all but not files:own", async () => {
    // Precedence, pinned rather than left implicit: :all is the broader grant,
    // so it satisfies the guard on its own. Same rule as apikeys:all.
    const list = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/files",
      headers: { authorization: `Bearer ${allOnlyToken}` },
    });
    expect(list.statusCode).toBe(200);

    // And it keeps its widened scope: it can read a file it does not own.
    const read = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${ownedFileId}`,
      headers: { authorization: `Bearer ${allOnlyToken}` },
    });
    expect(read.statusCode).toBe(200);
    expect(JSON.parse(read.body).file.id).toBe(ownedFileId);
  });
});

describe("pipelines:own is enforced on the saved-pipeline routes", () => {
  it("denies listing to a role without pipelines:own", async () => {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${noPipesToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("FORBIDDEN");
  });

  it("denies save to a role without pipelines:own", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: { authorization: `Bearer ${noPipesToken}` },
      payload: {
        name: `denied-${ts}`,
        steps: [{ toolId: "rotate", settings: { angle: 90 } }],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies delete before resolving the resource", async () => {
    const res = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/pipeline/${randomUUID()}`,
      headers: { authorization: `Bearer ${noPipesToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("still lets a role holding pipelines:own list, save and delete its own", async () => {
    const list = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(list.statusCode).toBe(200);

    const save = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/pipeline/save",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: `granted-${ts}`,
        steps: [{ toolId: "rotate", settings: { angle: 180 } }],
      },
    });
    expect(save.statusCode).toBe(201);

    const del = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/pipeline/${JSON.parse(save.body).id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(del.statusCode).toBe(200);
  });

  it("does not lock out a role holding pipelines:all but not pipelines:own", async () => {
    const list = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/pipeline/list",
      headers: { authorization: `Bearer ${allOnlyToken}` },
    });
    expect(list.statusCode).toBe(200);

    // Keeps the widened scope: it can delete a pipeline it does not own.
    const del = await testApp.app.inject({
      method: "DELETE",
      url: `/api/v1/pipeline/${ownedPipelineId}`,
      headers: { authorization: `Bearer ${allOnlyToken}` },
    });
    expect(del.statusCode).toBe(200);
  });

  it("leaves ad-hoc pipeline execution to tools:use", async () => {
    // Deliberate boundary. /execute and /batch persist nothing, so they are tool
    // use rather than access to a stored pipeline. A missing body must fail
    // validation, not authorisation: anything but 403 proves the guard is not
    // on this route.
    for (const url of ["/api/v1/pipeline/execute", "/api/v1/pipeline/batch"]) {
      const res = await testApp.app.inject({
        method: "POST",
        url,
        headers: {
          "content-type": "multipart/form-data; boundary=----TestBoundaryEmptyBody",
          authorization: `Bearer ${noPipesToken}`,
        },
        body: "------TestBoundaryEmptyBody--\r\n",
      });
      expect(res.statusCode, `expected non-403 for ${url}`).not.toBe(403);
    }
  });
});
