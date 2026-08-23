// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it, so give it a real in-memory one.
const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

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

import { ImageViewer } from "@/components/common/image-viewer";
import { MultiImageViewer } from "@/components/common/multi-image-viewer";
import { PixelateSettings } from "@/components/tools/pixelate-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

// Render inside the real provider with an explicit stored locale choice, so
// the async de bundle loads and every string below must come from it (#904).
function renderDe(ui: React.ReactNode) {
  localStorage.setItem("snapotter-locale", "de");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function seedEntry(overrides: { previewLoading?: boolean } = {}) {
  const file = new File(["png"], "photo.png", { type: "image/png" });
  useFileStore.setState({
    files: [file],
    selectedIndex: 0,
    entries: [
      {
        id: "e1",
        file,
        blobUrl: "blob:photo",
        previewLoading: overrides.previewLoading ?? false,
        processedUrl: null,
        processedPreviewUrl: null,
        processedFilename: null,
        processedSize: null,
        originalSize: file.size,
        originalWidth: null,
        originalHeight: null,
        status: "pending",
        error: null,
        modality: "image",
        previewKind: "image",
      },
    ],
  });
}

beforeEach(() => {
  storage.clear();
});

afterEach(() => {
  cleanup();
  useFileStore.setState({ files: [], entries: [], selectedIndex: 0 });
  vi.clearAllMocks();
});

describe("no hardcoded English in tool UI (#904)", () => {
  it("renders the pixelate mode controls in the active locale", async () => {
    seedEntry();
    renderDe(<PixelateSettings />);

    expect(await screen.findByText(de.toolSettings.pixelate.wholeImage)).toBeInTheDocument();
    expect(screen.getByText(de.toolSettings.pixelate.mode)).toBeInTheDocument();
    expect(screen.getByText(de.toolSettings.pixelate.wholeHint)).toBeInTheDocument();
    expect(screen.queryByText("Whole image")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pixelate-mode-selection"));
    expect(screen.getByText(de.toolSettings.pixelate.width)).toBeInTheDocument();
    expect(screen.getByText(de.toolSettings.pixelate.height)).toBeInTheDocument();
    expect(screen.getByText(de.toolSettings.pixelate.dragHint)).toBeInTheDocument();
    expect(screen.queryByText("Width")).not.toBeInTheDocument();
  });

  it("localizes the ImageViewer toolbar tooltips and the fit label", async () => {
    renderDe(<ImageViewer src="blob:x" filename="a.png" fileSize={5} />);

    // findByRole waits for the de bundle: the aria-label flips to German once
    // translations land, and the title tooltip must match it.
    const zoomOut = await screen.findByRole("button", { name: de.a11y.zoomOut });
    expect(zoomOut).toHaveAttribute("title", de.a11y.zoomOut);
    expect(screen.getByRole("button", { name: de.a11y.zoomIn })).toHaveAttribute(
      "title",
      de.a11y.zoomIn,
    );
    expect(screen.getByRole("button", { name: de.a11y.fitToView })).toHaveAttribute(
      "title",
      de.a11y.fitToView,
    );
    expect(screen.getByRole("button", { name: de.a11y.actualSize })).toHaveAttribute(
      "title",
      de.a11y.actualSize,
    );
    expect(screen.getByText(de.common.fit)).toBeInTheDocument();
  });

  it("localizes the MultiImageViewer preview-loading state", async () => {
    seedEntry({ previewLoading: true });
    renderDe(<MultiImageViewer />);

    expect(await screen.findByText(de.toolPage.generatingPreview)).toBeInTheDocument();
    expect(screen.queryByText("Generating preview...")).not.toBeInTheDocument();
  });
});
