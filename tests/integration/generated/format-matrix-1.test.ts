/**
 * Cross-format matrix, part 1 of 2 (see format-matrix.shared.ts).
 *
 * Vitest shards by file and runs a file's tests serially in one fork, so the
 * cross-format matrix is striped across two part files that together cover
 * every entry of FORMAT_SAMPLES exactly once.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiToolPath } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { fixtureDir } from "../../fixtures/index.js";
import {
  ACCEPTABLE_FALLBACK_CODES,
  adminToken,
  app,
  buildPayload,
  formatSamplesForPart,
  isAsyncFallback,
  needsFallback,
  setupMatrixApp,
  TOOLS,
} from "./format-matrix.shared.js";

setupMatrixApp();

// ---------------------------------------------------------------------------
// Cross-format matrix: every tool x every format
// ---------------------------------------------------------------------------
describe("Cross-format matrix", () => {
  for (const fmt of formatSamplesForPart(1)) {
    describe(`${fmt.name} input (${fmt.file})`, () => {
      const fixturePath = join(fixtureDir.formats, fmt.file);

      for (const tool of TOOLS) {
        // Skip "Convert to PNG" when input is already PNG (no-op conversion)
        if (tool.id === "convert" && fmt.name === "PNG") continue;

        const perTestTimeout =
          (fmt.needsHeifDecoder || fmt.needsCliDecoder) && tool.id === "image-enhancement"
            ? 300_000
            : fmt.needsHeifDecoder || fmt.needsCliDecoder
              ? 180_000
              : tool.id === "image-enhancement"
                ? 120_000
                : 60_000; // 2× SYNC_WAIT_MS so a 202 fallback never races the Vitest timeout

        it(
          `${tool.label}`,
          async () => {
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

            // ------------------------------------------------------------------
            // Assert status code
            // ------------------------------------------------------------------
            // A heavy encode may fall back to async (202) under CI load -- accept it.
            if (isAsyncFallback(res)) return;

            if (needsFallback(fmt)) {
              // Formats with optional decoders: accept success or graceful error
              expect(ACCEPTABLE_FALLBACK_CODES).toContain(res.statusCode);
            } else {
              // Core formats must always succeed
              expect(res.statusCode).toBe(200);
            }

            // ------------------------------------------------------------------
            // If successful, validate the response shape
            // ------------------------------------------------------------------
            if (res.statusCode === 200) {
              const body = JSON.parse(res.body);

              switch (tool.responseType) {
                case "download":
                  expect(body.downloadUrl).toBeDefined();
                  expect(typeof body.downloadUrl).toBe("string");
                  expect(body.processedSize).toBeGreaterThan(0);
                  expect(body.originalSize).toBeGreaterThan(0);
                  break;

                case "info":
                  expect(body.width).toBeGreaterThan(0);
                  expect(body.height).toBeGreaterThan(0);
                  expect(body.fileSize).toBeGreaterThan(0);
                  expect(body.format).toBeDefined();
                  expect(body.channels).toBeGreaterThan(0);
                  break;

                case "base64":
                  // image-to-base64 returns { results: [...], errors: [...] }
                  expect(Array.isArray(body.results)).toBe(true);
                  expect(body.results.length + body.errors.length).toBeGreaterThan(0);
                  if (body.results.length > 0) {
                    const r = body.results[0];
                    expect(r.base64).toBeDefined();
                    expect(typeof r.base64).toBe("string");
                    expect(r.base64.length).toBeGreaterThan(0);
                    expect(r.dataUri).toMatch(/^data:/);
                    expect(r.width).toBeGreaterThan(0);
                    expect(r.height).toBeGreaterThan(0);
                  }
                  break;

                case "palette":
                  // color-palette returns { colors: string[], count: number }
                  expect(Array.isArray(body.colors)).toBe(true);
                  expect(body.colors.length).toBeGreaterThan(0);
                  expect(body.count).toBeGreaterThan(0);
                  // Each color should be a hex string
                  for (const color of body.colors) {
                    expect(color).toMatch(/^#[0-9a-f]{6}$/);
                  }
                  break;

                case "pdf":
                  // image-to-pdf returns { downloadUrl, processedSize, pages }
                  expect(body.downloadUrl).toBeDefined();
                  expect(typeof body.downloadUrl).toBe("string");
                  expect(body.processedSize).toBeGreaterThan(0);
                  expect(body.pages).toBeGreaterThanOrEqual(1);
                  break;
              }
            }

            // ------------------------------------------------------------------
            // If the API returned an error, verify it is a clean JSON error
            // (not a raw crash / stack trace / HTML error page)
            // ------------------------------------------------------------------
            if (res.statusCode >= 400) {
              const body = JSON.parse(res.body);
              expect(body.error).toBeDefined();
              expect(typeof body.error).toBe("string");
            }
          },
          perTestTimeout,
        );
      }
    });
  }
});
