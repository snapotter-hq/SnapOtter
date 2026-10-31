import { IMAGE_EXT_TO_MIME, IMAGE_MIME_TO_EXT } from "@snapotter/shared";

/**
 * The format name to show for a stored file (#1783): PSD rather than
 * VND.ADOBE.PHOTOSHOP, DOCX rather than VND.OPENXMLFORMATS-...
 *
 * An image/* type in the library was read from the file's bytes (the API
 * drops a client's image/* claim it can't verify), so it outranks the name:
 * WebP bytes saved as photo.jpg show WEBP. The extension still names the
 * format when it agrees with that type, because one type can cover several
 * formats (image/x-icon is ICO and CUR, image/svg+xml is SVG and SVGZ), and
 * when the type has no single format (image/x-dcraw, any RAW the server
 * couldn't place). Every other type came from the browser, which guessed it
 * from the name, so the extension wins outright. A name with no extension
 * falls back to a cleaned MIME subtype.
 */
export function fileFormatLabel(name: string, mimeType: string): string {
  const ext = extensionOf(name);
  const type = mimeType.toLowerCase();
  const sniffed = type.startsWith("image/") ? IMAGE_MIME_TO_EXT[type] : undefined;
  const nameAgrees = ext !== null && IMAGE_EXT_TO_MIME[ext] === type;
  if (sniffed && !nameAgrees) return sniffed.toUpperCase();
  return ext?.toUpperCase() ?? cleanedSubtype(type);
}

// Letters and digits with at least one letter: "Report v1.2" has no extension.
const EXTENSION = /^(?=[a-z0-9]*[a-z])[a-z0-9]{1,10}$/;

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  // A leading dot (".env") names the file; it isn't an extension.
  if (dot <= 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return EXTENSION.test(ext) ? ext : null;
}

/** "image/vnd.adobe.photoshop" -> "PHOTOSHOP", "image/svg+xml" -> "SVG", "image/x-eps" -> "EPS". */
function cleanedSubtype(mimeType: string): string {
  const subtype = (mimeType.split("/")[1] ?? "")
    .split(";")[0]
    .split("+")[0]
    .trim()
    .replace(/^(x-|vnd\.)/, "");
  return (subtype.split(".").pop() ?? "").toUpperCase();
}
