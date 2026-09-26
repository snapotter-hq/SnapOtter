import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import {
  buildTestApp,
  createMultipartPayload,
  createUserAndLogin,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

describe.each(["", "/snapotter", "/apps/snapotter"])("deployment at '%s'", (basePath) => {
  let testApp: TestApp;
  let adminToken: string;
  let noToolsToken: string;
  const originalBasePath = env.BASE_PATH;

  beforeAll(async () => {
    env.BASE_PATH = basePath;
    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
    const role = `notools-${randomUUID().slice(0, 8)}`;
    const res = await testApp.app.inject({
      method: "POST",
      url: `${basePath}/api/v1/roles`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: role, permissions: ["files:own"] },
    });
    expect(res.statusCode).toBe(201);
    noToolsToken = (await createUserAndLogin(testApp.app, role, role)).token;
  });

  afterAll(async () => {
    try {
      await testApp?.cleanup();
    } finally {
      env.BASE_PATH = originalBasePath;
    }
  });

  it("keeps public health checks reachable with and without the prefix", async () => {
    for (const url of [`${basePath}/api/v1/health`, "/api/v1/health"]) {
      expect((await testApp.app.inject(url)).statusCode).toBe(200);
    }
  });

  it.each([
    ["GET", "/api/v1/admin/health"],
    ["POST", "/api/v1/tools/image/favicon"],
  ] as const)("authenticates %s %s before the route handler", async (method, path) => {
    const res = await testApp.app.inject({ method, url: `${basePath}${path}` });
    expect(res.statusCode).toBe(401);
    // The global middleware omits code; a per-route fallback adds AUTH_REQUIRED.
    // A bare 401 would hide auth reading originalUrl and treating the prefix as public.
    expect(res.json()).toEqual({ error: "Authentication required" });
  });

  it.each(["resize", "favicon"])("enforces the tool-access gate for %s", async (tool) => {
    const res = await testApp.app.inject({
      method: "POST",
      url: `${basePath}/api/v1/tools/image/${tool}`,
      headers: { authorization: `Bearer ${noToolsToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "You don't have permission to use this tool" });
  });

  it("sets and clears the same session cookie path and invalidates logout", async () => {
    const login = await testApp.app.inject({
      method: "POST",
      url: `${basePath}/api/auth/login`,
      payload: { username: "admin", password: "Adminpass1" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === "snapotter-session");
    expect(cookie).toMatchObject({ path: `${basePath}/`, httpOnly: true });
    expect(cookie?.value).toBe(login.json().token);
    const cookies = { "snapotter-session": cookie?.value ?? "" };
    const request = { url: `${basePath}/api/v1/admin/health`, cookies };
    expect((await testApp.app.inject(request)).statusCode).toBe(200);

    const logout = await testApp.app.inject({
      method: "POST",
      url: `${basePath}/api/auth/logout`,
      cookies,
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.cookies.find((c) => c.name === "snapotter-session")).toMatchObject({
      path: `${basePath}/`,
      value: "",
      expires: new Date(0),
    });
    expect((await testApp.app.inject(request)).statusCode).toBe(401);
  });

  it("processes a tool and serves the returned download URL", async () => {
    const { body, contentType } = createMultipartPayload([
      {
        name: "file",
        filename: "people.csv",
        contentType: "text/csv",
        content: "name,age\nAda,36\n",
      },
      { name: "settings", content: "{}" },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: `${basePath}/api/v1/tools/files/csv-json`,
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });
    expect(res.statusCode, res.body).toBe(200);
    const result = res.json();
    // Result URLs are root-relative (#1274): the server never bakes the
    // deployment prefix into a persisted result. Clients resolve them
    // against their own base, so the prefixed path is what a browser hits.
    expect(result.downloadUrl).toBe(`/api/v1/download/${result.jobId}/people.json`);
    const download = await testApp.app.inject(`${basePath}${result.downloadUrl}`);
    expect(download.statusCode).toBe(200);
    expect(download.json()).toEqual([{ name: "Ada", age: "36" }]);
  });
});
