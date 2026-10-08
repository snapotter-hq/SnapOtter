/**
 * #2177: a tool request whose settings carry a NUL in an object key, or a lone
 * UTF-16 surrogate in a key or string, answered 500 because Postgres jsonb
 * refuses both and the jobs insert failed. Nightly Schemathesis found it on
 * histogram, the one tool schema that keeps unknown keys. The request is now
 * accepted and the stored copy of the settings is made storable.
 *
 * Status only for the old failure: the test server skips the production error
 * handler (#1243), so a 500 body here is Fastify's default, SQL text included.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

const NUL = String.fromCharCode(0);
const LONE_HIGH = String.fromCharCode(0xd800);
const REPLACEMENT = String.fromCharCode(0xfffd);

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
}, 10_000);

async function post(tool: string, settings: unknown) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test.png", contentType: "image/png", content: PNG },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return app.inject({
    method: "POST",
    url: `/api/v1/tools/image/${tool}`,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

async function storedSettings(jobId: string) {
  const [row] = await db
    .select({ settings: schema.jobs.settings })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));
  return row?.settings as Record<string, unknown> | undefined;
}

describe("settings Postgres cannot store (#2177)", () => {
  it.each([
    ["a plain key and value", { a: "ok" }, { a: "ok" }],
    ["a NUL in a value", { a: `x${NUL}y` }, { a: "xy" }],
    ["a NUL in a key", { [`a${NUL}b`]: 1 }, { ab: 1 }],
    ["a lone surrogate in a value", { a: LONE_HIGH }, { a: REPLACEMENT }],
    ["a lone surrogate in a key", { [`k${LONE_HIGH}`]: 1 }, { [`k${REPLACEMENT}`]: 1 }],
  ])("histogram accepts %s and stores a clean copy", async (_name, settings, expected) => {
    const res = await post("histogram", settings);

    expect(res.statusCode).toBe(200);
    const { jobId } = JSON.parse(res.body);
    expect(await storedSettings(jobId)).toMatchObject(expected);
  });

  it("does not stop at histogram: a lone surrogate in a free-text field is accepted too", async () => {
    // Watermark text is a field the schema accepts, so this reaches the same
    // insert without relying on passthrough keys.
    const res = await post("watermark-text", { text: `Sample ${LONE_HIGH}` });

    expect(res.statusCode).not.toBe(500);
    const { jobId } = JSON.parse(res.body);
    expect(await storedSettings(jobId)).toMatchObject({ text: `Sample ${REPLACEMENT}` });
  });
});
