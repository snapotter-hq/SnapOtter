// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imagePreviewMock = vi.hoisted(() => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/image-preview", () => imagePreviewMock);

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  // formatHeaders() in @/lib/api reads this; without it the save handler
  // throws into its own catch and never reaches the claim.
  getDistinctId: () => null,
}));

vi.mock("@/components/feedback/tool-feedback-prompt", () => ({
  ToolFeedbackPrompt: () => null,
}));

import { ReviewPanel } from "@/components/common/review-panel";
import { useFileStore } from "@/stores/file-store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([new File(["x"], "a.png", { type: "image/png" })]);
});

function renderPanel() {
  return render(
    <MemoryRouter>
      <ReviewPanel
        filename="a-resized.png"
        fileSize={100}
        fileType="image/png"
        originalSize={200}
        downloadUrl="blob:result"
        onUndo={() => {}}
        onStartOver={() => {}}
        currentToolId="resize"
      />
    </MemoryRouter>,
  );
}

describe("ReviewPanel claim tracking", () => {
  it("claims the entry when the result is downloaded", () => {
    const { container } = renderPanel();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);

    const button = container.querySelector("[data-download-button]");
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLElement);

    expect(useFileStore.getState().entries[0].claimed).toBe(true);
  });

  it("claims the entry that was saved, not the one selected when the upload returns", async () => {
    useFileStore
      .getState()
      .setFiles([
        new File(["x"], "a.png", { type: "image/png" }),
        new File(["y"], "b.png", { type: "image/png" }),
      ]);
    expect(useFileStore.getState().selectedIndex).toBe(0);

    let resolveUpload: ((res: { ok: boolean }) => void) | undefined;
    const upload = new Promise<{ ok: boolean }>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ blob: () => Promise.resolve(new Blob(["result"])) })
          : upload,
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    // Let the handler reach the upload, which stays pending below.
    await act(async () => {});

    // The user browses to another file while the upload is still in flight.
    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });

    await act(async () => {
      resolveUpload?.({ ok: true });
      await upload;
    });
    await act(async () => {});

    // Diagnosis insurance: handleSaveToFiles swallows everything into a bare
    // catch, so without this a broken fetch or header helper reads as a claim
    // bug and points at the wrong subsystem.
    expect(await screen.findByRole("button", { name: /saved to files/i })).toBeTruthy();

    const { entries } = useFileStore.getState();
    expect(entries[0].claimed).toBe(true);
    expect(entries[1].claimed).toBe(false);
  });
});
