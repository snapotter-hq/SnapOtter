import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTestApp, loginAsAdmin, type TestApp } from "../../test-server.js";

// Mock the browser service -- Chromium may not be available in CI
vi.mock("../../../../apps/api/src/lib/browser-service.js", () => {
  // 1x1 red PNG as a predictable test fixture
  const TEST_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64",
  );
  return {
    isBrowserAvailable: vi.fn().mockReturnValue(true),
    capturePage: vi.fn().mockResolvedValue(TEST_PNG),
    captureHtml: vi.fn().mockResolvedValue(TEST_PNG),
    shutdownBrowser: vi.fn(),
  };
});

// Mock SSRF validation -- test env has no external network
vi.mock("../../../../apps/api/src/lib/ssrf.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    validateFetchUrl: vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Only HTTP and HTTPS URLs are supported");
      }
      const hostname = parsed.hostname;
      if (
        hostname === "localhost" ||
        hostname === "0.0.0.0" ||
        hostname === "127.0.0.1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.16.") ||
        hostname === "[::1]"
      ) {
        throw new Error("URL resolves to a private or reserved IP address");
      }
      return { resolvedIp: "93.184.216.34" };
    }),
  };
});

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

function post(payload: Record<string, unknown>, token?: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/html-to-image",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    payload,
  });
}

describe("HTML to Image", () => {
  describe("happy path", () => {
    it("captures a URL with default settings", async () => {
      const res = await post({ url: "https://example.com" }, adminToken);
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.jobId).toBeDefined();
      expect(result.downloadUrl).toMatch(/^\/api\/v1\/download\//);
      expect(result.originalSize).toBe(0);
      expect(result.processedSize).toBeGreaterThan(0);
    });

    it("returns a downloadable image at the download URL", async () => {
      const res = await post({ url: "https://example.com" }, adminToken);
      const result = JSON.parse(res.body);

      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
      });
      expect(dlRes.statusCode).toBe(200);
    });

    it("accepts jpg format", async () => {
      const res = await post({ url: "https://example.com", format: "jpg" }, adminToken);
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toMatch(/\.jpg$/);
    });

    it("accepts webp format", async () => {
      const res = await post({ url: "https://example.com", format: "webp" }, adminToken);
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toMatch(/\.webp$/);
    });

    it("accepts png format explicitly", async () => {
      const res = await post({ url: "https://example.com", format: "png" }, adminToken);
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toMatch(/\.png$/);
    });

    it("accepts quality parameter", async () => {
      const res = await post(
        { url: "https://example.com", format: "jpg", quality: 50 },
        adminToken,
      );
      expect(res.statusCode).toBe(200);
    });

    it("accepts fullPage parameter", async () => {
      const res = await post({ url: "https://example.com", fullPage: true }, adminToken);
      expect(res.statusCode).toBe(200);
    });

    it("accepts desktop device preset", async () => {
      const res = await post({ url: "https://example.com", devicePreset: "desktop" }, adminToken);
      expect(res.statusCode).toBe(200);
    });

    it("accepts tablet device preset", async () => {
      const res = await post({ url: "https://example.com", devicePreset: "tablet" }, adminToken);
      expect(res.statusCode).toBe(200);
    });

    it("accepts mobile device preset", async () => {
      const res = await post({ url: "https://example.com", devicePreset: "mobile" }, adminToken);
      expect(res.statusCode).toBe(200);
    });

    it("accepts custom viewport dimensions", async () => {
      const res = await post(
        {
          url: "https://example.com",
          devicePreset: "custom",
          viewportWidth: 1920,
          viewportHeight: 1080,
        },
        adminToken,
      );
      expect(res.statusCode).toBe(200);
    });

    it("passes correct options to capturePage", async () => {
      const { capturePage } = await import("../../../../apps/api/src/lib/browser-service.js");
      (capturePage as ReturnType<typeof vi.fn>).mockClear();

      await post(
        {
          url: "https://example.com",
          format: "jpg",
          quality: 75,
          fullPage: true,
          devicePreset: "mobile",
        },
        adminToken,
      );

      expect(capturePage).toHaveBeenCalledWith("https://example.com", {
        format: "jpg",
        quality: 75,
        fullPage: true,
        viewportWidth: 375,
        viewportHeight: 812,
        isMobile: true,
      });
    });
  });

  describe("validation errors (400)", () => {
    it("rejects missing url field", async () => {
      const res = await post({}, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("rejects empty url string", async () => {
      const res = await post({ url: "" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("rejects invalid url", async () => {
      const res = await post({ url: "not-a-url" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("rejects invalid format", async () => {
      const res = await post({ url: "https://example.com", format: "bmp" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("rejects quality below 1", async () => {
      const res = await post({ url: "https://example.com", quality: 0 }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("rejects quality above 100", async () => {
      const res = await post({ url: "https://example.com", quality: 101 }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("rejects viewport width below 320", async () => {
      const res = await post(
        {
          url: "https://example.com",
          devicePreset: "custom",
          viewportWidth: 100,
        },
        adminToken,
      );
      expect(res.statusCode).toBe(400);
    });

    it("rejects viewport width above 3840", async () => {
      const res = await post(
        {
          url: "https://example.com",
          devicePreset: "custom",
          viewportWidth: 5000,
        },
        adminToken,
      );
      expect(res.statusCode).toBe(400);
    });
  });

  describe("SSRF protection (400)", () => {
    it("blocks localhost", async () => {
      const res = await post({ url: "http://localhost/" }, adminToken);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe("URL is not allowed");
    });

    it("blocks 127.0.0.1", async () => {
      const res = await post({ url: "http://127.0.0.1/" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("blocks 192.168.x.x", async () => {
      const res = await post({ url: "http://192.168.1.1/" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("blocks 10.x.x.x", async () => {
      const res = await post({ url: "http://10.0.0.1/" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("blocks 172.16.x.x", async () => {
      const res = await post({ url: "http://172.16.0.1/" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("blocks IPv6 loopback", async () => {
      const res = await post({ url: "http://[::1]/" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("blocks 0.0.0.0", async () => {
      const res = await post({ url: "http://0.0.0.0/" }, adminToken);
      expect(res.statusCode).toBe(400);
    });
  });

  describe("authentication", () => {
    it("returns 401 without auth token", async () => {
      const res = await post({ url: "https://example.com" });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("browser unavailable (503)", () => {
    it("returns 503 when browser is not installed", async () => {
      const { isBrowserAvailable } = await import(
        "../../../../apps/api/src/lib/browser-service.js"
      );
      (isBrowserAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      const res = await post({ url: "https://example.com" }, adminToken);
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body).code).toBe("BROWSER_NOT_AVAILABLE");
    });
  });

  describe("capture errors", () => {
    it("returns 504 on page load timeout", async () => {
      const { capturePage } = await import("../../../../apps/api/src/lib/browser-service.js");
      (capturePage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Timeout 30000ms exceeded"),
      );

      const res = await post({ url: "https://example.com" }, adminToken);
      expect(res.statusCode).toBe(504);
    });

    it("returns 422 on generic capture failure", async () => {
      const { capturePage } = await import("../../../../apps/api/src/lib/browser-service.js");
      (capturePage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("net::ERR_CONNECTION_REFUSED"),
      );

      const res = await post({ url: "https://example.com" }, adminToken);
      expect(res.statusCode).toBe(422);
    });

    it("returns 503 when browser service is crashed", async () => {
      const { capturePage } = await import("../../../../apps/api/src/lib/browser-service.js");
      (capturePage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Browser service permanently disabled after repeated crashes"),
      );

      const res = await post({ url: "https://example.com" }, adminToken);
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body).code).toBe("BROWSER_CRASHED");
    });
  });

  describe("html content mode", () => {
    it("captures HTML content with default settings", async () => {
      const res = await post({ html: "<html><body><h1>Hello</h1></body></html>" }, adminToken);
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.jobId).toBeDefined();
      expect(result.downloadUrl).toMatch(/\.png$/);
    });

    it("rejects empty html string", async () => {
      const res = await post({ html: "" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("rejects when both url and html are provided", async () => {
      const res = await post({ url: "https://example.com", html: "<h1>test</h1>" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("rejects when neither url nor html is provided", async () => {
      const res = await post({ format: "png" }, adminToken);
      expect(res.statusCode).toBe(400);
    });

    it("does not perform SSRF check for html mode", async () => {
      const { validateFetchUrl } = await import("../../../../apps/api/src/lib/ssrf.js");
      (validateFetchUrl as ReturnType<typeof vi.fn>).mockClear();

      await post({ html: "<html><body>test</body></html>" }, adminToken);

      expect(validateFetchUrl).not.toHaveBeenCalled();
    });
  });
});
