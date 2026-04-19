import { formatHeaders } from "@/lib/api";

const HEIF_EXTENSIONS = new Set(["heic", "heif", "hif"]);

export function needsServerPreview(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return HEIF_EXTENSIONS.has(ext);
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
