// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deployment = vi.hoisted(() => ({ basePath: "" }));

// Phase 1 (background removal) is "done": the processor exposes a mask PNG
// download URL and is no longer processing, so the wrapper renders its
// download controls. Only Phase 2 (the effects request) re-encodes to the
// chosen output format; Phase 1 always emits PNG.
vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
    processAllFiles: vi.fn(),
    processing: false,
    error: null,
    downloadUrl: `${deployment.basePath}/api/v1/download/JOB123/pic_mask.png`,
    originalSize: 1000,
    processedSize: 500,
    progress: { phase: "idle", percent: 0, stage: "", elapsed: 0 },
  }),
}));

import { RemoveBgSettings } from "@/components/tools/remove-bg-settings";
import { useFileStore } from "@/stores/file-store";

beforeEach(() => {
  // jsdom has no object-URL support; the file store mints preview URLs.
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  // One local (non-library) file, so fromLibrary is false and the output
  // format is the only thing that can route the download through Phase 2.
  useFileStore
    .getState()
    .setFiles([new File([new Uint8Array([1, 2, 3])], "pic.png", { type: "image/png" })]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  deployment.basePath = "";
  useFileStore.getState().setFiles([]);
});

describe("remove-background output format routing (#720)", () => {
  it("uses the plain (Phase 1) download for the default PNG output", async () => {
    render(<RemoveBgSettings />);

    // Download controls appear once the Phase 1 result is picked up.
    expect(await screen.findByTestId("remove-background-download")).toBeInTheDocument();
    expect(screen.queryByTestId("remove-background-download-effects")).not.toBeInTheDocument();
  });

  it("routes the download through the effects request when WebP is chosen", async () => {
    render(<RemoveBgSettings />);

    // Default PNG: plain download.
    await screen.findByTestId("remove-background-download");

    // Choose WebP output (transparent background, no effects).
    fireEvent.click(screen.getByTestId("remove-background-format-webp"));

    // The download must now go through Phase 2, the only path that re-encodes,
    // instead of handing back the Phase 1 PNG.
    await waitFor(() => {
      expect(screen.getByTestId("remove-background-download-effects")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("remove-background-download")).not.toBeInTheDocument();
  });
  it.each(["/snapotter", "/apps/snapotter"])(
    "uses the correct job for effects under %s",
    async (basePath) => {
      deployment.basePath = basePath;
      // A failed response prevents navigation while still exercising the real request.
      const fetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "test" }) });
      vi.stubGlobal("fetch", fetch);
      render(<RemoveBgSettings />);
      await screen.findByTestId("remove-background-download");
      fireEvent.click(screen.getByTestId("remove-background-format-webp"));
      fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(JSON.parse(fetch.mock.calls[0][1].body.get("settings")).jobId).toBe("JOB123");
    },
  );
});
