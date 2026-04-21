import { formatHeaders } from "@/lib/api";

const SERVER_PREVIEW_EXTENSIONS = new Set([
  "heic", "heif", "hif",                       // HEIF
  "jxl",                                         // JPEG XL (Chrome dropped support)
  "dng", "cr2", "nef", "arw", "orf", "rw2",     // Camera RAW
  "tga",                                         // Targa
  "psd",                                         // Photoshop
  "exr",                                         // OpenEXR
  "hdr",                                         // Radiance HDR
]);

export function needsServerPreview(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return SERVER_PREVIEW_EXTENSIONS.has(ext);
}

export async function fetchDecodedPreview(file: File): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/v1/preview", {
      method: "POST",
      headers: formatHeaders(),
      body: formData,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}
