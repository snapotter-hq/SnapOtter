// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiGetFileDetails: vi.fn() };
});

import { FileDetails } from "@/components/files/file-details";
import { apiGetFileDetails, type UserFileDetail } from "@/lib/api";
import { fileFormatLabel } from "@/lib/file-format-label";
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
