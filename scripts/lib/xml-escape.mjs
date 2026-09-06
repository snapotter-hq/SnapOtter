// Escapes the five characters that can break out of an XML or SVG attribute or
// text node. One pass, so an existing "&" is never escaped twice.
export function escapeXml(value) {
  return String(value).replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
