// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processFiles = vi.hoisted(() => vi.fn());
const processAllFiles = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles,
    processAllFiles,
    processing: false,
    error: null,
    downloadUrl: null,
    progress: { phase: "idle", percent: 0, stage: undefined, elapsed: 0 },
  }),
}));

import { PixelateSettings } from "@/components/tools/pixelate-settings";
import { useFileStore } from "@/stores/file-store";

// jsdom never loads images, so the dimensions probe is driven by hand: the
// component's `new Image()` lands here and the test fires onload/onerror.
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_value: string) {
    FakeImage.instances.push(this);
  }
}

function seedFile(
  overrides: { originalWidth?: number | null; originalHeight?: number | null } = {},
) {
  const file = new File(["png"], "photo.png", { type: "image/png" });
  useFileStore.setState({
    files: [file],
    selectedIndex: 0,
    entries: [
      {
        id: "e1",
        file,
        blobUrl: "blob:photo",
        previewLoading: false,
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        processedSize: null,
        originalSize: file.size,
        originalWidth: overrides.originalWidth ?? null,
        originalHeight: overrides.originalHeight ?? null,
        status: "pending",
        error: null,
        modality: "image",
        previewKind: "image",
      },
    ],
  });
}

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  seedFile();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useFileStore.setState({ files: [], entries: [], selectedIndex: 0 });
});

describe("PixelateSettings dimension probe (#797)", () => {
  it("blocks selection-mode processing and says why when the probe fails", async () => {
    render(<PixelateSettings />);
    fireEvent.click(screen.getByTestId("pixelate-mode-selection"));

    const probe = FakeImage.instances.at(-1);
    expect(probe).toBeDefined();
    act(() => probe?.onerror?.());

    expect(await screen.findByText(/couldn't read the image dimensions/i)).toBeInTheDocument();
    expect(screen.getByTestId("pixelate-submit")).toBeDisabled();

    // Submitting the form anyway must not silently pixelate the whole image
    fireEvent.submit(screen.getByTestId("pixelate-submit").closest("form") as HTMLFormElement);
    expect(processFiles).not.toHaveBeenCalled();
    expect(processAllFiles).not.toHaveBeenCalled();
  });

  it("blocks selection-mode processing while the probe is still pending", () => {
    render(<PixelateSettings />);
    fireEvent.click(screen.getByTestId("pixelate-mode-selection"));

    // Probe neither loaded nor failed yet: no dimensions, no region possible
    expect(screen.getByTestId("pixelate-submit")).toBeDisabled();
    fireEvent.submit(screen.getByTestId("pixelate-submit").closest("form") as HTMLFormElement);
    expect(processFiles).not.toHaveBeenCalled();
  });

  it("still allows whole-image mode when the probe fails", () => {
    render(<PixelateSettings />);
    const probe = FakeImage.instances.at(-1);
    act(() => probe?.onerror?.());

    const submit = screen.getByTestId("pixelate-submit");
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(processFiles).toHaveBeenCalledTimes(1);
    expect(processFiles.mock.calls[0][1]).not.toHaveProperty("region");
  });

  it("computes the region from the entry's true dimensions, not the downscaled preview", () => {
    // Server-preview formats (TIFF, RAW, HEIC) swap blobUrl for a preview
    // capped at 1200px, but the server pixelates the ORIGINAL file. The store
    // carries the true dimensions from X-Original-Width/Height; the region
    // must use those or the redaction lands in the wrong place.
    seedFile({ originalWidth: 4000, originalHeight: 3000 });
    render(<PixelateSettings />);
    fireEvent.click(screen.getByTestId("pixelate-mode-selection"));

    const probe = FakeImage.instances.at(-1);
    act(() => {
      if (!probe) return;
      probe.naturalWidth = 1200; // downscaled preview
      probe.naturalHeight = 900;
      probe.onload?.();
    });

    fireEvent.click(screen.getByTestId("pixelate-submit"));
    expect(processFiles).toHaveBeenCalledTimes(1);
    expect(processFiles.mock.calls[0][1]).toMatchObject({
      region: { left: 1200, top: 900, width: 1600, height: 1200 },
    });
  });

  it("allows selection mode via entry dimensions even when the probe fails", () => {
    // A raw TIFF blobUrl never decodes in the browser, but the true
    // dimensions from the server decode are enough to place the region.
    seedFile({ originalWidth: 4000, originalHeight: 3000 });
    render(<PixelateSettings />);
    fireEvent.click(screen.getByTestId("pixelate-mode-selection"));

    const probe = FakeImage.instances.at(-1);
    act(() => probe?.onerror?.());

    const submit = screen.getByTestId("pixelate-submit");
    expect(submit).toBeEnabled();
    expect(screen.queryByText(/couldn't read the image dimensions/i)).not.toBeInTheDocument();
    fireEvent.click(submit);
    expect(processFiles).toHaveBeenCalledTimes(1);
    expect(processFiles.mock.calls[0][1]).toMatchObject({
      region: { left: 1200, top: 900, width: 1600, height: 1200 },
    });
  });

  it("sends the drawn region once the probe succeeds", () => {
    render(<PixelateSettings />);
    fireEvent.click(screen.getByTestId("pixelate-mode-selection"));

    const probe = FakeImage.instances.at(-1);
    expect(probe).toBeDefined();
    act(() => {
      if (!probe) return;
      probe.naturalWidth = 800;
      probe.naturalHeight = 600;
      probe.onload?.();
    });

    const submit = screen.getByTestId("pixelate-submit");
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(processFiles).toHaveBeenCalledTimes(1);
    // Default box is 40x40% centered at 30/30: exact pixel region from 800x600
    expect(processFiles.mock.calls[0][1]).toMatchObject({
      region: { left: 240, top: 180, width: 320, height: 240 },
    });
  });
});
