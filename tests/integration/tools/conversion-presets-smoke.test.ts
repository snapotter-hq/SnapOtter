import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

let testApp: TestApp;
let token: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  token = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

describe("conversion preset smoke", () => {
  it("jpg-to-png returns a png (fast/200)", async () => {
    const jpg = readFixture(fixtures.image.base.jpg100);
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "a.jpg", contentType: "image/jpeg", content: jpg },
      { name: "settings", content: JSON.stringify({}) },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/tools/image/jpg-to-png",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body,
    });
    expect([200, 202]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const json = JSON.parse(res.body);
      expect(json.downloadUrl).toMatch(/\.png$/);
    }
  });
});
