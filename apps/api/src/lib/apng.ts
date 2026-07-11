/**
 * Count frames in a PNG buffer by reading the APNG `acTL` (animation control)
 * chunk. Sharp/libvips cannot see APNG frames at all (`metadata().pages` is
 * undefined for an APNG, indistinguishable from a still PNG), so parsing the
 * chunk stream is the only way to detect animation for .png/.apng inputs.
 *
 * Returns:
 *  - `null` if the buffer is not a PNG at all,
 *  - `1` for a still PNG (no `acTL` before the first `IDAT`),
 *  - the `num_frames` value from `acTL` for an APNG.
 */
const PNG_SIGNATURE = 0x89504e47; // first 4 bytes of the 8-byte PNG signature

export function apngFrameCount(input: Buffer | Uint8Array): number | null {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (b.length < 8 || b.readUInt32BE(0) !== PNG_SIGNATURE) return null;
  let off = 8; // skip the 8-byte signature
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString("ascii", off + 4, off + 8);
    if (type === "acTL") {
      // acTL data: num_frames (uint32) + num_plays (uint32)
      if (off + 12 > b.length) return 1;
      return b.readUInt32BE(off + 8);
    }
    if (type === "IDAT") return 1; // pixel data before any acTL => still PNG
    off += 12 + len; // 4 length + 4 type + len data + 4 CRC
  }
  return 1;
}
