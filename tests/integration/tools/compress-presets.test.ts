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

describe("compress-image-to-N-kb presets", () => {
  // Both fixtures are ~80-90 KB, so every target forces real compression work.
  // The isolated PNG at 50 KB came back at 50,275 bytes when KB meant 1024
  // bytes, which is what pins the decimal-KB contract here (#1272).
  it.each([
    ["compress-image-to-20kb", 20, fixtures.image.portrait.jpg, "input.jpg", "image/jpeg"],
    ["compress-image-to-50kb", 50, fixtures.image.portrait.jpg, "input.jpg", "image/jpeg"],
    ["compress-image-to-50kb", 50, fixtures.image.portrait.isolated, "input.png", "image/png"],
  ])(
    "%s (%s KB, %s) lands under its locked target even when settings ask for max quality",
    async (toolId, targetKb, fixturePath, filename, mime) => {
      const input = readFixture(fixturePath);
      const { body, contentType } = createMultipartPayload([
        { name: "file", filename, contentType: mime, content: input },
        { name: "settings", content: JSON.stringify({ mode: "quality", quality: 100 }) },
      ]);
      const res = await testApp.app.inject({
        method: "POST",
        url: `/api/v1/tools/image/${toolId}`,
        headers: { authorization: `Bearer ${token}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode, res.body.slice(0, 500)).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.originalSize).toBe(input.length);
      expect(json.processedSize).toBeGreaterThan(0);
      expect(json.processedSize).toBeLessThanOrEqual(targetKb * 1000);
    },
    60_000,
  );
});
