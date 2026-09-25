import { formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";

const SERVER_PREVIEW_EXTENSIONS = new Set([
  "heic",
  "heif",
  "hif",
  "jxl",
  "ico",
  "tiff",
  "tif",
  "dng",
  "cr2",
  "cr3",
  "nef",
  "nrw",
  "arw",
  "orf",
  "rw2",
  "raf",
  "pef",
  "3fr",
  "iiq",
  "srw",
  "x3f",
  "rwl",
  "gpr",
  "fff",
  "mrw",
  "mef",
  "kdc",
  "dcr",
  "erf",
  "ptx",
  "tga",
  "psd",
  "exr",
  "hdr",
  "dds",
  "dpx",
  "cin",
  "eps",
  "epsf",
  "fits",
  "fit",
  "fts",
  "jp2",
  "j2k",
  "j2c",
  "jpc",
  "jpf",
  "jpx",
  "pbm",
  "pgm",
  "ppm",
  "pnm",
  "pam",
  "pfm",
  "qoi",
  "svgz",
  "cur",
]);

export function needsServerPreview(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return SERVER_PREVIEW_EXTENSIONS.has(ext);
}

export interface DecodedPreview {
  url: string;
  originalWidth: number | null;
  originalHeight: number | null;
}

export async function fetchDecodedPreview(file: File): Promise<DecodedPreview | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(appUrl("/api/v1/preview"), {
      method: "POST",
      headers: formatHeaders(),
      body: formData,
    });
    if (!res.ok) return null;

    const w = Number(res.headers.get("X-Original-Width"));
    const h = Number(res.headers.get("X-Original-Height"));

    const blob = await res.blob();
    return {
      url: URL.createObjectURL(blob),
      originalWidth: w > 0 ? w : null,
      originalHeight: h > 0 ? h : null,
    };
  } catch {
    return null;
  }
}

export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}
