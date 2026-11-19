/**
 * GET /api/v1/config/auth tells the login page whether the seeded admin still
 * has the shipped admin / admin credentials, so a first-run user isn't left
 * guessing (#4817). It must say so only while that is literally true.
 */

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { hashPassword } from "../../../apps/api/src/plugins/auth.js";
import { buildTestApp, type TestApp } from "../test-server.js";

let testApp: TestApp;
let originalAdmin: { passwordHash: string | null; mustChangePassword: boolean };
const originalEnv = {
  AUTH_ENABLED: env.AUTH_ENABLED,
  DEFAULT_USERNAME: env.DEFAULT_USERNAME,
  DEFAULT_PASSWORD: env.DEFAULT_PASSWORD,
  SKIP_MUST_CHANGE_PASSWORD: env.SKIP_MUST_CHANGE_PASSWORD,
};

async function setAdmin(password: string, mustChangePassword: boolean): Promise<void> {
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword })
    .where(eq(schema.users.username, "admin"));
}

// The shipped defaults: an install nobody configured.
function useShippedEnv(): void {
  env.AUTH_ENABLED = true;
  env.DEFAULT_USERNAME = "admin";
  env.DEFAULT_PASSWORD = "admin";
  env.SKIP_MUST_CHANGE_PASSWORD = false;
}

async function fetchAuthConfig(): Promise<Record<string, unknown>> {
  const res = await testApp.app.inject({ method: "GET", url: "/api/v1/config/auth" });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body);
}

beforeAll(async () => {
  testApp = await buildTestApp();
  const [admin] = await db
    .select({
      passwordHash: schema.users.passwordHash,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.users)
    .where(eq(schema.users.username, "admin"));
  originalAdmin = admin;
});

afterEach(async () => {
  Object.assign(env, originalEnv);
  await db.update(schema.users).set(originalAdmin).where(eq(schema.users.username, "admin"));
});

afterAll(async () => {
  await testApp.cleanup();
});

describe("defaultCredentialsActive on /api/v1/config/auth", () => {
  it("is true on a fresh install still using admin / admin", async () => {
    useShippedEnv();
    await setAdmin("admin", true);

    expect((await fetchAuthConfig()).defaultCredentialsActive).toBe(true);
  });

  it("turns false once the admin changes the password", async () => {
    useShippedEnv();
    await setAdmin("admin", true);
    expect((await fetchAuthConfig()).defaultCredentialsActive).toBe(true);

    await setAdmin("ANewPassword1", false);

    expect((await fetchAuthConfig()).defaultCredentialsActive).toBe(false);
  });

  it("is false after an admin reset, which sets mustChangePassword with another password", async () => {
    useShippedEnv();
    await setAdmin("ResetByAdmin1", true);

    expect((await fetchAuthConfig()).defaultCredentialsActive).toBe(false);
  });

  it("is false when the operator set their own DEFAULT_PASSWORD", async () => {
    useShippedEnv();
    env.DEFAULT_PASSWORD = "OperatorChoice1";
    await setAdmin("OperatorChoice1", true);

    const config = await fetchAuthConfig();
    expect(config.defaultCredentialsActive).toBe(false);
    expect(JSON.stringify(config)).not.toContain("OperatorChoice1");
  });

  it("is false when the operator set their own DEFAULT_USERNAME", async () => {
    useShippedEnv();
    env.DEFAULT_USERNAME = "owner";
    await setAdmin("admin", true);

    expect((await fetchAuthConfig()).defaultCredentialsActive).toBe(false);
  });

  it("is false when SKIP_MUST_CHANGE_PASSWORD opted out of the first-login flow", async () => {
    useShippedEnv();
    env.SKIP_MUST_CHANGE_PASSWORD = true;
    await setAdmin("admin", false);

    expect((await fetchAuthConfig()).defaultCredentialsActive).toBe(false);
  });

  it("is left out when auth is disabled", async () => {
    useShippedEnv();
    env.AUTH_ENABLED = false;
    await setAdmin("admin", true);

    expect(await fetchAuthConfig()).not.toHaveProperty("defaultCredentialsActive");
  });
});
