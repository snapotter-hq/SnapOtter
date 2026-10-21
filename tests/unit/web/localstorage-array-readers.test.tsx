// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { EditMetadataSettings } from "@/components/tools/edit-metadata-settings";
import { SignPdfSettings } from "@/components/tools/sign-pdf-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { recordRecentTool, useRecentTools } from "@/hooks/use-recent-tools";
import { HomePage } from "@/pages/home-page";
import { useFileStore } from "@/stores/file-store";
import { usePinnedToolsStore } from "@/stores/pinned-tools-store";
import { useSettingsStore } from "@/stores/settings-store";

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  key: vi.fn(() => null),
  get length() {
    return storageMap.size;
  },
};

const fetchMock = vi.fn();

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      filename: "sample.jpg",
      fileSize: 128,
      exif: {},
      iptc: {},
      xmp: {},
      gps: {},
      keywords: [],
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  useSettingsStore.setState({
    loaded: true,
    loadError: false,
    disabledTools: [],
    experimentalEnabled: false,
    fetch: async () => {},
  });
  usePinnedToolsStore.setState({ pinnedTools: [], fetch: async () => {} });
  useFileStore.setState({
    entries: [],
    files: [],
    selectedIndex: 0,
    processing: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useRecentTools and recordRecentTool (#3421)", () => {
  it.each([
    "{corrupt",
    "{}",
    "null",
    "42",
    '"resize"',
    "true",
    "[null]",
    "[42]",
    "[{}]",
    '["resize", 42]',
  ])("falls back to [] when snapotter-recent-tools is %s", (raw) => {
    localStorage.setItem("snapotter-recent-tools", raw);

    const { result } = renderHook(() => useRecentTools());
    expect(result.current).toEqual([]);

    act(() => {
      recordRecentTool("resize");
    });

    expect(result.current).toEqual(["resize"]);
    expect(JSON.parse(localStorage.getItem("snapotter-recent-tools") ?? "null")).toEqual([
      "resize",
    ]);
  });

  it("deduplicates and caps recent tools at 5", () => {
    const { result } = renderHook(() => useRecentTools());
    act(() => {
      for (const id of ["resize", "crop", "rotate", "flip", "blur", "sharpen", "crop"]) {
        recordRecentTool(id);
      }
    });
    expect(result.current).toEqual(["crop", "sharpen", "blur", "flip", "rotate"]);
  });

  it("returns [] when localStorage is cleared after recordRecentTool runs with no subscribers", () => {
    recordRecentTool("resize");
    const { result, unmount } = renderHook(() => useRecentTools());
    expect(result.current).toEqual(["resize"]);
    unmount();

    recordRecentTool("crop");
    localStorage.removeItem("snapotter-recent-tools");

    const { result: afterClear } = renderHook(() => useRecentTools());
    expect(afterClear.current).toEqual([]);
  });

  it("falls back to [] without throwing when localStorage access throws SecurityError", () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });
    const { result } = renderHook(() => useRecentTools());
    expect(result.current).toEqual([]);

    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });
    expect(() => recordRecentTool("resize")).not.toThrow();
  });
});

describe("HomePage localStorage array readers (#3421)", () => {
  it.each(["null", "{}"])(
    "renders HomePage without throwing when snapotter-recent-tools is %s",
    (raw) => {
      localStorage.setItem("snapotter-recent-tools", raw);

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={["/"]}>
            <HomePage />
          </MemoryRouter>
        </I18nProvider>,
      );

      expect(screen.getByRole("heading", { level: 2, name: /^Image\d+$/ })).toBeInTheDocument();
    },
  );

  it.each(["null", "{}", '"image"', "42", "[null]", "[42]", '["image", 42]', "{corrupt"])(
    "ignores non-string-array snapotter-collapsed-sections (%s) instead of iterating string chars",
    (raw) => {
      localStorage.setItem("snapotter-collapsed-sections", raw);

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={["/"]}>
            <HomePage />
          </MemoryRouter>
        </I18nProvider>,
      );

      // Toggling the Image section header persists only ["image"], proving the
      // initial Set was empty rather than Set {"i", "m", "a", "g", "e"}.
      const imageHeading = screen.getByRole("heading", { level: 2, name: /^Image\d+$/ });
      fireEvent.click(within(imageHeading).getByRole("button"));

      expect(JSON.parse(localStorage.getItem("snapotter-collapsed-sections") ?? "null")).toEqual([
        "image",
      ]);
    },
  );

  it("restores valid collapsed section ids from snapotter-collapsed-sections", () => {
    localStorage.setItem("snapotter-collapsed-sections", JSON.stringify(["image"]));

    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/"]}>
          <HomePage />
        </MemoryRouter>
      </I18nProvider>,
    );

    // Expanding the already-collapsed Image section removes "image" and saves [].
    const imageHeading = screen.getByRole("heading", { level: 2, name: /^Image\d+$/ });
    fireEvent.click(within(imageHeading).getByRole("button"));

    expect(JSON.parse(localStorage.getItem("snapotter-collapsed-sections") ?? "null")).toEqual([]);
  });
});

describe("EditMetadataSettings metadata-templates reader (#3421)", () => {
  function seedOneFile() {
    const file = new File(["jpeg-bytes"], "photo.jpg", {
      type: "image/jpeg",
      lastModified: 1700000000000,
    });
    useFileStore.setState({
      files: [file],
      entries: [
        {
          id: "entry-1",
          file,
          previewUrl: "blob:preview",
          status: "idle",
          progress: 0,
          error: null,
          errorCategory: null,
          processedUrl: null,
          processedPreviewUrl: null,
          processedFilename: null,
          originalSize: file.size,
          processedSize: null,
          claimed: false,
          resultNotes: null,
        },
      ],
      selectedIndex: 0,
    });
  }

  it.each([
    "{corrupt",
    "null",
    "{}",
    "42",
    '"template"',
    "[null]",
    "[42]",
    "[{}]",
    "[[]]",
    JSON.stringify([{ name: 123, values: {} }]),
    JSON.stringify([{ name: "ValidName", values: null }]),
    JSON.stringify([{ name: "ValidName", values: [] }]),
    JSON.stringify([{ name: "ValidName", values: "bad" }]),
    JSON.stringify([{ name: "ValidName", values: { artist: 123 } }]),
    JSON.stringify([{ name: "ValidName", values: { clearGps: "yes" } }]),
    JSON.stringify([{ name: "ValidName", values: { keywords: "not-an-array" } }]),
    JSON.stringify([{ name: "ValidName", values: { keywords: [42] } }]),
    JSON.stringify([{ name: "ValidName", values: { dateMode: "invalid" } }]),
    JSON.stringify([{ name: "ValidName", values: { dateShiftDirection: "*" } }]),
    JSON.stringify([{ name: "ValidName", values: { keywordsMode: "invalid" } }]),
    JSON.stringify([{ name: "ValidName", values: { unknownField: "x" } }]),
    JSON.stringify([{ name: "ValidName", values: { toString: "x" } }]),
    JSON.stringify([
      { name: "ValidName", values: { artist: "Ada" } },
      { name: "CorruptSecond", values: { artist: 42 } },
    ]),
  ])("falls back to [] when metadata-templates is %s", async (raw) => {
    seedOneFile();
    localStorage.setItem("metadata-templates", raw);

    render(
      <I18nProvider>
        <EditMetadataSettings />
      </I18nProvider>,
    );

    await act(async () => {});

    expect(screen.queryByRole("button", { name: "ValidName" })).toBeNull();
  });

  it("loads and applies a valid saved template from metadata-templates", async () => {
    seedOneFile();
    localStorage.setItem(
      "metadata-templates",
      JSON.stringify([
        {
          name: "Studio Preset",
          values: {
            artist: "Ada Lovelace",
            copyright: "2026 Studio",
            clearGps: true,
            keywords: ["portrait", "studio"],
          },
        },
      ]),
    );

    render(
      <I18nProvider>
        <EditMetadataSettings />
      </I18nProvider>,
    );

    await act(async () => {});

    const presetBtn = screen.getByRole("button", { name: "Studio Preset" });
    fireEvent.click(presetBtn);

    expect(screen.getByLabelText(/artist/i)).toHaveValue("Ada Lovelace");
  });
});

describe("SignPdfSettings signature-store reader (#3421)", () => {
  it.each(["{}", "null", "[null]", JSON.stringify([{ id: 123 }])])(
    "renders SignPdfSettings without throwing when snapotter.signatures.v1 is %s",
    (raw) => {
      localStorage.setItem("snapotter.signatures.v1", raw);

      render(
        <I18nProvider>
          <SignPdfSettings />
        </I18nProvider>,
      );

      expect(
        screen.getByRole("button", {
          name: new RegExp(en.toolSettings["sign-pdf"].newSignature, "i"),
        }),
      ).toBeInTheDocument();
    },
  );
});
