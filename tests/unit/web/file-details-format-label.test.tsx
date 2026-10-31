// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiGetFileDetails: vi.fn(), apiListFiles: vi.fn() };
});

import { FileDetails } from "@/components/files/file-details";
import { apiGetFileDetails, apiListFiles, type UserFileDetail } from "@/lib/api";
import { fileFormatLabel } from "@/lib/file-format-label";
import { useFileStore } from "@/stores/file-store";
import { useFilesPageStore } from "@/stores/files-page-store";

/**
 * #1783: since #1784 the library stores real MIME types for PSD, RAW, SVG,
 * EPS and friends, and the details panel showed the upper-cased MIME subtype
 * as the format: VND.ADOBE.PHOTOSHOP, X-DCRAW, SVG+XML, X-EPS.
 */

function entry(originalName: string, mimeType: string): UserFileDetail {
  return {
    id: `file-${originalName}`,
    originalName,
    mimeType,
    size: 2048,
    width: null,
    height: null,
    version: 1,
    toolChain: [],
    createdAt: "2026-10-02T00:00:00.000Z",
    versions: [],
  };
}

async function formatShownFor(file: UserFileDetail): Promise<string> {
  vi.mocked(apiGetFileDetails).mockResolvedValue(file);
  useFilesPageStore.setState({ files: [file], selectedFileId: file.id });
  render(
    <MemoryRouter>
      <FileDetails mobile />
    </MemoryRouter>,
  );
  const label = await screen.findByText("Format");
  const value = label.nextElementSibling;
  if (!value) throw new Error("format row has no value");
  return value.textContent ?? "";
}

beforeEach(() => {
  // Image previews fetch a thumbnail; nothing here needs one.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("", { status: 404 }))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("file details format row (#1783)", () => {
  it.each([
    ["layered.psd", "image/vnd.adobe.photoshop", "PSD"],
    ["camera.cr2", "image/x-canon-cr2", "CR2"],
    ["unknown-raw.dng", "image/x-dcraw", "DNG"],
    ["favicon.ico", "image/x-icon", "ICO"],
    ["logo.svg", "image/svg+xml", "SVG"],
    ["print.eps", "image/x-eps", "EPS"],
    ["photo.heic", "image/heic", "HEIC"],
    ["texture.tga", "image/x-tga", "TGA"],
    [
      "report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "DOCX",
    ],
    ["clip.mkv", "video/x-matroska", "MKV"],
    // The library typed these from their bytes, which the name contradicts.
    ["photo.jpg", "image/webp", "WEBP"],
    ["holiday.png", "image/heif", "HEIF"],
  ])("shows %s (%s) as %s", async (name, mime, expected) => {
    expect(await formatShownFor(entry(name, mime))).toBe(expected);
  });

  it("names the format from the type when the name has no extension", async () => {
    expect(await formatShownFor(entry("layered", "image/vnd.adobe.photoshop"))).toBe("PSD");
  });

  it("shows a dash when neither the name nor the type names a format", async () => {
    expect(await formatShownFor(entry("mystery", ""))).toBe("—");
  });
});

describe("file details preview placeholder (#1783)", () => {
  it("labels a non-previewable document by its extension", async () => {
    const file = entry("novel.epub", "application/epub+zip");
    await formatShownFor(file);
    // The placeholder sits above the details card and repeats the format.
    expect(screen.getAllByText("EPUB")).toHaveLength(2);
    expect(screen.queryByText("EPUB+ZIP")).toBeNull();
  });
});

describe("fileFormatLabel", () => {
  it.each([
    // One MIME type, several formats: the name tells them apart.
    ["art.ai", "application/postscript", "AI"],
    ["pointer.cur", "image/x-icon", "CUR"],
    ["icons.svgz", "image/svg+xml", "SVGZ"],
    ["photo.JPEG", "image/jpeg", "JPEG"],
    ["scan.tif", "image/tiff", "TIF"],
    ["backup.tar.gz", "application/gzip", "GZ"],
    // Types the browser guessed from the name: the name is the better source.
    ["poster.ps", "application/postscript", "PS"],
    ["report.pdf", "application/octet-stream", "PDF"],
    // Image types with no single format defer to the name.
    ["raw-photo.nef", "image/x-dcraw", "NEF"],
    ["print.epsf", "image/x-eps", "EPSF"],
  ])("labels %s (%s) as %s", (name, mime, expected) => {
    expect(fileFormatLabel(name, mime)).toBe(expected);
  });

  it.each([
    ["layered", "image/vnd.adobe.photoshop", "PSD"],
    ["Camera Import", "IMAGE/X-CANON-CR2", "CR2"],
    ["print", "image/x-eps", "EPS"],
    ["raw", "image/x-dcraw", "DCRAW"],
    ["notes", "text/plain; charset=utf-8", "PLAIN"],
    ["blob", "application/octet-stream", "OCTET-STREAM"],
    ["book", "application/epub+zip", "EPUB"],
    ["sheet", "application/vnd.ms-excel", "MS-EXCEL"],
    ["mystery", "", ""],
  ])("labels extensionless %j (%s) as %s", (name, mime, expected) => {
    expect(fileFormatLabel(name, mime)).toBe(expected);
  });

  it.each([
    // A leading dot names the file.
    [".env", "text/plain", "PLAIN"],
    // A trailing dot or a "word" with spaces after the last dot isn't an extension.
    ["draft.", "text/plain", "PLAIN"],
    ["Meeting notes v2.final copy", "text/plain", "PLAIN"],
    ["weird.ext-ension", "text/plain", "PLAIN"],
    // Numbers alone are a version or a time, not an extension.
    ["Report v1.2", "application/pdf", "PDF"],
    ["Scan 2026.10.02", "image/png", "PNG"],
  ])("ignores what isn't an extension in %j", (name, mime, expected) => {
    expect(fileFormatLabel(name, mime)).toBe(expected);
  });
});

describe("FileDetails handleOpenInTool deferred serverFileId (#1114)", () => {
  it("attaches each library file's serverFileId by entry id even when reordered before the timer runs", async () => {
    try {
      URL.createObjectURL = vi.fn(() => "blob:mock");
      URL.revokeObjectURL = vi.fn();
      const fileA = entry("first.png", "image/png");
      const fileB = entry("second.png", "image/png");
      vi.mocked(apiGetFileDetails).mockResolvedValue(fileA);
      useFilesPageStore.setState({
        files: [fileA, fileB],
        selectedFileId: fileA.id,
        checkedIds: new Set([fileA.id, fileB.id]),
      });
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string) =>
          Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "Content-Type": "image/png" }),
            blob: () => Promise.resolve(new Blob([input], { type: "image/png" })),
          } as Response),
        ),
      );

      const { fireEvent, act } = await import("@testing-library/react");
      render(
        <MemoryRouter>
          <FileDetails mobile />
        </MemoryRouter>,
      );

      const openBtn = await screen.findByRole("button", { name: /open.*file/i });
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      await act(async () => {
        fireEvent.click(openBtn);
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });

      expect(useFileStore.getState().entries).toHaveLength(2);
      // Reorder [first.png, second.png] -> [second.png, first.png] before the 0ms timer runs.
      act(() => {
        useFileStore.getState().reorderFiles(0, 1);
      });
      act(() => {
        vi.runAllTimers();
      });

      const { entries } = useFileStore.getState();
      expect(entries[1].file.name).toBe("first.png");
      expect(entries[1].serverFileId).toBe(fileA.id);
      expect(entries[0].file.name).toBe("second.png");
      expect(entries[0].serverFileId).toBe(fileB.id);
    } finally {
      useFileStore.getState().reset();
      vi.useRealTimers();
    }
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-path">{location.pathname}</div>;
}

describe("FileDetails hidden checked files and error states (#2904)", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    useFileStore.getState().reset();
    useFilesPageStore.setState({
      files: [],
      knownFiles: new Map(),
      total: 0,
      selectedFileId: null,
      checkedIds: new Set(),
      activeTab: "recent",
      searchQuery: "",
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    useFileStore.getState().reset();
  });

  it("opens checked files hidden by a search alongside visible checked files", async () => {
    const beaver = entry("beaver.png", "image/png");
    const otter = entry("otter.png", "image/png");

    // 1. Load both files and tick beaver.png.
    vi.mocked(apiListFiles).mockResolvedValueOnce({ files: [beaver, otter], total: 2 });
    await useFilesPageStore.getState().fetchFiles();
    useFilesPageStore.getState().toggleChecked(beaver.id);

    // 2. Search for otter so files holds only otter.png, then tick and select otter.png.
    useFilesPageStore.getState().setSearchQuery("otter");
    vi.mocked(apiListFiles).mockResolvedValueOnce({ files: [otter], total: 1 });
    await useFilesPageStore.getState().fetchFiles();
    useFilesPageStore.getState().toggleChecked(otter.id);
    useFilesPageStore.getState().selectFile(otter.id);

    vi.mocked(apiGetFileDetails).mockResolvedValue(otter);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          new Response(input, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          }),
        ),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/files"]}>
        <FileDetails mobile />
        <LocationProbe />
      </MemoryRouter>,
    );

    const openBtn = await screen.findByRole("button", { name: en.files.openFile });
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByTestId("location-path")).toHaveTextContent("/");
    });
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual([
      "beaver.png",
      "otter.png",
    ]);
  });

  it("shows an error state with retry when apiGetFileDetails fails instead of rendering blank", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const otter = entry("otter.png", "image/png");
    const cause = new Error("Database offline");
    vi.mocked(apiGetFileDetails).mockRejectedValueOnce(cause);
    useFilesPageStore.setState({ files: [otter], selectedFileId: otter.id });

    render(
      <MemoryRouter>
        <FileDetails mobile />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(en.files.details.loadFailed);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`[file-details] failed to load details for file ${otter.id}`),
      cause,
    );

    vi.mocked(apiGetFileDetails).mockResolvedValueOnce(otter);
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));

    expect(await screen.findByText("otter.png")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiGetFileDetails).toHaveBeenCalledTimes(2);
  });

  it("logs each failed download, surfaces an alert, and does not navigate when all downloads fail", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const beaver = entry("beaver.png", "image/png");
    const otter = entry("otter.png", "image/png");
    vi.mocked(apiGetFileDetails).mockResolvedValue(otter);
    useFilesPageStore.setState({
      files: [beaver, otter],
      selectedFileId: otter.id,
      checkedIds: new Set([beaver.id, otter.id]),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("Not found", { status: 404 }))),
    );

    render(
      <MemoryRouter initialEntries={["/files"]}>
        <FileDetails mobile />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: en.files.openFile }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 2 of 2 files.");
    expect(screen.getByTestId("location-path")).toHaveTextContent("/files");
    expect(useFileStore.getState().entries).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledTimes(2);

    // Toggling a checkbox clears the download error alert.
    act(() => {
      useFilesPageStore.getState().toggleChecked(beaver.id);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("catches a rejected download fetch without an unhandled rejection", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const otter = entry("otter.png", "image/png");
      const netErr = new TypeError("Failed to fetch");
      vi.mocked(apiGetFileDetails).mockResolvedValue(otter);
      useFilesPageStore.setState({
        files: [otter],
        selectedFileId: otter.id,
      });
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string) => {
          if (String(input).endsWith("/download")) {
            return Promise.reject(netErr);
          }
          return Promise.resolve(new Response("", { status: 404 }));
        }),
      );

      render(
        <MemoryRouter initialEntries={["/files"]}>
          <FileDetails mobile />
          <LocationProbe />
        </MemoryRouter>,
      );

      fireEvent.click(await screen.findByRole("button", { name: en.files.openFile }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 1 files.");
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(`[file-details] failed to download file ${otter.id}`),
        netErr,
      );
      expect(screen.getByTestId("location-path")).toHaveTextContent("/files");
      expect(useFileStore.getState().entries).toHaveLength(0);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("imports good files, keeps failed ones ticked, and navigates once retry succeeds", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const beaver = entry("beaver.png", "image/png");
    const otter = entry("otter.png", "image/png");
    vi.mocked(apiGetFileDetails).mockResolvedValue(otter);
    useFilesPageStore.setState({
      files: [beaver, otter],
      selectedFileId: otter.id,
      checkedIds: new Set([beaver.id, otter.id]),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (String(input).includes(`/${beaver.id}/download`)) {
          return Promise.resolve(new Response("Not found", { status: 404 }));
        }
        return Promise.resolve(new Response("png-bytes", { status: 200 }));
      }),
    );

    render(
      <MemoryRouter initialEntries={["/files"]}>
        <FileDetails mobile />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: en.files.openFile }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 2 files.");
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location-path")).toHaveTextContent("/files");
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["otter.png"]);
    expect(useFilesPageStore.getState().checkedIds).toEqual(new Set([beaver.id]));

    // Wait for the 0ms timer to attach serverFileId to otter.png.
    await new Promise((r) => setTimeout(r, 10));
    expect(
      useFileStore.getState().entries.map((e) => ({ name: e.file.name, id: e.serverFileId })),
    ).toEqual([{ name: "otter.png", id: otter.id }]);

    // A retry that fails again keeps partial-retry state so the next retry still targets beaver.png.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("Still failing", { status: 502 }))),
    );
    fireEvent.click(screen.getByRole("button", { name: en.files.openFile }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 1 files.");
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(useFilesPageStore.getState().checkedIds).toEqual(new Set([beaver.id]));

    // Retry succeeds for beaver.png, appends it with its serverFileId, and navigates.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("beaver-bytes", { status: 200 }))),
    );
    fireEvent.click(screen.getByRole("button", { name: en.files.openFile }));

    await waitFor(() => {
      expect(screen.getByTestId("location-path")).toHaveTextContent("/");
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(
      useFileStore.getState().entries.map((e) => ({ name: e.file.name, id: e.serverFileId })),
    ).toEqual([
      { name: "otter.png", id: otter.id },
      { name: "beaver.png", id: beaver.id },
    ]);
  });

  it("resets partial-retry state when the user changes checkedIds after a partial failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const beaver = entry("beaver.png", "image/png");
    const otter = entry("otter.png", "image/png");
    vi.mocked(apiGetFileDetails).mockResolvedValue(otter);
    useFilesPageStore.setState({
      files: [beaver, otter],
      selectedFileId: otter.id,
      checkedIds: new Set([beaver.id, otter.id]),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (String(input).includes(`/${beaver.id}/download`)) {
          return Promise.resolve(new Response("Not found", { status: 404 }));
        }
        return Promise.resolve(new Response("png-bytes", { status: 200 }));
      }),
    );

    render(
      <MemoryRouter initialEntries={["/files"]}>
        <FileDetails mobile />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: en.files.openFile }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 2 files.");
    expect(useFilesPageStore.getState().checkedIds).toEqual(new Set([beaver.id]));

    // Unticking beaver.png clears the alert and resets partial-retry state so the next open uses setFiles([otter.png]).
    act(() => {
      useFilesPageStore.getState().toggleChecked(beaver.id);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.files.openFile }));
    await waitFor(() => {
      expect(screen.getByTestId("location-path")).toHaveTextContent("/");
    });
    expect(useFileStore.getState().entries.map((e) => e.file.name)).toEqual(["otter.png"]);
  });

  it("keeps the selected file compatible via knownFiles when a search hides it under filterMimePrefix", async () => {
    const beaver = entry("beaver.png", "image/png");
    const otter = entry("otter.png", "image/png");
    vi.mocked(apiListFiles).mockResolvedValueOnce({ files: [beaver, otter], total: 2 });
    await useFilesPageStore.getState().fetchFiles();
    useFilesPageStore.getState().selectFile(beaver.id);
    vi.mocked(apiGetFileDetails).mockResolvedValue(beaver);

    render(
      <MemoryRouter>
        <FileDetails filterMimePrefix="image/" mobile />
      </MemoryRouter>,
    );

    expect(await screen.findByText("beaver.png")).toBeInTheDocument();

    // Search filters out beaver.png from files, but knownFiles retains it.
    useFilesPageStore.getState().setSearchQuery("otter");
    vi.mocked(apiListFiles).mockResolvedValueOnce({ files: [otter], total: 1 });
    await act(async () => {
      await useFilesPageStore.getState().fetchFiles();
    });

    expect(screen.getByText("beaver.png")).toBeInTheDocument();
    expect(screen.queryByText(en.files.selectFilePrompt)).not.toBeInTheDocument();
  });

  it("ignores a stale apiGetFileDetails failure or resolution after switching files and clears detailError on switch", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const beaver = entry("beaver.png", "image/png");
    const otter = entry("otter.png", "image/png");
    const seal = entry("seal.png", "image/png");
    let rejectFirst!: (err: Error) => void;
    let resolveSecond!: (detail: UserFileDetail) => void;
    let rejectSecond!: (err: Error) => void;
    let resolveThird!: (detail: UserFileDetail) => void;
    vi.mocked(apiGetFileDetails).mockImplementation((id: string) => {
      if (id === beaver.id) {
        return new Promise((_res, rej) => {
          rejectFirst = rej;
        });
      }
      if (id === otter.id) {
        return new Promise((res, rej) => {
          resolveSecond = res;
          rejectSecond = rej;
        });
      }
      return new Promise((res) => {
        resolveThird = res;
      });
    });

    useFilesPageStore.setState({
      files: [beaver, otter, seal],
      selectedFileId: beaver.id,
    });

    render(
      <MemoryRouter>
        <FileDetails mobile />
      </MemoryRouter>,
    );

    act(() => {
      useFilesPageStore.getState().selectFile(otter.id);
    });

    await act(async () => {
      rejectFirst(new Error("stale failure"));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Let otter.png fail while active so detailError is shown, then switch to seal.png.
    await act(async () => {
      rejectSecond(new Error("active failure"));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(en.files.details.loadFailed);

    // Switching to seal.png immediately clears the error alert while seal.png loads.
    act(() => {
      useFilesPageStore.getState().selectFile(seal.id);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // A stale resolution from an earlier request is ignored.
    await act(async () => {
      resolveSecond(otter);
    });
    expect(screen.queryByText("otter.png")).not.toBeInTheDocument();

    await act(async () => {
      resolveThird(seal);
    });
    expect(await screen.findByText("seal.png")).toBeInTheDocument();
  });

  it("ignores an in-flight download that settles after switching files or unmounting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const beaver = entry("beaver.png", "image/png");
    const otter = entry("otter.png", "image/png");
    vi.mocked(apiGetFileDetails).mockImplementation(async (id: string) =>
      id === beaver.id ? beaver : otter,
    );
    useFilesPageStore.setState({
      files: [beaver, otter],
      selectedFileId: beaver.id,
    });

    let resolveDownload!: (res: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (String(input).endsWith("/download")) {
          return new Promise<Response>((res) => {
            resolveDownload = res;
          });
        }
        return Promise.resolve(new Response("", { status: 404 }));
      }),
    );

    const view = render(
      <MemoryRouter initialEntries={["/files"]}>
        <FileDetails mobile />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: en.files.openFile }));
    expect(screen.getByRole("button", { name: en.files.openFile })).toBeDisabled();

    // Switching files invalidates the in-flight open and re-enables the button on the next file.
    await act(async () => {
      useFilesPageStore.getState().selectFile(otter.id);
    });
    expect(await screen.findByText("otter.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.files.openFile })).toBeEnabled();

    await act(async () => {
      resolveDownload(new Response("Not found", { status: 404 }));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(useFileStore.getState().entries).toHaveLength(0);

    view.unmount();
  });
});
