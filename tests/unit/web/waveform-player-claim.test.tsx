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
import { useFileStore } from "@/stores/file-store";

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
    const { container } = render(
      <WaveformPlayer
        src="blob:result"
        onDownload={() => useFileStore.getState().claimSelected()}
      />,
    );

    fireEvent.click(await findFallbackLink(container));

    expect(useFileStore.getState().entries[0].claimed).toBe(true);
  });

  it("leaves the entry unclaimed when the source is the original audio", async () => {
    const { container } = render(<WaveformPlayer src="blob:original" />);

    fireEvent.click(await findFallbackLink(container));

    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });
});
