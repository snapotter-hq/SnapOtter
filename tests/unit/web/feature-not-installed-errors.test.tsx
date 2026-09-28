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
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockEventSource.OPEN;
  close = vi.fn(() => {
    this.readyState = 2;
  });
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
  it("keeps exactly en's placeholders in every locale", async () => {
    const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const locale of SUPPORTED_LOCALES) {
      const errors = (await loadTranslations(locale.code)).errors as Record<string, string>;
      for (const key of ["featureNotInstalledForTool", "featureNotInstalled"]) {
        expect(tokens(errors[key]), `${locale.code} ${key}`).toEqual(tokens(enErrors[key]));
      }
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
