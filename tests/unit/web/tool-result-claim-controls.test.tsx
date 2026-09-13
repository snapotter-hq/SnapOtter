// @vitest-environment jsdom
import { TOOLS, toolSection } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

// Bypass the persist middleware so the editor store starts clean per test.
vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, persist: (config: unknown) => config };
});

// jsdom has no clipboard and no execCommand, so the real copyToClipboard always
// reports failure. Drivable here, because whether the copy worked is what
// decides whether anything is claimed.
const clipboard = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, copyToClipboard: vi.fn(async () => clipboard.ok) };
});

import { ImageToBase64Results } from "@/components/tools/image-to-base64-results";
import { PdfToImagePreview } from "@/components/tools/pdf-to-image-preview";
import { PdfToImageSettings } from "@/components/tools/pdf-to-image-settings";
import { SplitSettings } from "@/components/tools/split-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { useWorkInFlight } from "@/hooks/use-work-in-flight";
import { useBase64Store } from "@/stores/base64-store";
import { useFileStore } from "@/stores/file-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import { useSplitStore } from "@/stores/split-store";
import { useToolResultClaims } from "@/stores/tool-result-claims";

/**
 * The download controls themselves, driven through a real click.
 *
 * The hook tests seed a store and call the claim by hand, which pins the rule
 * but not the wiring: a control that claims the wrong thing, or the wrong
 * control claiming at all, passes there. These render the panel the user sees,
 * click what the user clicks, and ask the guard what it would say next.
 *
 * The split that matters is per-item against whole-result. One tile or one page
 * claims nothing, because the claim is per tool and would answer for every tile
 * or page the user never took (#1123 review). The zip claims, because the zip
 * really does contain all of them.
 */

/** The route the app serves this tool at, which is what the guard scopes on. */
function routeFor(toolId: string): string {
  const tool = TOOLS.find((t) => t.id === toolId);
  if (!tool) throw new Error(`No tool "${toolId}" in the shared catalog`);
  return `/${toolSection(tool)}/${tool.id}`;
}

function workAt(path: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );
  return renderHook(() => useWorkInFlight(), { wrapper }).result.current;
}

function renderPanel(ui: ReactNode) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const PDF_PAGES = [
  { page: 1, downloadUrl: "/api/v1/download/job-1/page-1.png", size: 1024 },
  { page: 2, downloadUrl: "/api/v1/download/job-1/page-2.png", size: 2048 },
];

const TILES = [
  { row: 0, col: 0, label: "1", width: 10, height: 10, blobUrl: "blob:tile-1" },
  { row: 0, col: 1, label: "2", width: 10, height: 10, blobUrl: "blob:tile-2" },
];

function base64Result(filename: string) {
  return {
    filename,
    mimeType: "image/png",
    width: 1,
    height: 1,
    originalSize: 10,
    encodedSize: 14,
    overheadPercent: 40,
    base64: "aGk=",
    dataUri: "data:image/png;base64,aGk=",
  };
}

/** jsdom cannot navigate, and a download anchor would try to. */
function swallowNavigation(event: MouseEvent) {
  event.preventDefault();
}

beforeEach(() => {
  clipboard.ok = true;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  // This jsdom has a localStorage object with no methods on it, and
  // I18nProvider reads the stored locale on mount.
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
  });
  document.addEventListener("click", swallowNavigation);
  useFileStore.getState().reset();
  useToolResultClaims.getState().reset();
  useSplitStore.getState().reset();
  usePdfToImageStore.getState().reset();
  useBase64Store.getState().reset();
});

afterEach(() => {
  document.removeEventListener("click", swallowNavigation);
  cleanup();
  vi.unstubAllGlobals();
});

describe("split download controls", () => {
  const ROUTE = routeFor("split");

  function renderWithTiles() {
    const view = renderPanel(<SplitSettings />);
    // The mount effect clears tiles with the file set, so the run lands after
    // the panel is up, which is the order it happens in the app too.
    act(() => {
      useSplitStore.setState({ tiles: TILES, zipBlobUrl: "blob:tiles.zip" });
    });
    return view;
  }

  it("keeps warning after one tile is downloaded", () => {
    const { getByTitle } = renderWithTiles();

    fireEvent.click(getByTitle("Download tile 1"));

    expect(useToolResultClaims.getState().claimed.split).toBeUndefined();
    expect(workAt(ROUTE)).toEqual({ kind: "unsaved", downloads: [] });
  });

  it("keeps warning after every tile is downloaded one at a time", () => {
    const { getByTitle } = renderWithTiles();

    fireEvent.click(getByTitle("Download tile 1"));
    fireEvent.click(getByTitle("Download tile 2"));

    expect(workAt(ROUTE)).toEqual({ kind: "unsaved", downloads: [] });
  });

  it("goes quiet once the zip of every tile is downloaded", () => {
    const { getByText } = renderWithTiles();

    fireEvent.click(getByText("Download All as ZIP"));

    expect(workAt(ROUTE)).toBeNull();
  });

  // The claim has to be the same key the guard reads, not merely some key.
  // Claiming anything at all would pass the test above if the guard compared
  // presence instead of identity.
  it("claims the tiles the guard is looking at", () => {
    const { getByText } = renderWithTiles();

    fireEvent.click(getByText("Download All as ZIP"));

    const claim = useToolResultClaims.getState().claimed.split;
    expect(claim).toBeInstanceOf(WeakRef);
    expect((claim as WeakRef<object>).deref()).toBe(useSplitStore.getState().tiles);
  });

  it("warns again on the tiles a second run produces", () => {
    const { getByText } = renderWithTiles();
    fireEvent.click(getByText("Download All as ZIP"));

    act(() => {
      useSplitStore.setState({ tiles: [TILES[0]], zipBlobUrl: "blob:tiles-rerun.zip" });
    });

    expect(workAt(ROUTE)).toEqual({ kind: "unsaved", downloads: [] });
  });
});

describe("pdf-to-image download controls", () => {
  const ROUTE = routeFor("pdf-to-image");

  function seedConverted() {
    usePdfToImageStore.setState({
      file: new File(["%PDF"], "doc.pdf", { type: "application/pdf" }),
      pageCount: 2,
      results: PDF_PAGES,
      zipUrl: "/api/v1/download/job-1/pdf-pages.zip",
      zipSize: 4096,
    });
  }

  it("keeps warning after one page is downloaded", () => {
    seedConverted();
    const { container } = renderPanel(<PdfToImagePreview />);

    const page = container.querySelector('a[download="page-1.png"]');
    expect(page).not.toBeNull();
    fireEvent.click(page as Element);

    expect(useToolResultClaims.getState().claimed["pdf-to-image"]).toBeUndefined();
    expect(workAt(ROUTE)).toEqual({ kind: "unsaved", downloads: [] });
  });

  it("goes quiet once the zip of every page is downloaded", () => {
    seedConverted();
    const { getByTestId } = renderPanel(<PdfToImageSettings />);

    fireEvent.click(getByTestId("pdf-to-image-download"));

    expect(workAt(ROUTE)).toBeNull();
  });

  it("claims the pages the guard is looking at", () => {
    seedConverted();
    const { getByTestId } = renderPanel(<PdfToImageSettings />);

    fireEvent.click(getByTestId("pdf-to-image-download"));

    const claim = useToolResultClaims.getState().claimed["pdf-to-image"];
    expect((claim as WeakRef<object>).deref()).toBe(usePdfToImageStore.getState().results);
  });

  it("warns again on the pages a second run produces", () => {
    seedConverted();
    const { getByTestId } = renderPanel(<PdfToImageSettings />);
    fireEvent.click(getByTestId("pdf-to-image-download"));

    usePdfToImageStore.setState({
      results: [{ page: 1, downloadUrl: "/api/v1/download/job-2/page-1.png", size: 512 }],
      zipUrl: "/api/v1/download/job-2/pdf-pages.zip",
    });

    expect(workAt(ROUTE)).toEqual({ kind: "unsaved", downloads: [] });
  });
});

describe("image-to-base64 download controls", () => {
  const ROUTE = routeFor("image-to-base64");

  function seedEncoded() {
    useFileStore
      .getState()
      .setFiles([
        new File(["a"], "a.png", { type: "image/png" }),
        new File(["b"], "b.png", { type: "image/png" }),
      ]);
    useBase64Store.setState({ results: [base64Result("a.png"), base64Result("b.png")] });
  }

  // The half that stops the single-result case being widened: with two results,
  // taking one leaves the other, and the guard has to keep saying so.
  it("keeps warning after one file's text is saved out of two", () => {
    seedEncoded();
    const { getByText } = renderPanel(<ImageToBase64Results />);

    fireEvent.click(getByText("Download .txt"));

    expect(useToolResultClaims.getState().claimed["image-to-base64"]).toBeUndefined();
    expect(workAt(ROUTE)).toEqual({ kind: "unsaved", downloads: [] });
  });

  // The set rule where the set has one member: this file is everything the
  // guard is warning about, and the copy-all bar does not render at all in that
  // state, so the per-file controls are the only way to take the result.
  describe("a run that encoded one file", () => {
    function seedOne() {
      useFileStore.getState().setFiles([new File(["a"], "a.png", { type: "image/png" })]);
      useBase64Store.setState({ results: [base64Result("a.png")] });
    }

    it("goes quiet once that file's text is saved", () => {
      seedOne();
      const { getByText } = renderPanel(<ImageToBase64Results />);

      fireEvent.click(getByText("Download .txt"));

      expect(workAt(ROUTE)).toBeNull();
    });

    it("goes quiet once that file's text is copied", async () => {
      seedOne();
      const { getByText } = renderPanel(<ImageToBase64Results />);

      await act(async () => {
        fireEvent.click(getByText("Copy to Clipboard"));
      });

      expect(workAt(ROUTE)).toBeNull();
    });

    // The claim rides on the copy working. A clipboard that refused hands the
    // user nothing, and the guard has to keep saying so.
    it("keeps warning when the copy failed", async () => {
      clipboard.ok = false;
      seedOne();
      const { getByText } = renderPanel(<ImageToBase64Results />);

      await act(async () => {
        fireEvent.click(getByText("Copy to Clipboard"));
      });

      expect(workAt(ROUTE)).toEqual({ kind: "unsaved", downloads: [] });
    });

    it("claims the results the guard is looking at", () => {
      seedOne();
      const { getByText } = renderPanel(<ImageToBase64Results />);

      fireEvent.click(getByText("Download .txt"));

      const claim = useToolResultClaims.getState().claimed["image-to-base64"];
      expect((claim as WeakRef<object>).deref()).toBe(useBase64Store.getState().results);
    });
  });

  it("goes quiet once every file's text is saved at once", () => {
    seedEncoded();
    const { getByText } = renderPanel(<ImageToBase64Results />);

    fireEvent.click(getByText("Download All as Text"));

    expect(workAt(ROUTE)).toBeNull();
  });

  it("claims the results the guard is looking at", () => {
    seedEncoded();
    const { getByText } = renderPanel(<ImageToBase64Results />);

    fireEvent.click(getByText("Download All as Text"));

    const claim = useToolResultClaims.getState().claimed["image-to-base64"];
    expect((claim as WeakRef<object>).deref()).toBe(useBase64Store.getState().results);
  });

  it("warns again on the results a second run produces", () => {
    seedEncoded();
    const { getByText } = renderPanel(<ImageToBase64Results />);
    fireEvent.click(getByText("Download All as Text"));

    useBase64Store.setState({ results: [base64Result("a.png"), base64Result("b.png")] });

    expect(workAt(ROUTE)).toEqual({ kind: "unsaved", downloads: [] });
  });
});
