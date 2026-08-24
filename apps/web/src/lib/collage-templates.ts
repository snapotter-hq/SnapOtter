export interface CollageCell {
  gridColumn: string;
  gridRow: string;
}

export interface CollageTemplate {
  id: string;
  imageCount: number;
  /** English label kept as data; display goes through collageTemplateLabel() */
  label: string;
  /** Key in the toolSettings.collage i18n block for the translated label */
  labelKey: string;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  cells: CollageCell[];
}

export const COLLAGE_TEMPLATES: CollageTemplate[] = [
  // ── 2 images ──────────────────────────────────────────────────────
  {
    id: "2-h-equal",
    imageCount: 2,
    label: "Side by side",
    labelKey: "sideBySide",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
    ],
  },
  {
    id: "2-v-equal",
    imageCount: 2,
    label: "Stacked",
    labelKey: "stacked",
    gridTemplateColumns: "1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
    ],
  },
  {
    id: "2-h-left-large",
    imageCount: 2,
    label: "Left large",
    labelKey: "leftLarge",
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
    ],
  },
  {
    id: "2-h-right-large",
    imageCount: 2,
    label: "Right large",
    labelKey: "rightLarge",
    gridTemplateColumns: "1fr 2fr",
    gridTemplateRows: "1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
    ],
  },

  // ── 3 images ──────────────────────────────────────────────────────
  {
    id: "3-left-large",
    imageCount: 3,
    label: "Left large",
    labelKey: "leftLarge",
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1 / 3" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "2", gridRow: "2" },
    ],
  },
  {
    id: "3-right-large",
    imageCount: 3,
    label: "Right large",
    labelKey: "rightLarge",
    gridTemplateColumns: "1fr 2fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "1 / 3" },
    ],
  },
  {
    id: "3-top-large",
    imageCount: 3,
    label: "Top large",
    labelKey: "topLarge",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "2fr 1fr",
    cells: [
      { gridColumn: "1 / 3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
    ],
  },
  {
    id: "3-h-equal",
    imageCount: 3,
    label: "Three columns",
    labelKey: "threeColumns",
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
    ],
  },
  {
    id: "3-v-equal",
    imageCount: 3,
    label: "Three rows",
    labelKey: "threeRows",
    gridTemplateColumns: "1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "1", gridRow: "3" },
    ],
  },

  // ── 4 images ──────────────────────────────────────────────────────
  {
    id: "4-grid",
    imageCount: 4,
    label: "2x2 grid",
    labelKey: "grid2x2",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
    ],
  },
  {
    id: "4-left-large",
    imageCount: 4,
    label: "Left large",
    labelKey: "leftLarge",
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1 / 4" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "2", gridRow: "3" },
    ],
  },
  {
    id: "4-top-large",
    imageCount: 4,
    label: "Top large",
    labelKey: "topLarge",
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "2fr 1fr",
    cells: [
      { gridColumn: "1 / 4", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
    ],
  },
  {
    id: "4-bottom-large",
    imageCount: 4,
    label: "Bottom large",
    labelKey: "bottomLarge",
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr 2fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1 / 4", gridRow: "2" },
    ],
  },

  // ── 5 images ──────────────────────────────────────────────────────
  {
    id: "5-top2-bottom3",
    imageCount: 5,
    label: "2 + 3",
    labelKey: "twoPlusThree",
    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1 / 4", gridRow: "1" },
      { gridColumn: "4 / 7", gridRow: "1" },
      { gridColumn: "1 / 3", gridRow: "2" },
      { gridColumn: "3 / 5", gridRow: "2" },
      { gridColumn: "5 / 7", gridRow: "2" },
    ],
  },
  {
    id: "5-top3-bottom2",
    imageCount: 5,
    label: "3 + 2",
    labelKey: "threePlusTwo",
    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1 / 3", gridRow: "1" },
      { gridColumn: "3 / 5", gridRow: "1" },
      { gridColumn: "5 / 7", gridRow: "1" },
      { gridColumn: "1 / 4", gridRow: "2" },
      { gridColumn: "4 / 7", gridRow: "2" },
    ],
  },
  {
    id: "5-left-large",
    imageCount: 5,
    label: "Left large",
    labelKey: "leftLarge",
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1 / 5" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "2", gridRow: "3" },
      { gridColumn: "2", gridRow: "4" },
    ],
  },
  {
    id: "5-center-large",
    imageCount: 5,
    label: "Center large",
    labelKey: "centerLarge",
    gridTemplateColumns: "1fr 2fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1 / 3" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
    ],
  },

  // ── 6 images ──────────────────────────────────────────────────────
  {
    id: "6-grid-2x3",
    imageCount: 6,
    label: "2x3 grid",
    labelKey: "grid2x3",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "1", gridRow: "3" },
      { gridColumn: "2", gridRow: "3" },
    ],
  },
  {
    id: "6-grid-3x2",
    imageCount: 6,
    label: "3x2 grid",
    labelKey: "grid3x2",
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
    ],
  },
  {
    id: "6-top-large",
    imageCount: 6,
    label: "Top large",
    labelKey: "topLarge",
    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
    gridTemplateRows: "2fr 1fr",
    cells: [
      { gridColumn: "1 / 6", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
      { gridColumn: "4", gridRow: "2" },
      { gridColumn: "5", gridRow: "2" },
    ],
  },

  // ── 7 images ──────────────────────────────────────────────────────
  {
    id: "7-mosaic",
    imageCount: 7,
    label: "Mosaic",
    labelKey: "mosaic",
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1 / 3", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
      { gridColumn: "1", gridRow: "3" },
      { gridColumn: "2 / 4", gridRow: "3" },
    ],
  },

  // ── 8 images ──────────────────────────────────────────────────────
  {
    id: "8-mosaic",
    imageCount: 8,
    label: "Mosaic",
    labelKey: "mosaic",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1 / 3", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "4", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3 / 5", gridRow: "2" },
      { gridColumn: "1 / 3", gridRow: "3" },
      { gridColumn: "3 / 5", gridRow: "3" },
    ],
  },

  // ── 9 images ──────────────────────────────────────────────────────
  {
    id: "9-grid",
    imageCount: 9,
    label: "3x3 grid",
    labelKey: "grid3x3",
    gridTemplateColumns: "1fr 1fr 1fr",
    gridTemplateRows: "1fr 1fr 1fr",
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
      { gridColumn: "3", gridRow: "1" },
      { gridColumn: "1", gridRow: "2" },
      { gridColumn: "2", gridRow: "2" },
      { gridColumn: "3", gridRow: "2" },
      { gridColumn: "1", gridRow: "3" },
      { gridColumn: "2", gridRow: "3" },
      { gridColumn: "3", gridRow: "3" },
    ],
  },
];

/** Find all templates matching a specific image count. */
export function getTemplatesForCount(count: number): CollageTemplate[] {
  return COLLAGE_TEMPLATES.filter((t) => t.imageCount === count);
}

/** Pick the best default template for a given image count. */
export function getDefaultTemplate(count: number): CollageTemplate {
  const exact = getTemplatesForCount(count);
  if (exact.length > 0) return exact[0];

  // Fall back: find the nearest template with >= count cells
  const sorted = [...COLLAGE_TEMPLATES].sort(
    (a, b) => Math.abs(a.imageCount - count) - Math.abs(b.imageCount - count),
  );
  return sorted[0];
}

/** Get a template by ID. */
export function getTemplateById(id: string): CollageTemplate | undefined {
  return COLLAGE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Translated template label with the data's English as fallback (same cast
 * pattern as template-i18n.ts: the collage block's key set is locale-defined).
 */
export function collageTemplateLabel(
  t: import("@snapotter/shared").TranslationKeys,
  template: CollageTemplate,
): string {
  const block = t.toolSettings.collage as unknown as Record<string, string>;
  return block[template.labelKey] ?? template.label;
}
