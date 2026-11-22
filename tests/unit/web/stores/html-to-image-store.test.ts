// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  formatHeaders: vi.fn((headers: HeadersInit) => new Headers(headers)),
}));

vi.mock("@/lib/cancel-abandoned-job", () => ({
  cancelAbandonedJob: vi.fn(async () => {}),
}));

class FakeEventSource {
  static OPEN = 1;
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readyState = FakeEventSource.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emit(frame: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  close() {
    this.readyState = 2;
  }
}
vi.stubGlobal("EventSource", FakeEventSource);

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { en, type TranslationKeys } from "@snapotter/shared";
import { formatHeaders } from "@/lib/api";
import { cancelAbandonedJob } from "@/lib/cancel-abandoned-job";
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

function acceptedJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 202,
    json: () => Promise.resolve(data),
  } as Response);
}

/** Let the store's awaited fetch and JSON parse run up to the stream. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
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
    vi.mocked(cancelAbandonedJob).mockClear();
    FakeEventSource.instances = [];
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
      clientJobId: expect.any(String),
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

  it("shows the capture fallback for failed captures and keeps the server reason out of the UI", async () => {
    state().setUrl("https://example.com");
    fetchMock.mockResolvedValueOnce(await failJson({ details: "Invalid URL" }));
    await state().capture();
    expect(state().error).toBe("Capture failed");

    fetchMock.mockResolvedValueOnce(await failJson({ error: "Timed out" }));
    await state().capture();
    expect(state().error).toBe("Capture failed");

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

  it("rejects malformed 2xx capture responses and normalizes omitted processedSize (#3142)", async () => {
    state().setUrl("https://example.com");
    const badPayloads: unknown[] = [
      null,
      [],
      {},
      { downloadUrl: "" },
      { downloadUrl: 123 },
      { downloadUrl: "/out.png", processedSize: "100" },
      { downloadUrl: "/out.png", processedSize: -1 },
      { downloadUrl: "/out.png", processedSize: Number.NaN },
    ];

    for (const payload of badPayloads) {
      useHtmlToImageStore.setState({
        resultUrl: "/old.png",
        resultSize: 50,
        error: null,
      });
      fetchMock.mockResolvedValueOnce(await okJson(payload));

      await state().capture();

      expect(state().error).toBe(en.errors.invalidServerResponse);
      expect(state().resultUrl).toBeNull();
      expect(state().resultSize).toBeNull();
      expect(state().capturing).toBe(false);
    }

    const customT: TranslationKeys = {
      ...en,
      errors: { ...en.errors, invalidServerResponse: "Ungueltige Antwort vom Server" },
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    } as Response);
    await state().capture(customT);
    expect(state().error).toBe("Ungueltige Antwort vom Server");
    expect(state().resultUrl).toBeNull();
    expect(state().resultSize).toBeNull();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new TypeError("Stream disconnected")),
    } as Response);
    await state().capture();
    expect(state().error).toBe("Stream disconnected");

    fetchMock.mockResolvedValueOnce(await okJson({ downloadUrl: "/out.png" }));
    await state().capture();
    expect(state().error).toBeNull();
    expect(state().resultUrl).toBe("/out.png");
    expect(state().resultSize).toBeNull();
  });

  describe("queued capture (202, #4337)", () => {
    async function startQueued(accepted: Record<string, unknown> = {}) {
      state().setUrl("https://example.com");
      fetchMock.mockResolvedValueOnce(await acceptedJson({ async: true, ...accepted }));
      const run = state().capture();
      await flush();
      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      return { run, clientJobId: body.clientJobId as string };
    }

    it("follows the job's progress stream to its result", async () => {
      const { run } = await startQueued({ jobId: "run-1", progressJobId: "run-1" });

      expect(FakeEventSource.instances).toHaveLength(1);
      const es = FakeEventSource.instances[0];
      expect(es.url).toBe("/api/v1/jobs/run-1/progress");
      expect(state()).toMatchObject({ capturing: true, queued: true });

      es.emit({ type: "single", phase: "processing", percent: 40 });
      expect(state().progress).toBe(40);

      es.emit({
        type: "single",
        phase: "complete",
        result: {
          jobId: "art-1",
          downloadUrl: "/api/v1/download/art-1/screenshot.png",
          processedSize: 77,
        },
      });
      await run;

      expect(es.readyState).toBe(2);
      expect(state()).toMatchObject({
        capturing: false,
        queued: false,
        progress: null,
        resultUrl: "/api/v1/download/art-1/screenshot.png",
        resultSize: 77,
        error: null,
      });
      expect(cancelAbandonedJob).not.toHaveBeenCalled();
    });

    it("falls back to its own clientJobId when the 202 names no job", async () => {
      const { run, clientJobId } = await startQueued();
      const es = FakeEventSource.instances[0];
      expect(es.url).toBe(`/api/v1/jobs/${clientJobId}/progress`);
      es.emit({ type: "single", phase: "complete", result: { downloadUrl: "/out.png" } });
      await run;
      expect(state().resultUrl).toBe("/out.png");
    });

    it("shows the capture fallback for a failed job and the canceled text for a canceled one", async () => {
      let started = await startQueued({ jobId: "run-2" });
      FakeEventSource.instances[0].emit({
        type: "single",
        phase: "failed",
        error: "Page took too long to load",
      });
      await started.run;
      expect(state()).toMatchObject({ capturing: false, error: "Capture failed" });

      fetchMock.mockReset();
      started = await startQueued({ jobId: "run-3" });
      FakeEventSource.instances[1].emit({
        type: "single",
        phase: "failed",
        error: "Canceled",
        code: "CANCELED",
      });
      await started.run;
      expect(state().error).toBe(en.errors.canceled);
    });

    it("rejects a completed frame with nothing to download", async () => {
      const { run } = await startQueued({ jobId: "run-4" });
      FakeEventSource.instances[0].emit({ type: "single", phase: "complete", result: {} });
      await run;
      expect(state().error).toBe(en.errors.invalidServerResponse);
    });

    it("cancel stops the stream and cancels the server job", async () => {
      const { run } = await startQueued({ jobId: "run-5", progressJobId: "run-5" });
      const es = FakeEventSource.instances[0];

      state().cancel();
      await run;

      expect(es.readyState).toBe(2);
      expect(cancelAbandonedJob).toHaveBeenCalledWith("run-5", "html-to-image");
      expect(state()).toMatchObject({ capturing: false, queued: false, error: null });

      es.emit({ type: "single", phase: "complete", result: { downloadUrl: "/late.png" } });
      expect(state().resultUrl).toBeNull();
    });

    it("reset cancels a queued job too", async () => {
      const { run } = await startQueued({ jobId: "run-6" });
      state().reset();
      await run;
      expect(cancelAbandonedJob).toHaveBeenCalledWith("run-6", "html-to-image");
      expect(state().capturing).toBe(false);
    });

    it("gives up and cancels the job when the stream goes quiet", async () => {
      vi.useFakeTimers();
      try {
        const { run } = await startQueued({ jobId: "run-7" });
        await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);
        await run;
        expect(state().error).toBe(en.errors.jobTrackingFailed);
        expect(cancelAbandonedJob).toHaveBeenCalledWith("run-7", "html-to-image");
      } finally {
        vi.useRealTimers();
      }
    });

    describe("a stop before the server answers (#5115)", () => {
      /** Start a capture whose fetch stays pending until `answer` is called. */
      function startPending() {
        state().setUrl("https://example.com");
        let answer!: (res: Response) => void;
        fetchMock.mockImplementationOnce(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((resolve, reject) => {
              answer = resolve;
              init.signal?.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              );
            }),
        );
        const run = state().capture();
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        return { run, clientJobId: body.clientJobId as string, answer: (r: Response) => answer(r) };
      }

      it("cancels by clientJobId once a late 202 shows the job was queued", async () => {
        const { run, clientJobId, answer } = startPending();
        state().reset();
        expect(state().capturing).toBe(false);
        expect(cancelAbandonedJob).not.toHaveBeenCalled();

        answer(await acceptedJson({ async: true, jobId: "run-8" }));
        await run;

        expect(cancelAbandonedJob).toHaveBeenCalledTimes(1);
        expect(cancelAbandonedJob).toHaveBeenCalledWith(clientJobId, "html-to-image");
        expect(FakeEventSource.instances).toHaveLength(0);
        expect(state()).toMatchObject({ capturing: false, queued: false, resultUrl: null });
      });

      it("cancel works the same way", async () => {
        const { run, clientJobId, answer } = startPending();
        state().cancel();
        answer(await acceptedJson({ async: true }));
        await run;
        expect(cancelAbandonedJob).toHaveBeenCalledWith(clientJobId, "html-to-image");
        expect(FakeEventSource.instances).toHaveLength(0);
      });

      it("still cancels when the stop lands while the 202 body is being read", async () => {
        state().setUrl("https://example.com");
        let finishBody!: (data: unknown) => void;
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 202,
          json: () =>
            new Promise((resolve) => {
              finishBody = resolve;
            }),
        } as Response);
        const run = state().capture();
        await flush();
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

        state().reset();
        finishBody({ async: true, jobId: "run-10" });
        await run;

        expect(cancelAbandonedJob).toHaveBeenCalledWith(body.clientJobId, "html-to-image");
        expect(FakeEventSource.instances).toHaveLength(0);
      });

      it("leaves a job that finished inside the sync window alone", async () => {
        const { run, answer } = startPending();
        state().reset();
        answer(await okJson({ downloadUrl: "/late.png", processedSize: 1 }));
        await run;
        expect(cancelAbandonedJob).not.toHaveBeenCalled();
        expect(state().resultUrl).toBeNull();
      });

      it("does not let a stopped run's answer touch the next capture", async () => {
        const first = startPending();
        state().cancel();
        fetchMock.mockResolvedValueOnce(await acceptedJson({ async: true, jobId: "run-9" }));
        const second = state().capture();
        await flush();
        const es = FakeEventSource.instances[0];
        expect(es.url).toBe("/api/v1/jobs/run-9/progress");

        first.answer(await acceptedJson({ async: true }));
        await first.run;
        expect(cancelAbandonedJob).toHaveBeenCalledTimes(1);
        expect(cancelAbandonedJob).toHaveBeenCalledWith(first.clientJobId, "html-to-image");
        expect(state()).toMatchObject({ capturing: true, queued: true });

        es.emit({ type: "single", phase: "complete", result: { downloadUrl: "/second.png" } });
        await second;
        expect(state().resultUrl).toBe("/second.png");
        expect(cancelAbandonedJob).toHaveBeenCalledTimes(1);
      });
    });

    it("does not cancel anything after a capture that finished inside the sync window", async () => {
      fetchMock.mockResolvedValueOnce(await okJson({ downloadUrl: "/out.png", processedSize: 1 }));
      state().setUrl("https://example.com");
      await state().capture();
      state().reset();
      expect(cancelAbandonedJob).not.toHaveBeenCalled();
      expect(FakeEventSource.instances).toHaveLength(0);
    });
  });
});
