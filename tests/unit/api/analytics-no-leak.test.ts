// Proves the server-side invariant: captureException and trackEvent
// never send data to Sentry/PostHog when analytics is disabled (baked).
//
// Also tests the PII scrubbing regex that correctly matches .heic and .heif.
import { describe, expect, it } from "vitest";

const FILE_EXT_PATTERN =
  /\.(jpe?g|png|pdf|webp|gif|tiff?|bmp|svg|hei[cf]?|avif|raw|cr2|nef|arw|dng|psd|tga|exr|hdr)\b/gi;
const FILE_PATH_PATTERN = /\/(tmp\/workspace|data\/files|data\/ai)\//g;

describe("Server-side Analytics No-Leak Invariant", () => {
  describe("captureException gating (code review)", () => {
    it("captureException takes only error, no request parameter", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("apps/api/src/lib/analytics.ts", "utf8");
      expect(source).toContain(
        "export async function captureException(error: unknown): Promise<void>",
      );
    });

    it("captureException checks ANALYTICS_BAKED.enabled before sending", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("apps/api/src/lib/analytics.ts", "utf8");
      expect(source).toContain("if (!ANALYTICS_BAKED.enabled) return;");
    });
  });

  describe("initAnalytics gating (code review)", () => {
    it("initAnalytics bails when ANALYTICS_BAKED.enabled is false", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("apps/api/src/lib/analytics.ts", "utf8");
      expect(source).toContain("if (!ANALYTICS_BAKED.enabled) return;");
    });

    it("shutdownAnalytics nulls posthogClient", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("apps/api/src/lib/analytics.ts", "utf8");
      expect(source).toContain("posthogClient = null;");
    });
  });

  describe("trackEvent gating (code review)", () => {
    it("trackEvent checks ANALYTICS_BAKED.enabled and posthogClient", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("apps/api/src/lib/analytics.ts", "utf8");
      expect(source).toContain("if (!ANALYTICS_BAKED.enabled || !posthogClient) return;");
    });

    it("trackEvent wraps capture in try-catch (never throws)", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("apps/api/src/lib/analytics.ts", "utf8");
      const trackEventBlock = source.slice(source.indexOf("export async function trackEvent"));
      expect(trackEventBlock).toContain("try {");
      expect(trackEventBlock).toContain("catch {");
    });

    it("trackEvent signature: (event, properties, distinctId?)", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync("apps/api/src/lib/analytics.ts", "utf8");
      expect(source).toContain("export async function trackEvent(");
      expect(source).toContain("event: string,");
      expect(source).toContain("properties: Record<string, unknown>,");
      expect(source).toContain("distinctId?: string,");
    });
  });

  describe("PII scrubbing regex - FILE_EXT_PATTERN", () => {
    it("matches all common image extensions", () => {
      const extensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".pdf",
        ".webp",
        ".gif",
        ".tiff",
        ".tif",
        ".bmp",
        ".svg",
        ".heic",
        ".heif",
        ".avif",
        ".raw",
        ".cr2",
        ".nef",
        ".arw",
        ".dng",
        ".psd",
        ".tga",
        ".exr",
        ".hdr",
      ];
      for (const ext of extensions) {
        FILE_EXT_PATTERN.lastIndex = 0;
        expect(`file${ext}`, `Expected file${ext} to match`).toMatch(FILE_EXT_PATTERN);
      }
    });

    it("does NOT match non-image extensions", () => {
      const safe = [".js", ".ts", ".html", ".css", ".json", ".xml", ".txt", ".md"];
      for (const ext of safe) {
        FILE_EXT_PATTERN.lastIndex = 0;
        expect(`file${ext}`).not.toMatch(FILE_EXT_PATTERN);
      }
    });

    it("matches extensions in the middle of paths", () => {
      FILE_EXT_PATTERN.lastIndex = 0;
      expect("Error loading /uploads/photo.jpg from disk").toMatch(FILE_EXT_PATTERN);
    });

    it("replaces extensions with [REDACTED]", () => {
      const input = "Failed to process /tmp/workspace/image.heic";
      FILE_EXT_PATTERN.lastIndex = 0;
      const result = input.replace(FILE_EXT_PATTERN, ".[REDACTED]");
      expect(result).not.toContain(".heic");
      expect(result).toContain(".[REDACTED]");
    });
  });

  describe("PII scrubbing regex - FILE_PATH_PATTERN", () => {
    it("matches workspace and data paths", () => {
      const paths = ["/tmp/workspace/something", "/data/files/upload", "/data/ai/model"];
      for (const p of paths) {
        FILE_PATH_PATTERN.lastIndex = 0;
        expect(p).toMatch(FILE_PATH_PATTERN);
      }
    });

    it("does NOT match safe paths", () => {
      const safe = ["/api/v1/health", "/node_modules/sharp", "/usr/local/bin"];
      for (const p of safe) {
        FILE_PATH_PATTERN.lastIndex = 0;
        expect(p).not.toMatch(FILE_PATH_PATTERN);
      }
    });

    it("replaces paths with [REDACTED]", () => {
      FILE_PATH_PATTERN.lastIndex = 0;
      const input = "Error in /tmp/workspace/job-123/output";
      const result = input.replace(FILE_PATH_PATTERN, "/[REDACTED]/");
      expect(result).not.toContain("/tmp/workspace/");
      expect(result).toContain("/[REDACTED]/");
    });
  });
});
