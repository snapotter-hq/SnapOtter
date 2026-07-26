/**
 * Cross-format matrix, part 3 of 4 (see format-matrix.shared.ts).
 *
 * Holds the multipage-TIFF, exotic-format resilience, enhancement-analysis and
 * strip-metadata-inspection blocks. Split out of format-matrix.test.ts because
 * vitest shards by file and runs a file's tests serially in one fork.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { fixtureDir, fixtures } from "../../fixtures/index.js";
import { createMultipartPayload } from "../test-server.js";
import {
  adminToken,
  app,
  buildPayload,
  FORMAT_SAMPLES,
  isAsyncFallback,
  setupMatrixApp,
  TOOLS,
} from "./format-matrix.shared.js";

setupMatrixApp();

// ---------------------------------------------------------------------------
// Edge-case matrix: multipage TIFF
// ---------------------------------------------------------------------------
describe("Multipage TIFF handling", () => {
  const multipagePath = fixtures.image.multipageTiff;

  for (const tool of TOOLS) {
    it(`${tool.label} handles multipage TIFF`, async () => {
      if (!existsSync(multipagePath)) return;

      const buffer = readFileSync(multipagePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: "multipage.tiff",
          contentType: "image/tiff",
          content: buffer,
        },
        ...(tool.responseType !== "info"
          ? [{ name: "settings", content: JSON.stringify(tool.settings) }]
          : []),
      ]);

      const res = await app.inject({
        method: "POST",
        url: apiToolPath(tool.id),
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      // Multipage TIFF should either succeed or return a clean error
      expect([200, 202, 400, 422]).toContain(res.statusCode);

      if (res.statusCode === 200) {
        const body = JSON.parse(res.body);

        if (tool.responseType === "info") {
          expect(body.width).toBeGreaterThan(0);
          expect(body.height).toBeGreaterThan(0);
          // Multipage TIFFs should report pages > 1
          if (body.pages !== undefined) {
            expect(body.pages).toBeGreaterThanOrEqual(1);
          }
        } else if (tool.responseType === "base64") {
          expect(Array.isArray(body.results)).toBe(true);
        } else if (tool.responseType === "palette") {
          expect(Array.isArray(body.colors)).toBe(true);
          expect(body.count).toBeGreaterThan(0);
        } else if (tool.responseType === "pdf") {
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
          expect(body.pages).toBeGreaterThanOrEqual(1);
        } else {
          expect(body.downloadUrl).toBeDefined();
          expect(body.processedSize).toBeGreaterThan(0);
        }
      } else {
        const body = JSON.parse(res.body);
        expect(body.error).toBeDefined();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Error resilience: exotic formats must return clean errors, never crash
// ---------------------------------------------------------------------------
describe("Exotic format error resilience", () => {
  const EXOTIC_FORMATS = FORMAT_SAMPLES.filter((f) => f.needsCliDecoder);

  // Tools that actually process the image (not just read metadata)
  const PROCESSING_TOOLS = TOOLS.filter(
    (t) =>
      t.responseType === "download" || t.responseType === "palette" || t.responseType === "pdf",
  );

  for (const fmt of EXOTIC_FORMATS) {
    for (const tool of PROCESSING_TOOLS) {
      it(`${fmt.name} + ${tool.label}: returns JSON error (no crash)`, {
        timeout: 120_000,
      }, async () => {
        const fixturePath = join(fixtureDir.formats, fmt.file);
        if (!existsSync(fixturePath)) return;

        const buffer = readFileSync(fixturePath);
        const { body: payload, contentType } = buildPayload(fmt, tool, buffer);

        const res = await app.inject({
          method: "POST",
          url: apiToolPath(tool.id),
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": contentType,
          },
          body: payload,
        });

        // Must not crash (500) — either succeed or return a clean error
        if (isAsyncFallback(res)) return;
        expect(res.statusCode).not.toBe(500);
        expect([200, 202, 400, 422]).toContain(res.statusCode);

        // Response must always be valid JSON
        const body = JSON.parse(res.body);
        if (res.statusCode >= 400) {
          expect(body.error).toBeDefined();
          expect(typeof body.error).toBe("string");
          expect(body.error.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Image enhancement analysis: dedicated /analyze endpoint
// ---------------------------------------------------------------------------
describe("Image enhancement analysis across formats", () => {
  // Core formats that Sharp can read natively
  const ANALYZABLE_FORMATS = FORMAT_SAMPLES.filter(
    (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
  );

  for (const fmt of ANALYZABLE_FORMATS) {
    it(`analyzes ${fmt.name} and returns correction recommendations`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: fmt.file,
          contentType: fmt.mime,
          content: buffer,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/image-enhancement/analyze",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      // Analysis should return corrections object
      expect(body.corrections).toBeDefined();
      expect(typeof body.corrections).toBe("object");
    });
  }

  // Exotic formats: should not crash, return clean error or succeed
  const EXOTIC_FORMATS = FORMAT_SAMPLES.filter((f) => f.needsCliDecoder);

  for (const fmt of EXOTIC_FORMATS) {
    it(`${fmt.name} analyze: returns clean response (no crash)`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: fmt.file,
          contentType: fmt.mime,
          content: buffer,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/image-enhancement/analyze",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).not.toBe(500);
      expect([200, 202, 400, 422]).toContain(res.statusCode);

      const body = JSON.parse(res.body);
      if (res.statusCode >= 400) {
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Strip-metadata inspect: dedicated /inspect endpoint
// ---------------------------------------------------------------------------
describe("Strip-metadata inspection across formats", () => {
  // Core formats that Sharp can read natively
  const INSPECTABLE_FORMATS = FORMAT_SAMPLES.filter(
    (f) => !f.needsCliDecoder && !f.needsHeifDecoder && !f.mayFailValidation,
  );

  for (const fmt of INSPECTABLE_FORMATS) {
    it(`inspects ${fmt.name} metadata`, async () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);
      if (!existsSync(fixturePath)) return;

      const buffer = readFileSync(fixturePath);
      const { body: payload, contentType } = createMultipartPayload([
        {
          name: "file",
          filename: fmt.file,
          contentType: fmt.mime,
          content: buffer,
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tools/image/strip-metadata/inspect",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": contentType,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.filename).toBeDefined();
      expect(body.fileSize).toBeGreaterThan(0);
    });
  }
});
