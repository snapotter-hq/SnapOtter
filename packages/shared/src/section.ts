import { MODALITIES, type Modality } from "./modality.js";
import type { Tool } from "./types.js";

export type Section = "image" | "video" | "audio" | "pdf" | "files";

export interface SectionInfo {
  id: Section;
  name: string;
  icon: string;
  color: string;
  order: number;
}

// Reuse the existing modality visuals so icon/color have one source of truth.
function visualOf(modality: Modality): { icon: string; color: string } {
  const m = MODALITIES.find((x) => x.id === modality);
  return { icon: m?.icon ?? "File", color: m?.color ?? "#6B7280" };
}

export const SECTIONS: SectionInfo[] = [
  { id: "image", name: "Image", order: 0, ...visualOf("image") },
  { id: "video", name: "Video", order: 1, ...visualOf("video") },
  { id: "audio", name: "Audio", order: 2, ...visualOf("audio") },
  { id: "pdf", name: "PDF", order: 3, ...visualOf("document") },
  { id: "files", name: "Files", order: 4, ...visualOf("file") },
];

// A tool's presentation section. The backend Modality enum is unchanged;
// the "document" modality splits by whether the tool ingests PDFs.
export function toolSection(tool: Pick<Tool, "modality" | "acceptedInputs">): Section {
  switch (tool.modality) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "file":
      return "files";
    case "document":
      return tool.acceptedInputs.includes(".pdf") ? "pdf" : "files";
  }
}
