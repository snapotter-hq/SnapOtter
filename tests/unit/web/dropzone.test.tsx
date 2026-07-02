// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dropzone, isImageFile } from "@/components/common/dropzone";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeFile(name: string, type = "image/png", size = 1024): File {
  const buf = new ArrayBuffer(size);
  return new File([buf], name, { type });
}

function makeDataTransfer(files: File[]): DataTransfer {
  return { files } as unknown as DataTransfer;
}

function makePasteEvent({
  items = [],
  files = [] as File[],
}: {
  items?: Array<{ kind: string; type: string; getAsFile: () => File | null }>;
  files?: File[];
}) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { items, files },
  });
  return event;
}

/** Simulate paste via clipboardData.items (e.g. screenshot paste in browser). */
function pasteViaItems(files: File[]) {
  const items = files.map((f) => ({
    kind: "file" as const,
    type: f.type,
    getAsFile: () => f,
  }));
  const event = makePasteEvent({ items, files: [] as unknown as File[] });
  document.dispatchEvent(event);
  return event;
}

/** Simulate paste via clipboardData.files (e.g. Cmd+C files from Finder on macOS). */
function pasteViaFiles(files: File[]) {
  const event = makePasteEvent({ items: [], files });
  document.dispatchEvent(event);
  return event;
}

/**
 * Spy on HTMLInputElement.prototype.click to capture the programmatically
 * created file input. Returns a getter for the captured input.
 */
function spyFileInput() {
  let captured: HTMLInputElement | null = null;
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
    this: HTMLInputElement,
  ) {
    if (this.type === "file") captured = this;
  });
  return () => captured;
}

// ---------------------------------------------------------------------------
// isImageFile
// ---------------------------------------------------------------------------
describe("isImageFile", () => {
  it("accepts files with image/* MIME type", () => {
    expect(isImageFile(makeFile("photo.jpg", "image/jpeg"))).toBe(true);
    expect(isImageFile(makeFile("photo.png", "image/png"))).toBe(true);
    expect(isImageFile(makeFile("photo.webp", "image/webp"))).toBe(true);
    expect(isImageFile(makeFile("icon.svg", "image/svg+xml"))).toBe(true);
  });

  it("accepts common image extensions even without MIME type", () => {
    const formats = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif", "tiff", "ico"];
    for (const ext of formats) {
      expect(isImageFile(makeFile(`file.${ext}`, ""))).toBe(true);
    }
  });

  it("accepts HEIC/HEIF variants", () => {
    expect(isImageFile(makeFile("photo.heic", ""))).toBe(true);
    expect(isImageFile(makeFile("photo.heif", ""))).toBe(true);
    expect(isImageFile(makeFile("photo.hif", ""))).toBe(true);
  });

  it("accepts RAW camera formats", () => {
    const raw = ["dng", "cr2", "cr3", "nef", "nrw", "arw", "orf", "rw2", "raf", "pef"];
    for (const ext of raw) {
      expect(isImageFile(makeFile(`raw.${ext}`, ""))).toBe(true);
    }
  });

  it("accepts professional/specialized formats", () => {
    const pro = ["psd", "exr", "hdr", "tga", "eps", "dds", "qoi", "dpx", "cin"];
    for (const ext of pro) {
      expect(isImageFile(makeFile(`file.${ext}`, ""))).toBe(true);
    }
  });

  it("accepts JPEG 2000 variants", () => {
    const jp2 = ["jp2", "j2k", "j2c", "jpc", "jpf", "jpx"];
    for (const ext of jp2) {
      expect(isImageFile(makeFile(`file.${ext}`, ""))).toBe(true);
    }
  });

  it("accepts netpbm/scientific formats", () => {
    const pbm = ["pbm", "pgm", "ppm", "pnm", "pam", "pfm", "fits", "fit", "fts"];
    for (const ext of pbm) {
      expect(isImageFile(makeFile(`file.${ext}`, ""))).toBe(true);
    }
  });

  it("is case-insensitive for extensions", () => {
    expect(isImageFile(makeFile("PHOTO.HEIC", ""))).toBe(true);
    expect(isImageFile(makeFile("file.PSD", ""))).toBe(true);
    expect(isImageFile(makeFile("scan.Tiff", ""))).toBe(true);
  });

  it("rejects non-image files", () => {
    expect(isImageFile(makeFile("doc.pdf", "application/pdf"))).toBe(false);
    expect(isImageFile(makeFile("data.json", "application/json"))).toBe(false);
    expect(isImageFile(makeFile("script.js", "text/javascript"))).toBe(false);
    expect(isImageFile(makeFile("readme.txt", "text/plain"))).toBe(false);
    expect(isImageFile(makeFile("archive.zip", "application/zip"))).toBe(false);
  });

  it("rejects files with no extension and no image MIME", () => {
    expect(isImageFile(makeFile("noext", ""))).toBe(false);
    expect(isImageFile(makeFile("noext", "application/octet-stream"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dropzone rendering
// ---------------------------------------------------------------------------
describe("Dropzone", () => {
  describe("rendering", () => {
    it("renders upload button and helper text", () => {
      render(<Dropzone />);
      expect(screen.getByText("Upload from computer")).toBeDefined();
      expect(screen.getByText("Drop your files here")).toBeDefined();
      expect(screen.getByText("use the upload button, or paste from clipboard")).toBeDefined();
    });

    it("shows supported formats hint", () => {
      render(<Dropzone />);
      expect(
        screen.getByText("Images, Videos, Audio, PDFs, Documents, and 150+ formats"),
      ).toBeDefined();
    });

    it("renders the drop zone section with aria label", () => {
      render(<Dropzone />);
      expect(screen.getByLabelText("File drop zone")).toBeDefined();
    });

    it("does not show file list when no files provided", () => {
      render(<Dropzone />);
      expect(screen.queryByText(/files selected/)).toBeNull();
    });

    it("does not show file list for a single file", () => {
      render(<Dropzone currentFiles={[makeFile("a.png")]} />);
      expect(screen.queryByText(/files selected/)).toBeNull();
    });

    it("shows file count and list when multiple files are provided", () => {
      const files = [makeFile("a.png", "image/png", 2048), makeFile("b.jpg", "image/jpeg", 4096)];
      render(<Dropzone currentFiles={files} />);
      expect(screen.getByText("2 files selected")).toBeDefined();
      expect(screen.getByText("a.png")).toBeDefined();
      expect(screen.getByText("b.jpg")).toBeDefined();
      expect(screen.getByText("2 KB")).toBeDefined();
      expect(screen.getByText("4 KB")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Click to upload
  // ---------------------------------------------------------------------------
  describe("click to upload", () => {
    it("keeps the drop zone drag-only when the section is clicked", () => {
      const getInput = spyFileInput();
      render(<Dropzone />);

      fireEvent.click(screen.getByLabelText("File drop zone"));
      expect(getInput()).toBeNull();
    });

    it("opens file picker when the Upload button is clicked", () => {
      const getInput = spyFileInput();
      render(<Dropzone />);

      fireEvent.click(screen.getByRole("button", { name: "Upload from computer" }));
      expect(getInput()).not.toBeNull();
    });

    it("sets multiple attribute on the file input by default", () => {
      const getInput = spyFileInput();
      render(<Dropzone />);

      fireEvent.click(screen.getByRole("button", { name: "Upload from computer" }));
      expect(getInput()?.multiple).toBe(true);
    });

    it("disables multiple when multiple=false", () => {
      const getInput = spyFileInput();
      render(<Dropzone multiple={false} />);

      fireEvent.click(screen.getByRole("button", { name: "Upload from computer" }));
      expect(getInput()?.multiple).toBe(false);
    });

    it("sets accept attribute when accept prop is provided", () => {
      const getInput = spyFileInput();
      render(<Dropzone accept="image/*" />);

      fireEvent.click(screen.getByRole("button", { name: "Upload from computer" }));
      const input = getInput()!;
      expect(input.accept).toContain("image/*");
      expect(input.accept).toContain(".heic");
      expect(input.accept).toContain(".psd");
    });

    it("calls onFiles when files are selected via file picker", () => {
      const onFiles = vi.fn();
      const getInput = spyFileInput();
      render(<Dropzone onFiles={onFiles} />);

      fireEvent.click(screen.getByRole("button", { name: "Upload from computer" }));
      const input = getInput()!;

      const file = makeFile("photo.png");
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.onchange?.({ target: input } as unknown as Event);

      expect(onFiles).toHaveBeenCalledWith([file]);
    });

    it("calls onFiles with multiple files from file picker", () => {
      const onFiles = vi.fn();
      const getInput = spyFileInput();
      render(<Dropzone onFiles={onFiles} />);

      fireEvent.click(screen.getByRole("button", { name: "Upload from computer" }));
      const input = getInput()!;

      const files = [makeFile("a.png"), makeFile("b.jpg", "image/jpeg")];
      Object.defineProperty(input, "files", { value: files, configurable: true });
      input.onchange?.({ target: input } as unknown as Event);

      expect(onFiles).toHaveBeenCalledWith(files);
    });

    it("does not call onFiles when no files are selected (dialog cancelled)", () => {
      const onFiles = vi.fn();
      const getInput = spyFileInput();
      render(<Dropzone onFiles={onFiles} />);

      fireEvent.click(screen.getByRole("button", { name: "Upload from computer" }));
      const input = getInput()!;

      Object.defineProperty(input, "files", { value: [], configurable: true });
      input.onchange?.({ target: input } as unknown as Event);

      expect(onFiles).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Drag and drop
  // ---------------------------------------------------------------------------
  describe("drag and drop", () => {
    it("calls onFiles with image files on drop", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);
      const zone = screen.getByLabelText("File drop zone");

      const png = makeFile("a.png", "image/png");
      fireEvent.drop(zone, { dataTransfer: makeDataTransfer([png]) });

      expect(onFiles).toHaveBeenCalledWith([png]);
    });

    it("filters out non-image files on drop", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} fileFilter={isImageFile} />);
      const zone = screen.getByLabelText("File drop zone");

      const png = makeFile("a.png", "image/png");
      const pdf = makeFile("doc.pdf", "application/pdf");
      fireEvent.drop(zone, { dataTransfer: makeDataTransfer([png, pdf]) });

      expect(onFiles).toHaveBeenCalledWith([png]);
    });

    it("does not call onFiles when all dropped files are non-image", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} fileFilter={isImageFile} />);
      const zone = screen.getByLabelText("File drop zone");

      const pdf = makeFile("doc.pdf", "application/pdf");
      fireEvent.drop(zone, { dataTransfer: makeDataTransfer([pdf]) });

      expect(onFiles).not.toHaveBeenCalled();
    });

    it("handles multiple image files on drop", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);
      const zone = screen.getByLabelText("File drop zone");

      const files = [
        makeFile("a.png", "image/png"),
        makeFile("b.jpg", "image/jpeg"),
        makeFile("c.webp", "image/webp"),
      ];
      fireEvent.drop(zone, { dataTransfer: makeDataTransfer(files) });

      expect(onFiles).toHaveBeenCalledWith(files);
    });

    it("accepts RAW files identified by extension on drop", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);
      const zone = screen.getByLabelText("File drop zone");

      const raw = makeFile("photo.cr3", "");
      fireEvent.drop(zone, { dataTransfer: makeDataTransfer([raw]) });

      expect(onFiles).toHaveBeenCalledWith([raw]);
    });

    it("accepts HEIC files on drop", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);
      const zone = screen.getByLabelText("File drop zone");

      const heic = makeFile("photo.heic", "");
      fireEvent.drop(zone, { dataTransfer: makeDataTransfer([heic]) });

      expect(onFiles).toHaveBeenCalledWith([heic]);
    });

    it("accepts PSD files on drop", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);
      const zone = screen.getByLabelText("File drop zone");

      const psd = makeFile("design.psd", "");
      fireEvent.drop(zone, { dataTransfer: makeDataTransfer([psd]) });

      expect(onFiles).toHaveBeenCalledWith([psd]);
    });

    it("shows drag-active styling on dragenter and removes on dragleave", () => {
      render(<Dropzone />);
      const zone = screen.getByLabelText("File drop zone");

      fireEvent.dragEnter(zone);
      expect(zone.className).toContain("border-primary");
      expect(zone.className).toContain("bg-primary/10");

      fireEvent.dragLeave(zone);
      expect(zone.className).not.toContain("bg-primary/10");
    });

    it("shows drag-active styling on dragover", () => {
      render(<Dropzone />);
      const zone = screen.getByLabelText("File drop zone");

      fireEvent.dragOver(zone);
      expect(zone.className).toContain("bg-primary/10");
    });

    it("removes drag styling after drop", () => {
      render(<Dropzone />);
      const zone = screen.getByLabelText("File drop zone");

      fireEvent.dragEnter(zone);
      expect(zone.className).toContain("bg-primary/10");

      fireEvent.drop(zone, { dataTransfer: makeDataTransfer([]) });
      expect(zone.className).not.toContain("bg-primary/10");
    });
  });

  // ---------------------------------------------------------------------------
  // Clipboard paste
  // ---------------------------------------------------------------------------
  describe("clipboard paste", () => {
    it("calls onFiles when an image is pasted", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const file = makeFile("screenshot.png", "image/png");
      pasteViaItems([file]);

      expect(onFiles).toHaveBeenCalledWith([file]);
    });

    it("handles multiple pasted images", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const files = [makeFile("a.png", "image/png"), makeFile("b.jpg", "image/jpeg")];
      pasteViaItems(files);

      expect(onFiles).toHaveBeenCalledWith(files);
    });

    it("accepts pasted HEIC image", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const heic = makeFile("photo.heic", "image/heic");
      pasteViaItems([heic]);

      expect(onFiles).toHaveBeenCalledWith([heic]);
    });

    it("filters out non-image files from paste", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} fileFilter={isImageFile} />);

      const png = makeFile("a.png", "image/png");
      const txt = makeFile("notes.txt", "text/plain");
      pasteViaItems([png, txt]);

      expect(onFiles).toHaveBeenCalledWith([png]);
    });

    it("does not call onFiles when pasted content has no image files", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} fileFilter={isImageFile} />);

      pasteViaItems([makeFile("doc.pdf", "application/pdf")]);

      expect(onFiles).not.toHaveBeenCalled();
    });

    it("ignores paste with no clipboardData items and no files", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const event = new Event("paste", { bubbles: true });
      Object.defineProperty(event, "clipboardData", { value: { items: [], files: [] } });
      document.dispatchEvent(event);

      expect(onFiles).not.toHaveBeenCalled();
    });

    it("ignores paste with no clipboardData at all", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const event = new Event("paste", { bubbles: true });
      Object.defineProperty(event, "clipboardData", { value: null });
      document.dispatchEvent(event);

      expect(onFiles).not.toHaveBeenCalled();
    });

    it("ignores text-only paste (no file items)", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const event = new Event("paste", { bubbles: true });
      Object.defineProperty(event, "clipboardData", {
        value: {
          files: [],
          items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
        },
      });
      document.dispatchEvent(event);

      expect(onFiles).not.toHaveBeenCalled();
    });

    it("prevents default on paste when image files are found", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const file = makeFile("img.png", "image/png");
      const event = pasteViaItems([file]);

      expect(event.defaultPrevented).toBe(true);
    });

    it("does not prevent default on paste when no image files", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} fileFilter={isImageFile} />);

      const event = pasteViaItems([makeFile("doc.pdf", "application/pdf")]);

      expect(event.defaultPrevented).toBe(false);
    });

    it("removes paste listener on unmount", () => {
      const onFiles = vi.fn();
      const { unmount } = render(<Dropzone onFiles={onFiles} />);
      unmount();

      pasteViaItems([makeFile("a.png", "image/png")]);

      expect(onFiles).not.toHaveBeenCalled();
    });

    it("handles paste where getAsFile returns null", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: {
          files: [],
          items: [{ kind: "file", type: "image/png", getAsFile: () => null }],
        },
      });
      document.dispatchEvent(event);

      expect(onFiles).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Clipboard paste via clipboardData.files (macOS Finder Cmd+C)
  // ---------------------------------------------------------------------------
  describe("clipboard paste via files (Finder)", () => {
    it("handles multiple files copied from Finder", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const files = [
        makeFile("photo1.png", "image/png"),
        makeFile("photo2.jpg", "image/jpeg"),
        makeFile("photo3.webp", "image/webp"),
      ];
      pasteViaFiles(files);

      expect(onFiles).toHaveBeenCalledWith(files);
    });

    it("handles a single file from Finder", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const file = makeFile("photo.png", "image/png");
      pasteViaFiles([file]);

      expect(onFiles).toHaveBeenCalledWith([file]);
    });

    it("filters non-image files from Finder paste", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} fileFilter={isImageFile} />);

      const png = makeFile("photo.png", "image/png");
      const pdf = makeFile("doc.pdf", "application/pdf");
      pasteViaFiles([png, pdf]);

      expect(onFiles).toHaveBeenCalledWith([png]);
    });

    it("ignores Finder paste with only non-image files", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} fileFilter={isImageFile} />);

      pasteViaFiles([makeFile("doc.pdf", "application/pdf")]);

      expect(onFiles).not.toHaveBeenCalled();
    });

    it("accepts RAW and HEIC files from Finder", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const files = [
        makeFile("photo.heic", ""),
        makeFile("raw.cr3", ""),
        makeFile("design.psd", ""),
      ];
      pasteViaFiles(files);

      expect(onFiles).toHaveBeenCalledWith(files);
    });

    it("prefers clipboardData.files over items when both are present", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const fileFromFiles = makeFile("from-files.png", "image/png");
      const fileFromItems = makeFile("from-items.png", "image/png");

      const event = makePasteEvent({
        files: [fileFromFiles],
        items: [{ kind: "file", type: "image/png", getAsFile: () => fileFromItems }],
      });
      document.dispatchEvent(event);

      expect(onFiles).toHaveBeenCalledWith([fileFromFiles]);
    });

    it("falls back to items when files is empty", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const file = makeFile("screenshot.png", "image/png");
      const event = makePasteEvent({
        files: [],
        items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
      });
      document.dispatchEvent(event);

      expect(onFiles).toHaveBeenCalledWith([file]);
    });

    it("prevents default when files are found via clipboardData.files", () => {
      const onFiles = vi.fn();
      render(<Dropzone onFiles={onFiles} />);

      const event = pasteViaFiles([makeFile("photo.png", "image/png")]);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Compact mode
  // ---------------------------------------------------------------------------
  describe("compact mode", () => {
    it("renders without min-height in compact mode", () => {
      render(<Dropzone compact />);
      const zone = screen.getByLabelText("File drop zone");
      expect(zone.className).toContain("min-h-0");
      expect(zone.className).not.toContain("min-h-[400px]");
    });

    it("uses standard min-height in default mode", () => {
      render(<Dropzone />);
      const zone = screen.getByLabelText("File drop zone");
      expect(zone.className).toContain("min-h-[400px]");
      expect(zone.className).not.toContain("min-h-0");
    });
  });

  // ---------------------------------------------------------------------------
  // No onFiles callback (graceful no-op)
  // ---------------------------------------------------------------------------
  describe("without onFiles callback", () => {
    it("does not throw on drop without onFiles", () => {
      render(<Dropzone />);
      const zone = screen.getByLabelText("File drop zone");

      expect(() => {
        fireEvent.drop(zone, { dataTransfer: makeDataTransfer([makeFile("a.png")]) });
      }).not.toThrow();
    });

    it("does not throw on paste without onFiles", () => {
      render(<Dropzone />);

      expect(() => {
        pasteViaItems([makeFile("a.png")]);
      }).not.toThrow();
    });

    it("does not throw on click without onFiles", () => {
      spyFileInput();
      render(<Dropzone />);

      expect(() => {
        fireEvent.click(screen.getByLabelText("File drop zone"));
      }).not.toThrow();
    });
  });
});
