// @vitest-environment jsdom
import { en } from "@snapotter/shared";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The toast is sonner's; what matters here is when it is shown and with what text.
const showIgnored = vi.hoisted(() => vi.fn());
vi.mock("@/lib/intake-notice", () => ({ showIntakeIgnored: showIgnored }));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { I18nProvider } from "@/contexts/i18n-context";
import { useIntakeGuard } from "@/hooks/use-intake-guard";
import { ToolPage } from "@/pages/tool-page";
import { useFileStore } from "@/stores/file-store";
import { usePassportPhotoStore } from "@/stores/passport-photo-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import { useSplitStore } from "@/stores/split-store";

/**
 * #2108: a file dropped or pasted onto a tool page replaces the loaded one. A
 * run in flight either stops once its file leaves the store (#1894, #1975) or
 * lands its result under the new file, and neither said a word. The guard turns
 * the intake away and says why, for every tool the leave guard counts as busy.
 */

function renderGuard(path = "/image/resize") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );
  return renderHook(() => useIntakeGuard(), { wrapper });
}

beforeEach(() => {
  showIgnored.mockClear();
  useFileStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  useSplitStore.setState({ processing: false });
  usePdfToImageStore.setState({ processing: false });
  usePassportPhotoStore.setState({ analyzing: false, generating: false });
  vi.unstubAllGlobals();
});

describe("useIntakeGuard (#2108)", () => {
  it("lets files in when nothing is running, without a word", () => {
    const { result } = renderGuard();

    expect(result.current.running).toBe(false);
    expect(result.current.allowIntake()).toBe(true);
    expect(showIgnored).not.toHaveBeenCalled();
  });

  it("turns files away while a run is in flight, and says why", () => {
    useFileStore.getState().setProcessing(true);
    const { result } = renderGuard();

    expect(result.current.running).toBe(true);
    expect(result.current.allowIntake()).toBe(false);

    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
  });

  it("follows the run as it starts and ends", () => {
    const { result } = renderGuard();
    expect(result.current.allowIntake()).toBe(true);

    act(() => {
      useFileStore.getState().setProcessing(true);
    });
    expect(result.current.allowIntake()).toBe(false);

    act(() => {
      useFileStore.getState().setProcessing(false);
    });
    expect(result.current.allowIntake()).toBe(true);
  });

  // These keep their runs in a store of their own, and a drop used to replace the
  // file under them with no sign: split and pdf-to-image landed the old file's
  // result under the new one, and passport photo cleared an analysis mid-flight.
  it.each([
    ["split", "/image/split", () => useSplitStore.setState({ processing: true })],
    ["pdf-to-image", "/pdf/pdf-to-image", () => usePdfToImageStore.setState({ processing: true })],
    [
      "passport-photo (analysing)",
      "/image/passport-photo",
      () => usePassportPhotoStore.setState({ analyzing: true }),
    ],
    [
      "passport-photo (generating)",
      "/image/passport-photo",
      () => usePassportPhotoStore.setState({ generating: true }),
    ],
  ])("turns files away while %s is busy in its own store", (_name, path, start) => {
    start();
    const { result } = renderGuard(path);

    expect(result.current.allowIntake()).toBe(false);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
  });

  it("does not count another tool's busy store against this page", () => {
    useSplitStore.setState({ processing: true });
    const { result } = renderGuard("/image/resize");

    expect(result.current.allowIntake()).toBe(true);
    expect(showIgnored).not.toHaveBeenCalled();
  });
});

describe("ToolPage Clear all intake guard (#2622)", () => {
  const storageMap = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, value),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    key: () => null,
    get length() {
      return storageMap.size;
    },
  };

  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:original-input",
      revokeObjectURL: () => {},
    });
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              authEnabled: false,
              pageCount: 1,
              thumbnails: [],
              bundles: [],
            }),
            { status: 200 },
          ),
        ),
      ),
    );
  });

  function renderToolPage(path: string) {
    return render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/:section/:toolId" element={<ToolPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  }

  it("refuses Clear all while a file-store run is in flight and shows the intake notice", async () => {
    renderToolPage("/image/resize");
    await act(async () => {
      useFileStore.getState().setFiles([new File(["img"], "first.png", { type: "image/png" })]);
      useFileStore.getState().setProcessing(true);
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.clearAll }));

    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
    expect(useFileStore.getState().entries).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(true);
  });

  it.each([
    ["split", "/image/split", () => useSplitStore.setState({ processing: true })],
    ["pdf-to-image", "/pdf/pdf-to-image", () => usePdfToImageStore.setState({ processing: true })],
    [
      "passport-photo (analysing)",
      "/image/passport-photo",
      () => usePassportPhotoStore.setState({ analyzing: true }),
    ],
  ])("refuses Clear all while %s is busy in its own store", async (_name, path, start) => {
    renderToolPage(path);
    await act(async () => {
      useFileStore.getState().setFiles([new File(["img"], "scan.png", { type: "image/png" })]);
      start();
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.clearAll }));

    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
    expect(useFileStore.getState().entries).toHaveLength(1);
  });

  it("clears the file store when nothing is running", async () => {
    renderToolPage("/image/resize");
    await act(async () => {
      useFileStore.getState().setFiles([new File(["img"], "first.png", { type: "image/png" })]);
    });

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.clearAll }));

    expect(showIgnored).not.toHaveBeenCalled();
    expect(useFileStore.getState().entries).toHaveLength(0);
  });
});
