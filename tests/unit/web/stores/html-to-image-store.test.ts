// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  formatHeaders: vi.fn((headers: HeadersInit) => new Headers(headers)),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { formatHeaders } from "@/lib/api";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";

const DEFAULT_STATE = useHtmlToImageStore.getState();

function state() {
  return useHtmlToImageStore.getState();
}

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

function failJson(data: unknown) {
  return Promise.resolve({
    ok: false,
    json: () => Promise.resolve(data),
  } as Response);
}

describe("useHtmlToImageStore", () => {
  beforeEach(() => {
    useHtmlToImageStore.setState({ ...DEFAULT_STATE }, true);
    fetchMock.mockReset();
    vi.mocked(formatHeaders).mockClear();
  });

  it("clears stale errors when switching input mode and editing input", () => {
    useHtmlToImageStore.setState({ error: "old error" });

    state().setMode("html");
    expect(state().mode).toBe("html");
    expect(state().error).toBeNull();

    useHtmlToImageStore.setState({ error: "old error" });
    state().setHtmlContent("<main>Test</main>");
    expect(state().htmlContent).toBe("<main>Test</main>");
    expect(state().error).toBeNull();

    useHtmlToImageStore.setState({ error: "old error" });
    state().setUrl("https://example.com");
    expect(state().url).toBe("https://example.com");
    expect(state().error).toBeNull();
  });

  it("updates capture settings without clearing unrelated state", () => {
    state().setFormat("webp");
    state().setQuality(82);
    state().setFullPage(true);
    state().setDevicePreset("custom");
    state().setViewportWidth(390);
    state().setViewportHeight(844);

    expect(state()).toMatchObject({
      format: "webp",
      quality: 82,
      fullPage: true,
      devicePreset: "custom",
      viewportWidth: 390,
      viewportHeight: 844,
    });
  });

  it("does not capture when the current mode has no input", async () => {
    await state().capture();
    expect(fetchMock).not.toHaveBeenCalled();

    state().setMode("html");
    state().setUrl("https://example.com");
    await state().capture();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not start a second capture while already capturing", async () => {
    state().setUrl("https://example.com");
    useHtmlToImageStore.setState({ capturing: true });

    await state().capture();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts URL capture options and stores successful result metadata", async () => {
    fetchMock.mockResolvedValueOnce(
      await okJson({ downloadUrl: "/downloads/result.png", processedSize: 1234 }),
    );
    state().setUrl("https://example.com");
    state().setFormat("jpg");
    state().setQuality(75);
    state().setFullPage(true);
    state().setDevicePreset("mobile");
    state().setViewportWidth(414);
    state().setViewportHeight(896);

    await state().capture();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/tools/image/html-to-image");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      url: "https://example.com",
      format: "jpg",
      quality: 75,
      fullPage: true,
      devicePreset: "mobile",
      viewportWidth: 414,
      viewportHeight: 896,
    });
    expect(state().resultUrl).toBe("/downloads/result.png");
    expect(state().resultSize).toBe(1234);
    expect(state().capturing).toBe(false);
    expect(state().error).toBeNull();
  });

  it("posts HTML content instead of URL in html mode", async () => {
    fetchMock.mockResolvedValueOnce(await okJson({ downloadUrl: "/out.png", processedSize: 10 }));
    state().setMode("html");
    state().setHtmlContent("<h1>Hello</h1>");

    await state().capture();

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(options.body as string)).toMatchObject({
      html: "<h1>Hello</h1>",
      format: "png",
    });
    expect(JSON.parse(options.body as string)).not.toHaveProperty("url");
  });

  it("prefers details then error then fallback text for failed captures", async () => {
    state().setUrl("https://example.com");
    fetchMock.mockResolvedValueOnce(await failJson({ details: "Invalid URL" }));
    await state().capture();
    expect(state().error).toBe("Invalid URL");

    fetchMock.mockResolvedValueOnce(await failJson({ error: "Timed out" }));
    await state().capture();
    expect(state().error).toBe("Timed out");

    fetchMock.mockResolvedValueOnce(await failJson({}));
    await state().capture();
    expect(state().error).toBe("Capture failed");
  });

  it("stores network error messages and non-Error fallback text", async () => {
    state().setUrl("https://example.com");
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await state().capture();
    expect(state().error).toBe("Network down");
    expect(state().capturing).toBe(false);

    fetchMock.mockRejectedValueOnce("offline");
    await state().capture();
    expect(state().error).toBe("Network error");
    expect(state().capturing).toBe(false);
  });

  it("reset restores defaults after a completed capture", async () => {
    fetchMock.mockResolvedValueOnce(await okJson({ downloadUrl: "/out.png", processedSize: 10 }));
    state().setMode("html");
    state().setHtmlContent("<p>Done</p>");
    state().setQuality(40);
    await state().capture();

    state().reset();

    expect(state()).toMatchObject({
      mode: "url",
      url: "",
      htmlContent: "",
      format: "png",
      quality: 90,
      fullPage: false,
      devicePreset: "desktop",
      viewportWidth: 1280,
      viewportHeight: 720,
      capturing: false,
      resultUrl: null,
      resultSize: null,
      error: null,
    });
  });
});
