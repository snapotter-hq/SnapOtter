export type Modality = "image" | "video" | "audio" | "document" | "file";

export interface ModalityInfo {
  id: Modality;
  name: string;
  icon: string; // lucide icon name, same convention as CategoryInfo
  color: string;
}

// Five modality values in code; "document" and "file" group as one
// "Documents & Files" area in the UI (see spec 4.5).
export const MODALITIES: ModalityInfo[] = [
  { id: "image", name: "Image", icon: "Image", color: "#3B82F6" },
  { id: "video", name: "Video", icon: "Video", color: "#EF4444" },
  { id: "audio", name: "Audio", icon: "AudioLines", color: "#10B981" },
  { id: "document", name: "Documents", icon: "FileText", color: "#8B5CF6" },
  { id: "file", name: "Files", icon: "FileArchive", color: "#F59E0B" },
];

// Which BullMQ pool a modality's tools run on. AI tools override to "ai"
// at enqueue time regardless of modality.
export const MODALITY_POOL: Record<Modality, "image" | "media" | "docs"> = {
  image: "image",
  video: "media",
  audio: "media",
  document: "docs",
  file: "docs",
};

// Default accepted input extensions per modality (with dots; drives the
// file picker accept attribute and docs). Tools may narrow this.
export const IMAGE_INPUTS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".avif",
  ".heic",
  ".heif",
  ".svg",
  ".svgz",
  ".ico",
  ".jxl",
  ".jp2",
  ".psd",
  ".tga",
  ".exr",
  ".hdr",
  ".dng",
  ".cr2",
  ".nef",
  ".arw",
  ".orf",
  ".rw2",
  ".ppm",
  ".pgm",
  ".pbm",
  ".qoi",
  ".dds",
  ".fits",
  ".dpx",
  ".apng",
  ".cur",
  ".eps",
];
export const VIDEO_INPUTS = [
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
  ".m4v",
  ".mts",
  ".m2ts",
  ".3gp",
  ".flv",
  ".wmv",
  ".mpg",
  ".mpeg",
  ".ts",
  ".ogv",
];
export const AUDIO_INPUTS = [
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".ogg",
  ".opus",
  ".wma",
  ".aiff",
  ".amr",
  ".ac3",
];
export const DOCUMENT_INPUTS = [
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".pptx",
  ".ppt",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
  ".txt",
  ".md",
  ".html",
  ".epub",
  ".mobi",
  ".azw3",
];
export const FILE_INPUTS = [".csv", ".json", ".xml", ".yaml", ".yml", ".zip"];

export function detectModalityFromMime(mime: string): Modality {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime === "application/pdf" ||
    mime.includes("officedocument") ||
    mime.includes("msword") ||
    mime.includes("ms-excel") ||
    mime.includes("ms-powerpoint") ||
    mime === "application/epub+zip" ||
    mime.startsWith("text/html")
  ) {
    return "document";
  }
  return "file";
}
