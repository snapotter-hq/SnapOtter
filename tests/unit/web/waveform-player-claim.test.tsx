// @vitest-environment jsdom
import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imagePreviewMock = vi.hoisted(() => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/image-preview", () => imagePreviewMock);
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { WaveformPlayer } from "@/components/common/waveform-player";
import { I18nProvider } from "@/contexts/i18n-context";
import { track } from "@/lib/analytics";
import { playerDownloadClaim } from "@/lib/result-display";
import { ToolPage } from "@/pages/tool-page";
import { useFileStore } from "@/stores/file-store";

/**
 * Both cases go through playerDownloadClaim, which is the decision tool-page
 * makes when it renders this player: claim on a result, hand over nothing on
 * the original. Rendering the player with a handler the test picked itself
 * would pass whatever tool-page did, which is how the original negative case
 * here passed by construction (it passed no handler at all).
 */
function claimIfResult(processedUrl: string | null): (() => void) | undefined {
  return playerDownloadClaim(processedUrl, () => useFileStore.getState().claimSelected());
}

/** jsdom has no navigation, so let the click run but drop the default action. */
function swallowNavigation(e: Event) {
  e.preventDefault();
}

/**
 * jsdom cannot decode audio, so WaveSurfer always fails and the player falls
 * back to the download link this test is about.
 */
async function findFallbackLink(container: HTMLElement): Promise<HTMLElement> {
  return await waitFor(() => {
    const link = container.querySelector<HTMLAnchorElement>("a[download]");
    if (!link) throw new Error("decode fallback not rendered yet");
    return link;
  });
}

beforeEach(() => {
  vi.mocked(track).mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  const storageMap = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, value),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    key: () => null,
    get length() {
      return storageMap.size;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("blob:")) {
        throw new TypeError("Failed to fetch blob in jsdom");
      }
      return new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 });
    }),
  );
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  document.addEventListener("click", swallowNavigation, true);
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([new File(["x"], "a.mp3", { type: "audio/mpeg" })]);
});

afterEach(() => {
  document.removeEventListener("click", swallowNavigation, true);
  cleanup();
  vi.unstubAllGlobals();
});

describe("WaveformPlayer decode fallback download", () => {
  it("claims the entry when the source is the result", async () => {
    const processedUrl = "blob:result";
    const { container } = render(
      <WaveformPlayer src={processedUrl} onDownload={claimIfResult(processedUrl)} />,
    );

    fireEvent.click(await findFallbackLink(container));

    expect(useFileStore.getState().entries[0].claimed).toBe(true);
  });

  // With no result, the player is showing the upload and the download takes the
  // upload. A claim here would silence the navigation guard on a result the
  // user has not seen yet, let alone taken.
  it("leaves the entry unclaimed when the source is the original audio", async () => {
    const { container } = render(
      <WaveformPlayer src="blob:original" onDownload={claimIfResult(null)} />,
    );

    fireEvent.click(await findFallbackLink(container));

    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("emits RESULT_DOWNLOADED and claims the entry when ToolPage's WaveformPlayer decode fallback is clicked on a result (#3970)", async () => {
    const { container, unmount } = render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/audio/convert-audio"]}>
          <Routes>
            <Route path="/:section/:toolId" element={<ToolPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    await act(async () => {
      useFileStore.getState().setFiles([new File(["x"], "a.mp3", { type: "audio/mpeg" })]);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: "blob:audio-result",
        processedFilename: "a.wav",
      });
    });

    vi.mocked(track).mockClear();
    fireEvent.click(await findFallbackLink(container));

    expect(useFileStore.getState().entries[0].claimed).toBe(true);
    expect(track).toHaveBeenCalledWith(ANALYTICS_EVENTS.RESULT_DOWNLOADED, {
      tool_id: "convert-audio",
    });
    unmount();

    // When showing the original audio (processedUrl is null), clicking the fallback link neither claims nor emits RESULT_DOWNLOADED.
    const originalView = render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/audio/convert-audio"]}>
          <Routes>
            <Route path="/:section/:toolId" element={<ToolPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    await act(async () => {
      useFileStore.getState().setFiles([new File(["x"], "a.mp3", { type: "audio/mpeg" })]);
    });
    vi.mocked(track).mockClear();
    fireEvent.click(await findFallbackLink(originalView.container));

    expect(useFileStore.getState().entries[0].claimed).toBe(false);
    expect(track).not.toHaveBeenCalledWith(ANALYTICS_EVENTS.RESULT_DOWNLOADED, expect.anything());
    originalView.unmount();
  });
});
