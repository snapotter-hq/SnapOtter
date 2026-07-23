import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qpdfAvailable, qpdfPageCount } from "@snapotter/doc-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF = readFixture(fixtures.document.pdf3);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "test-3page.pdf", contentType: "application/pdf", content: PDF },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/rotate-pdf",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe.skipIf(!qpdfAvailable())("rotate-pdf (requires qpdf)", () => {
  it("rotates 90 degrees and preserves page count", async () => {
    const res = await runTool({ angle: 90 });
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({
      method: "GET",
      url: envelope.downloadUrl,
    });
    expect(dl.statusCode).toBe(200);

    // Write downloaded PDF to temp and verify page count
    const dir = mkdtempSync(join(tmpdir(), "rotate-pdf-test-"));
    try {
      const outPath = join(dir, "rotated.pdf");
      writeFileSync(outPath, dl.rawPayload);
      const pages = await qpdfPageCount(outPath);
      expect(pages).toBe(3);

      // Verify pages were actually rotated to the requested 90 degrees.
      // qpdf 12 --json exposes each page's rotation as a "/Rotate" key.
      const jsonRaw = execFileSync("qpdf", ["--json", outPath], {
        encoding: "utf8",
        maxBuffer: 1 << 24,
      });
      const parsed = JSON.parse(jsonRaw) as Record<string, unknown>;

      // Collect every "/Rotate" integer found under the page objects.
      const rotations: number[] = [];
      const visit = (node: unknown): void => {
        if (Array.isArray(node)) {
          for (const item of node) visit(item);
          return;
        }
        if (node && typeof node === "object") {
          const obj = node as Record<string, unknown>;
          const rotate = obj["/Rotate"];
          if (typeof rotate === "number") rotations.push(rotate);
          for (const value of Object.values(obj)) visit(value);
        }
      };
      const pageList = (parsed.pages ?? []) as unknown[];
      visit(pageList);

      if (rotations.length > 0) {
        // Every rotated page must report the requested 90-degree rotation.
        expect(rotations.length).toBe(3);
        for (const rotate of rotations) {
          expect(rotate).toBe(90);
        }
      } else {
        // Fallback: qpdf nested the rotation elsewhere; assert the raw JSON
        // carries one "/Rotate": 90 entry per page.
        const matches = jsonRaw.match(/"\/Rotate":\s*90\b/g) ?? [];
        expect(matches.length).toBe(3);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects an invalid page range with 400", async () => {
    const res = await runTool({ angle: 90, range: "abc;x" });
    // Schema-level regex validation returns 400
    expect(res.statusCode).toBe(400);
  }, 60_000);
});
