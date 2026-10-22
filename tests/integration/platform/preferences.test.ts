/**
 * Integration tests for per-user preferences (GET/PUT /api/v1/preferences).
 *
 * Preferences are writable by any authenticated user (unlike the admin-only
 * /v1/settings), so the default home view can be saved per-user.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("per-user preferences", () => {
  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/preferences" });
    expect(res.statusCode).toBe(401);
  });

  it("returns an empty map before anything is saved", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ preferences: {} });
  });

  it("saves and reads back a preference", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: { defaultToolView: "fullscreen" },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: "GET",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(get.body).preferences.defaultToolView).toBe("fullscreen");
  });

  it("upserts an existing preference rather than duplicating it", async () => {
    await app.inject({
      method: "PUT",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: { defaultToolView: "sidebar" },
    });
    const get = await app.inject({
      method: "GET",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(get.body).preferences.defaultToolView).toBe("sidebar");
  });

  it("accepts an empty preferences object as a no-op", async () => {
    const txSpy = vi.spyOn(db, "transaction");
    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: {},
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.parse(put.body)).toEqual({ ok: true });
    expect(txSpy).not.toHaveBeenCalled();
  });

  it("rolls back earlier keys when a later upsert fails in the same PUT (#2492)", async () => {
    const seed = await app.inject({
      method: "PUT",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: { existingKey: "before" },
    });
    expect(seed.statusCode).toBe(200);

    type InsertFn = (table: unknown) => unknown;
    let prefInserts = 0;
    const wrapInsert = <T extends object>(handle: T): T =>
      new Proxy(handle, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target);
          if (prop !== "insert") return typeof value === "function" ? value.bind(target) : value;
          return (table: unknown) => {
            if (table === schema.userPreferences) {
              prefInserts += 1;
              if (prefInserts === 3) {
                throw new Error("simulated connection drop on third preference upsert");
              }
            }
            return (value as InsertFn).call(target, table);
          };
        },
      });

    const realInsert = db.insert.bind(db) as InsertFn;
    vi.spyOn(db, "insert").mockImplementation(((table: unknown) => {
      if (table === schema.userPreferences) {
        prefInserts += 1;
        if (prefInserts === 3) {
          throw new Error("simulated connection drop on third preference upsert");
        }
      }
      return realInsert(table);
    }) as unknown as typeof db.insert);

    const realTransaction = db.transaction.bind(db) as (
      cb: (tx: object) => Promise<unknown>,
      config?: unknown,
    ) => Promise<unknown>;
    vi.spyOn(db, "transaction").mockImplementation(((
      cb: (tx: object) => Promise<unknown>,
      config?: unknown,
    ) => realTransaction((tx) => cb(wrapInsert(tx)), config)) as unknown as typeof db.transaction);

    const failed = await app.inject({
      method: "PUT",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: { existingKey: "after", newKeyBeforeFail: "added", thirdKey: "new" },
    });
    expect(failed.statusCode).toBe(500);

    vi.restoreAllMocks();

    const getAfterFail = await app.inject({
      method: "GET",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(getAfterFail.statusCode).toBe(200);
    const prefsAfterFail = JSON.parse(getAfterFail.body).preferences;
    expect(prefsAfterFail.existingKey).toBe("before");
    expect(prefsAfterFail).not.toHaveProperty("newKeyBeforeFail");
    expect(prefsAfterFail).not.toHaveProperty("thirdKey");

    const retry = await app.inject({
      method: "PUT",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      payload: { existingKey: "after", newKeyBeforeFail: "added", thirdKey: "new" },
    });
    expect(retry.statusCode).toBe(200);

    const getAfterRetry = await app.inject({
      method: "GET",
      url: "/api/v1/preferences",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(getAfterRetry.statusCode).toBe(200);
    const prefsAfterRetry = JSON.parse(getAfterRetry.body).preferences;
    expect(prefsAfterRetry.existingKey).toBe("after");
    expect(prefsAfterRetry.newKeyBeforeFail).toBe("added");
    expect(prefsAfterRetry.thirdKey).toBe("new");
  });
});
