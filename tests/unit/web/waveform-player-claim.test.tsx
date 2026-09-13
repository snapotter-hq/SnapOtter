// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imagePreviewMock = vi.hoisted(() => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/image-preview", () => imagePreviewMock);

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  getDistinctId: () => null,
}));

import { WaveformPlayer } from "@/components/common/waveform-player";
import { playerDownloadClaim } from "@/lib/result-display";
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
});
