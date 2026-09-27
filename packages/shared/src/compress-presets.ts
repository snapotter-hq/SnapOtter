import { IMAGE_INPUTS } from "./modality.js";
import type { Tool } from "./types.js";

/** The tool a preset runs, with its target-size mode locked on. */
export type CompressPresetBase = "compress" | "compress-pdf";

export interface CompressPreset {
  id: string;
  sizeKb: number;
  targetSizeKb: number;
  /** Target as shown to people: "100 KB", "1 MB" (decimal units, see target-size.ts). */
  label: string;
  name: string;
  description: string;
  base: CompressPresetBase;
  locked: {
    mode: "targetSize";
    targetSizeKb: number;
  };
  lockedSettings: {
    mode: "targetSize";
    targetSizeKb: number;
  };
  sourceInputs: string[];
}

function imagePreset(sizeKb: number): CompressPreset {
  return {
    id: `compress-image-to-${sizeKb}kb`,
    sizeKb,
    targetSizeKb: sizeKb,
    label: `${sizeKb} KB`,
    name: `Compress Image to ${sizeKb} KB`,
    description: `Compress image file size to under ${sizeKb} KB`,
    base: "compress",
    locked: { mode: "targetSize", targetSizeKb: sizeKb },
    lockedSettings: { mode: "targetSize", targetSizeKb: sizeKb },
    sourceInputs: IMAGE_INPUTS,
  };
}

// #1070: the caps people hit on government portals, applications and email.
function pdfPreset(sizeKb: number): CompressPreset {
  const mb = sizeKb >= 1000 ? sizeKb / 1000 : null;
  const label = mb ? `${mb} MB` : `${sizeKb} KB`;
  return {
    id: `compress-pdf-to-${mb ? `${mb}mb` : `${sizeKb}kb`}`,
    sizeKb,
    targetSizeKb: sizeKb,
    label,
    name: `Compress PDF to ${label}`,
    description: `Compress PDF file size to under ${label}`,
    base: "compress-pdf",
    locked: { mode: "targetSize", targetSizeKb: sizeKb },
    lockedSettings: { mode: "targetSize", targetSizeKb: sizeKb },
    sourceInputs: [".pdf"],
  };
}

export const COMPRESS_PRESETS: CompressPreset[] = [
  ...[20, 50, 100, 200, 500].map(imagePreset),
  ...[100, 200, 500, 1000, 2000].map(pdfPreset),
];

export const COMPRESS_PRESET_BY_ID: Record<string, CompressPreset> = Object.fromEntries(
  COMPRESS_PRESETS.map((p) => [p.id, p]),
);

function imageKeywords(sizeKb: number): string[] {
  return [
    `compress image to ${sizeKb}kb`,
    `compress image to ${sizeKb} kb`,
    `compress image ${sizeKb}kb`,
    `compress image ${sizeKb} kb`,
    `compress to ${sizeKb}kb`,
    `compress to ${sizeKb} kb`,
    `${sizeKb}kb`,
    `${sizeKb} kb`,
    `image under ${sizeKb}kb`,
    `reduce image to ${sizeKb}kb`,
    `reduce photo size to ${sizeKb}kb`,
  ];
}

function pdfKeywords(label: string): string[] {
  const compact = label.replace(" ", "").toLowerCase(); // "100kb", "1mb"
  const spaced = label.toLowerCase(); // "100 kb", "1 mb"
  return [
    `compress pdf to ${compact}`,
    `compress pdf to ${spaced}`,
    `compress pdf ${compact}`,
    `compress pdf ${spaced}`,
    `pdf under ${compact}`,
    `pdf under ${spaced}`,
    `reduce pdf to ${compact}`,
    `reduce pdf size to ${compact}`,
    `shrink pdf to ${compact}`,
  ];
}

export function expandCompressPresets(baseTools?: Tool[]): Tool[] {
  return COMPRESS_PRESETS.map((p) => {
    const base = baseTools?.find((t) => t.id === p.base);
    if (p.base === "compress-pdf") {
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        category: base?.category ?? "pdf-optimize",
        icon: base?.icon ?? "FileArchive",
        route: `/${p.id}`,
        modality: "document",
        acceptedInputs: p.sourceInputs,
        executionHint: base?.executionHint ?? "long",
        keywords: pdfKeywords(p.label),
      } satisfies Tool;
    }
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      category: "essentials",
      icon: "Minimize2",
      route: `/${p.id}`,
      modality: "image",
      acceptedInputs: p.sourceInputs,
      executionHint: base?.executionHint ?? "fast",
      keywords: imageKeywords(p.sizeKb),
    } satisfies Tool;
  });
}
