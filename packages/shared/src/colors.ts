/** `#RGB`, `#RRGGBB` or either without the hash. The only color shapes this module reads. */
export const HEX_COLOR_PATTERN = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Lower-case `#rrggbb` for any string HEX_COLOR_PATTERN accepts. */
export function normalizeHexColor(color: string): string {
  if (!HEX_COLOR_PATTERN.test(color)) throw new Error(`Not a hex color: ${color}`);
  let hex = color.replace("#", "").toLowerCase();
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return `#${hex}`;
}
