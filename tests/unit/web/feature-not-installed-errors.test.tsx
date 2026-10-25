// @vitest-environment jsdom

import { en, loadTranslations, SUPPORTED_LOCALES, type TranslationKeys } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  track: vi.fn(),
  getDistinctId: () => null,
}));

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it (same stub as feature-bundle-labels.test.tsx).
// Re-stubbed per test because afterEach unstubs every global.
const storage = new Map<string, string>();
function stubLocalStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
  });
}

import { I18nProvider, useTranslation } from "@/contexts/i18n-context";
import { usePipelineProcessor } from "@/hooks/use-pipeline-processor";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

interface MockXhr {
  status: number;
  responseText: string;
  responseType: string;
  response: unknown;
  timeout: number;
  upload: { onprogress?: unknown; onload?: (() => void) | null };
  onload?: () => void;
  onerror?: (() => void) | null;
  ontimeout?: (() => void) | null;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  getResponseHeader: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

class MockEventSource {
  static OPEN = 1;
  static instances: MockEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockEventSource.OPEN;
  close = vi.fn(() => {
    this.readyState = 2;
  });

  constructor() {
    MockEventSource.instances.push(this);
  }
}

let xhrs: MockXhr[];

// What every AI route answers when the bundle is missing: the English
// server name for the bundle rides along next to its stable id.
const NOT_INSTALLED = {
  error: "Feature not installed",
  code: "FEATURE_NOT_INSTALLED",
  feature: "background-removal",
  featureName: "Background Removal",
  estimatedSize: "4-5 GB",
};

const INCOMPATIBLE = {
  error: "Feature incompatible",
  code: "FEATURE_INCOMPATIBLE",
  feature: "ocr",
  featureName: "OCR",
  estimatedSize: "250 MB",
  requestedQuality: "best",
  compatibilityReason: "unsupported-host",
};

const deBundles = de.featureBundles as TranslationKeys["featureBundles"];
const deErrors = de.errors as TranslationKeys["errors"] & Record<string, string>;
const enErrors = en.errors as TranslationKeys["errors"] & Record<string, string>;

function Provider({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

// renderHook runs before the lazy de module lands; wait for the provider to
// switch before starting a run, so the hook's `t` is the German one.
async function renderInDe<T>(hook: () => T) {
  storage.set("snapotter-locale", "de");
  const view = renderHook(() => ({ value: hook(), t: useTranslation().t }), {
    wrapper: Provider,
  });
  await vi.waitFor(() => expect(view.result.current.t).toBe(de), { timeout: 3_000 });
  return view;
}

function reply(xhr: MockXhr, body: unknown, asBlob: boolean) {
  xhr.status = 501;
  const json = JSON.stringify(body);
  xhr.responseText = json;
  xhr.response = asBlob ? new Blob([json], { type: "application/json" }) : json;
  xhr.onload?.();
}

beforeEach(() => {
  storage.clear();
  stubLocalStorage();
  vi.stubGlobal("URL", {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });
  useFileStore.getState().reset();
  xhrs = [];
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal(
    "XMLHttpRequest",
    vi.fn(() => {
      const xhr: MockXhr = {
        status: 0,
        responseText: "",
        responseType: "",
        response: null,
        timeout: 0,
        upload: {},
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        getResponseHeader: vi.fn(() => null),
        abort: vi.fn(),
      };
      xhrs.push(xhr);
      return xhr;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const expectedToolMessage = () =>
  format(deErrors.featureNotInstalledForTool, {
    tool: de.tools["remove-background"].name,
    feature: deBundles["background-removal"].name,
  });

const expectedPipelineMessage = () =>
  format(deErrors.featureNotInstalled, { feature: deBundles["background-removal"].name });

describe("feature-not-installed errors are translated (#1410)", () => {
  it("has the two message keys in en, naming both placeholders", () => {
    expect(enErrors.featureNotInstalledForTool).toContain("{tool}");
    expect(enErrors.featureNotInstalledForTool).toContain("{feature}");
    expect(enErrors.featureNotInstalled).toContain("{feature}");
  });

  // format() leaves an unknown placeholder in the text, so a translated or
  // dropped token would show users a raw "{feature}" (repo-wide check: #934).
  it("keeps exactly en's placeholders in every locale and omits {status} from status fallbacks", async () => {
    const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of [
      "failedWithStatus",
      "processingFailedWithStatus",
      "requestFailedWithStatus",
      "batchFailedWithStatus",
    ] as const) {
      expect(enErrors[key]).not.toContain("{status}");
    }
    for (const locale of SUPPORTED_LOCALES) {
      const tr = await loadTranslations(locale.code);
      const errors = tr.errors as Record<string, string>;
      for (const key of [
        "featureNotInstalledForTool",
        "featureNotInstalled",
        "featureIncompatible",
        "failedWithStatus",
        "processingFailedWithStatus",
        "requestFailedWithStatus",
        "batchFailedWithStatus",
        "filesFailedSuffix_other",
      ]) {
        expect(tokens(errors[key]), `${locale.code} ${key}`).toEqual(tokens(enErrors[key]));
      }
      expect(tr.toolSettings["image-to-pdf"].creationFailedWithStatus).not.toContain("{status}");
      expect(tr.toolSettings.favicon.generationFailed).not.toContain("{status}");
      expect(tr.toolSettings["passport-photo"].analysisFailedWithStatus).not.toContain("{status}");
      expect(tr.toolSettings["passport-photo"].generationFailedWithStatus).not.toContain(
        "{status}",
      );
      expect(tr.toolSettings["barcode-read"].scanningFailedWithStatus).not.toContain("{status}");
      expect(tr.toolSettings.beautify.processingFailedStatus).not.toContain("{status}");
    }
  });

  it("tool run: names the tool and bundle in the active locale", async () => {
    const file = new File([new ArrayBuffer(16)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const view = await renderInDe(() => useToolProcessor("remove-background"));
    act(() => {
      view.result.current.value.processFiles([file], {});
    });

    act(() => reply(xhrs[0], NOT_INSTALLED, false));

    const error = useFileStore.getState().error;
    expect(error).toBe(expectedToolMessage());
    expect(error).not.toContain("Background Removal");
    expect(error).not.toContain("requires the");
    view.unmount();
  });

  it("tool batch: names the tool and bundle in the active locale", async () => {
    const files = [
      new File([new ArrayBuffer(16)], "a.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "b.png", { type: "image/png" }),
    ];
    useFileStore.getState().setFiles(files);
    const view = await renderInDe(() => useToolProcessor("remove-background"));
    act(() => {
      void view.result.current.value.processAllFiles(files, {});
    });

    act(() => reply(xhrs[0], NOT_INSTALLED, true));

    await vi.waitFor(() => expect(useFileStore.getState().error).toBe(expectedToolMessage()), {
      timeout: 3_000,
    });
    view.unmount();
  });

  it("pipeline run: names the bundle in the active locale", async () => {
    const file = new File([new ArrayBuffer(16)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const view = await renderInDe(() => usePipelineProcessor());
    act(() => {
      view.result.current.value.processSingle(file, [
        { id: "s1", toolId: "remove-background", settings: {} },
      ]);
    });

    act(() => reply(xhrs[0], NOT_INSTALLED, false));

    expect(view.result.current.value.error).toBe(expectedPipelineMessage());
    view.unmount();
  });

  it("pipeline batch: names the bundle in the active locale", async () => {
    const files = [
      new File([new ArrayBuffer(16)], "a.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "b.png", { type: "image/png" }),
    ];
    useFileStore.getState().setFiles(files);
    const view = await renderInDe(() => usePipelineProcessor());
    act(() => {
      void view.result.current.value.processAll(files, [
        { id: "s1", toolId: "remove-background", settings: {} },
      ]);
    });

    act(() => reply(xhrs[0], NOT_INSTALLED, true));

    await vi.waitFor(
      () => expect(view.result.current.value.error).toBe(expectedPipelineMessage()),
      { timeout: 3_000 },
    );
    view.unmount();
  });

  it("falls back to the server's name for a bundle id this client doesn't know", async () => {
    const file = new File([new ArrayBuffer(16)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const view = await renderInDe(() => usePipelineProcessor());
    act(() => {
      view.result.current.value.processSingle(file, [
        { id: "s1", toolId: "remove-background", settings: {} },
      ]);
    });

    act(() =>
      reply(xhrs[0], { ...NOT_INSTALLED, feature: "future-bundle", featureName: "Future" }, false),
    );

    expect(view.result.current.value.error).toBe(
      format(deErrors.featureNotInstalled, { feature: "Future" }),
    );
    view.unmount();
  });
});

const expectedIncompatibleMessage = () =>
  format(deErrors.featureIncompatible, { feature: deBundles.ocr.name });

describe("feature-incompatible errors are translated (#1438)", () => {
  it("has the message key in en, naming the {feature} placeholder", () => {
    expect(enErrors.featureIncompatible).toContain("{feature}");
  });

  it("tool run: names the bundle in the active locale instead of raw server English", async () => {
    const file = new File([new ArrayBuffer(16)], "scan.pdf", { type: "application/pdf" });
    useFileStore.getState().setFiles([file]);
    const view = await renderInDe(() => useToolProcessor("ocr-pdf"));
    act(() => {
      view.result.current.value.processFiles([file], { quality: "best" });
    });

    act(() => reply(xhrs[0], INCOMPATIBLE, false));

    const error = useFileStore.getState().error;
    expect(error).toBe(expectedIncompatibleMessage());
    expect(error).not.toContain("Feature incompatible");
    view.unmount();
  });

  it("tool batch: names the bundle in the active locale", async () => {
    const files = [
      new File([new ArrayBuffer(16)], "a.pdf", { type: "application/pdf" }),
      new File([new ArrayBuffer(16)], "b.pdf", { type: "application/pdf" }),
    ];
    useFileStore.getState().setFiles(files);
    const view = await renderInDe(() => useToolProcessor("ocr-pdf"));
    act(() => {
      void view.result.current.value.processAllFiles(files, { quality: "best" });
    });

    act(() => reply(xhrs[0], INCOMPATIBLE, true));

    await vi.waitFor(
      () => expect(useFileStore.getState().error).toBe(expectedIncompatibleMessage()),
      { timeout: 3_000 },
    );
    view.unmount();
  });

  it("pipeline run: names the bundle in the active locale instead of the step error string", async () => {
    const file = new File([new ArrayBuffer(16)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const view = await renderInDe(() => usePipelineProcessor());
    act(() => {
      view.result.current.value.processSingle(file, [
        { id: "s1", toolId: "ocr", settings: { quality: "best" } },
      ]);
    });

    act(() =>
      reply(
        xhrs[0],
        { ...INCOMPATIBLE, error: 'Step 1 (ocr): Feature "OCR" is incompatible' },
        false,
      ),
    );

    expect(view.result.current.value.error).toBe(expectedIncompatibleMessage());
    expect(view.result.current.value.error).not.toContain("is incompatible");
    view.unmount();
  });

  it("pipeline batch: names the bundle in the active locale", async () => {
    const files = [
      new File([new ArrayBuffer(16)], "a.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "b.png", { type: "image/png" }),
    ];
    useFileStore.getState().setFiles(files);
    const view = await renderInDe(() => usePipelineProcessor());
    act(() => {
      void view.result.current.value.processAll(files, [
        { id: "s1", toolId: "ocr", settings: { quality: "best" } },
      ]);
    });

    act(() =>
      reply(
        xhrs[0],
        { ...INCOMPATIBLE, error: 'Step 1 (ocr): Feature "OCR" is incompatible' },
        true,
      ),
    );

    await vi.waitFor(
      () => expect(view.result.current.value.error).toBe(expectedIncompatibleMessage()),
      { timeout: 3_000 },
    );
    view.unmount();
  });

  it("uses the localized Fast Korean guidance when compatibilityReason is fast-korean-unsupported", async () => {
    const file = new File([new ArrayBuffer(16)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const view = await renderInDe(() => usePipelineProcessor());
    act(() => {
      view.result.current.value.processSingle(file, [
        { id: "s1", toolId: "ocr", settings: { quality: "fast", language: "ko" } },
      ]);
    });

    act(() =>
      reply(
        xhrs[0],
        {
          ...INCOMPATIBLE,
          requestedQuality: "fast",
          compatibilityReason: "fast-korean-unsupported",
          guidance:
            "Fast OCR does not support Korean. Install the Accurate OCR pack and choose Balanced or Best.",
        },
        false,
      ),
    );

    expect(view.result.current.value.error).toBe(de.toolSettings.ocr.fastKoreanUnsupported);
    view.unmount();
  });

  it("falls back to the server's name for a bundle id this client doesn't know", async () => {
    const file = new File([new ArrayBuffer(16)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const view = await renderInDe(() => usePipelineProcessor());
    act(() => {
      view.result.current.value.processSingle(file, [
        { id: "s1", toolId: "ocr", settings: { quality: "best" } },
      ]);
    });

    act(() =>
      reply(xhrs[0], { ...INCOMPATIBLE, feature: "future-bundle", featureName: "Future" }, false),
    );

    expect(view.result.current.value.error).toBe(
      format(deErrors.featureIncompatible, { feature: "Future" }),
    );
    view.unmount();
  });
});

describe("processing hook errors are translated (#1436, #1923)", () => {
  it("tool run: translates invalid 2xx response, status fallback, upload interruption, and upload timeout", async () => {
    const file = new File([new ArrayBuffer(16)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const view = await renderInDe(() => useToolProcessor("resize"));

    act(() => {
      view.result.current.value.processFiles([file], {});
    });
    act(() => {
      xhrs[0].status = 200;
      xhrs[0].responseText = "not-json";
      xhrs[0].onload?.();
    });
    expect(useFileStore.getState().error).toBe(deErrors.invalidServerResponse);
    expect(deErrors.invalidServerResponse).toBeTruthy();

    act(() => {
      view.result.current.value.processFiles([file], {});
    });
    act(() => {
      xhrs[1].status = 500;
      xhrs[1].responseText = "<html>Bad Gateway</html>";
      xhrs[1].onload?.();
    });
    expect(useFileStore.getState().error).toBe(
      format(deErrors.processingFailedWithStatus, { status: 500 }),
    );

    act(() => {
      view.result.current.value.processFiles([file], {});
    });
    act(() => {
      xhrs[2].status = 422;
      xhrs[2].responseText = "{}";
      xhrs[2].onload?.();
    });
    expect(useFileStore.getState().error).toBe(
      format(deErrors.processingFailedWithStatus, { status: 422 }),
    );

    act(() => {
      view.result.current.value.processFiles([file], {});
    });
    act(() => {
      xhrs[3].onerror?.();
    });
    expect(useFileStore.getState().error).toBe(deErrors.processingInterrupted);
    expect(deErrors.processingInterrupted).toBeTruthy();

    act(() => {
      view.result.current.value.processFiles([file], {});
    });
    act(() => {
      xhrs[4].ontimeout?.();
    });
    expect(useFileStore.getState().error).toBe(deErrors.uploadTimeout);
    expect(deErrors.uploadTimeout).toBeTruthy();

    act(() => {
      view.result.current.value.processFiles([], {});
    });
    expect(useFileStore.getState().error).toBe(deErrors.noFilesSelected);

    // #4009: a canceled sync 422 normalizes body.canceled === true to the
    // "Canceled" store sentinel so the hook exposes t.tools.processing.canceled.
    act(() => {
      view.result.current.value.processFiles([file], {});
    });
    act(() => {
      const latestXhr = xhrs.at(-1);
      if (!latestXhr) throw new Error("expected XHR instance");
      latestXhr.status = 422;
      latestXhr.responseText = JSON.stringify({ error: "Batch canceled", canceled: true });
      latestXhr.onload?.();
    });
    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().entries[0]?.error).toBe("Canceled");
    expect(view.result.current.value.error).toBe(de.tools.processing.canceled);

    view.unmount();
  });

  it("tool run: translates SSE failed frame without detail and sync result tracking failure", async () => {
    const file = new File([new ArrayBuffer(16)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const view = await renderInDe(() => useToolProcessor("resize"));

    act(() => {
      view.result.current.value.processFiles([file], {});
    });
    act(() => {
      const es = MockEventSource.instances.at(-1);
      es?.onmessage?.({
        data: JSON.stringify({ type: "single", phase: "failed", error: "" }),
      } as MessageEvent);
    });
    expect(useFileStore.getState().error).toBe(deErrors.processingFailedNoDetail);

    // #1623: buildSingleFileReplayEvent omits error when a failed row has no
    // stored message; the hook must still translate it to processingFailedNoDetail.
    act(() => {
      view.result.current.value.processFiles([file], {});
    });
    act(() => {
      const es = MockEventSource.instances.at(-1);
      es?.onmessage?.({
        data: JSON.stringify({ type: "single", phase: "failed", percent: 0 }),
      } as MessageEvent);
    });
    expect(useFileStore.getState().error).toBe(deErrors.processingFailedNoDetail);

    const origUpdate = useFileStore.getState().updateEntry;
    act(() => {
      view.result.current.value.processFiles([file], {});
    });
    useFileStore.setState({
      updateEntry: () => {
        throw new Error("store write failed");
      },
    });
    try {
      expect(() =>
        act(() => {
          xhrs[2].status = 200;
          xhrs[2].responseText = JSON.stringify({
            jobId: "j1",
            downloadUrl: "/api/v1/download/j1/out.png",
            originalSize: 16,
            processedSize: 12,
          });
          xhrs[2].onload?.();
        }),
      ).toThrow("store write failed");
    } finally {
      useFileStore.setState({ updateEntry: origUpdate });
    }
    expect(useFileStore.getState().error).toBe(deErrors.jobTrackingFailed);

    view.unmount();
  });

  it("tool batch: translates all-files-failed, status fallback, upload error, and upload timeout", async () => {
    const files = [
      new File([new ArrayBuffer(16)], "a.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "b.png", { type: "image/png" }),
    ];
    useFileStore.getState().setFiles(files);
    const view = await renderInDe(() => useToolProcessor("resize"));

    act(() => {
      void view.result.current.value.processAllFiles(files, {});
    });
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].onload?.();
      const es = MockEventSource.instances.at(-1);
      es?.onmessage?.({
        data: JSON.stringify({
          type: "batch",
          status: "failed",
          totalFiles: 2,
          completedFiles: 0,
          failedFiles: 2,
        }),
      } as MessageEvent);
    });
    expect(useFileStore.getState().error).toBe(deErrors.allFilesFailed);
    expect(deErrors.allFilesFailed).toBeTruthy();

    act(() => {
      void view.result.current.value.processAllFiles(files, {});
    });
    act(() => {
      xhrs[1].status = 400;
      xhrs[1].response = "not-json";
      xhrs[1].onload?.();
    });
    await vi.waitFor(
      () =>
        expect(useFileStore.getState().error).toBe(
          format(deErrors.batchFailedWithStatus, { status: 400 }),
        ),
      { timeout: 3_000 },
    );

    act(() => {
      void view.result.current.value.processAllFiles(files, {});
    });
    act(() => {
      xhrs[2].onerror?.();
    });
    expect(useFileStore.getState().error).toBe(deErrors.processingInterrupted);

    act(() => {
      void view.result.current.value.processAllFiles(files, {});
    });
    act(() => {
      xhrs[3].ontimeout?.();
    });
    expect(useFileStore.getState().error).toBe(deErrors.uploadTimeout);

    view.unmount();
  });

  it("pipeline single and batch: translates invalid response, filesFailedSuffix, and upload timeout", async () => {
    const files = [
      new File([new ArrayBuffer(16)], "a.png", { type: "image/png" }),
      new File([new ArrayBuffer(16)], "b.png", { type: "image/png" }),
    ];
    useFileStore.getState().setFiles(files);
    const view = await renderInDe(() => usePipelineProcessor());

    act(() => {
      view.result.current.value.processSingle(files[0], [
        { id: "s1", toolId: "resize", settings: {} },
      ]);
    });
    act(() => {
      xhrs[0].status = 200;
      xhrs[0].responseText = "not-json";
      xhrs[0].onload?.();
    });
    expect(view.result.current.value.error).toBe(deErrors.invalidServerResponse);

    act(() => {
      void view.result.current.value.processAll(files, [
        { id: "s1", toolId: "resize", settings: {} },
      ]);
    });
    act(() => {
      const json = JSON.stringify({
        errors: [
          { filename: "a.png", error: "Kaputt" },
          { filename: "b.png", error: "Kaputt" },
        ],
      });
      xhrs[1].status = 422;
      xhrs[1].response = new Blob([json], { type: "application/json" });
      xhrs[1].onload?.();
    });
    await vi.waitFor(
      () =>
        expect(view.result.current.value.error).toBe(
          `Kaputt${format(deErrors.filesFailedSuffix_other, { count: 2 })}`,
        ),
      { timeout: 3_000 },
    );

    act(() => {
      void view.result.current.value.processAll(files, [
        { id: "s1", toolId: "resize", settings: {} },
      ]);
    });
    act(() => {
      xhrs[2].ontimeout?.();
    });
    expect(view.result.current.value.error).toBe(deErrors.uploadTimeout);

    // #1623: message-less single and batch replay frames omit error text so
    // the pipeline hook translates them in the active locale.
    act(() => {
      view.result.current.value.processSingle(files[0], [
        { id: "s1", toolId: "resize", settings: {} },
      ]);
    });
    act(() => {
      const es = MockEventSource.instances.at(-1);
      es?.onmessage?.({
        data: JSON.stringify({ type: "single", phase: "failed", percent: 0 }),
      } as MessageEvent);
    });
    expect(view.result.current.value.error).toBe(deErrors.processingFailedNoDetail);

    act(() => {
      void view.result.current.value.processAll(files, [
        { id: "s1", toolId: "resize", settings: {} },
      ]);
    });
    act(() => {
      xhrs[4].status = 202;
      xhrs[4].onload?.();
      const es = MockEventSource.instances.at(-1);
      es?.onmessage?.({
        data: JSON.stringify({
          type: "batch",
          status: "failed",
          totalFiles: 2,
          completedFiles: 0,
          failedFiles: 2,
          errors: [],
        }),
      } as MessageEvent);
    });
    expect(view.result.current.value.error).toBe(deErrors.allFilesFailed);

    view.unmount();
  });
});
