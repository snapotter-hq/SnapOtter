/**
 * The format name to show for a stored file: its extension when the name has
 * one (PSD, CR2, DOCX, MKV), otherwise a cleaned MIME subtype (#1783).
 *
 * The extension comes first because one MIME type can cover several formats:
 * application/postscript is EPS, PS and AI, image/x-icon is ICO and CUR,
 * image/svg+xml is SVG and SVGZ, and RAW files the server can't place more
 * precisely are all image/x-dcraw. The name tells them apart.
 */
export function fileFormatLabel(name: string, mimeType: string): string {
  return extensionOf(name) ?? cleanedSubtype(mimeType);
}

const EXTENSION = /^[a-z0-9]{1,10}$/i;

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  // A leading dot (".env") names the file; it isn't an extension.
  if (dot <= 0) return null;
  const ext = name.slice(dot + 1);
  return EXTENSION.test(ext) ? ext.toUpperCase() : null;
}

/** "image/vnd.adobe.photoshop" -> "PHOTOSHOP", "image/svg+xml" -> "SVG", "image/x-eps" -> "EPS". */
function cleanedSubtype(mimeType: string): string {
  const subtype = (mimeType.split("/")[1] ?? "")
    .split(";")[0]
    .split("+")[0]
    .trim()
    .replace(/^(x-|vnd\.)/i, "");
  return (subtype.split(".").pop() ?? "").toUpperCase();
}
