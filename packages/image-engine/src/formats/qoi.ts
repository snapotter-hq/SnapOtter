const QOI_MAGIC = 0x716f6966; // "qoif"
const QOI_OP_INDEX = 0x00;
const QOI_OP_DIFF = 0x40;
const QOI_OP_LUMA = 0x80;
const QOI_OP_RUN = 0xc0;
const QOI_OP_RGB = 0xfe;
const QOI_OP_RGBA = 0xff;
const QOI_END_MARKER = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]);
const QOI_HEADER_SIZE = 14;
const MAX_QOI_PIXELS = 67_108_864;

function hash(r: number, g: number, b: number, a: number): number {
  return (r * 3 + g * 5 + b * 7 + a * 11) % 64;
}

export interface QoiHeader {
  width: number;
  height: number;
  channels: 3 | 4;
  colorspace: 0 | 1;
}

export function qoiDecode(data: Uint8Array): { header: QoiHeader; pixels: Uint8Array } {
  if (data.length < QOI_HEADER_SIZE + QOI_END_MARKER.length) {
    throw new Error("QOI file is too short");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0) !== QOI_MAGIC) throw new Error("Not a QOI file");

  const width = view.getUint32(4);
  const height = view.getUint32(8);
  const channels = data[12] as 3 | 4;
  const colorspace = data[13] as 0 | 1;

  if (width === 0 || height === 0) throw new Error("Invalid QOI dimensions");
  if (channels !== 3 && channels !== 4) throw new Error("Invalid QOI channels");
  if (colorspace !== 0 && colorspace !== 1) throw new Error("Invalid QOI colorspace");

  const totalPixels = width * height;
  if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_QOI_PIXELS) {
    throw new Error("QOI image exceeds the pixel safety limit");
  }

  const dataEnd = data.length - QOI_END_MARKER.length;
  for (let i = 0; i < QOI_END_MARKER.length; i++) {
    if (data[dataEnd + i] !== QOI_END_MARKER[i]) {
      throw new Error("Invalid QOI end marker");
    }
  }

  // A QOI chunk can represent at most 62 pixels. Reject files that cannot
  // possibly contain their declared image before allocating the RGBA buffer.
  if (dataEnd - QOI_HEADER_SIZE < Math.ceil(totalPixels / 62)) {
    throw new Error("QOI pixel data is too short for declared dimensions");
  }

  const pixels = new Uint8Array(totalPixels * 4);
  const index = new Uint8Array(64 * 4);

  let r = 0,
    g = 0,
    b = 0,
    a = 255;
  let pos = QOI_HEADER_SIZE;
  let px = 0;

  const readPixelByte = (): number => {
    if (pos >= dataEnd) throw new Error("Truncated QOI pixel data");
    return data[pos++];
  };

  while (px < totalPixels) {
    const byte = readPixelByte();

    if (byte === QOI_OP_RGB) {
      r = readPixelByte();
      g = readPixelByte();
      b = readPixelByte();
    } else if (byte === QOI_OP_RGBA) {
      r = readPixelByte();
      g = readPixelByte();
      b = readPixelByte();
      a = readPixelByte();
    } else {
      const op = byte & 0xc0;
      if (op === QOI_OP_INDEX) {
        const idx = (byte & 0x3f) * 4;
        r = index[idx];
        g = index[idx + 1];
        b = index[idx + 2];
        a = index[idx + 3];
      } else if (op === QOI_OP_DIFF) {
        r = (r + ((byte >> 4) & 0x03) - 2) & 0xff;
        g = (g + ((byte >> 2) & 0x03) - 2) & 0xff;
        b = (b + (byte & 0x03) - 2) & 0xff;
      } else if (op === QOI_OP_LUMA) {
        const b2 = readPixelByte();
        const dg = (byte & 0x3f) - 32;
        r = (r + dg + ((b2 >> 4) & 0x0f) - 8) & 0xff;
        g = (g + dg) & 0xff;
        b = (b + dg + (b2 & 0x0f) - 8) & 0xff;
      } else {
        // QOI_OP_RUN
        const run = (byte & 0x3f) + 1;
        if (run > totalPixels - px) {
          throw new Error("QOI run exceeds the declared pixel count");
        }
        for (let i = 0; i < run; i++) {
          const off = px * 4;
          pixels[off] = r;
          pixels[off + 1] = g;
          pixels[off + 2] = b;
          pixels[off + 3] = a;
          px++;
        }
        const h = hash(r, g, b, a) * 4;
        index[h] = r;
        index[h + 1] = g;
        index[h + 2] = b;
        index[h + 3] = a;
        continue;
      }
    }

    const h = hash(r, g, b, a) * 4;
    index[h] = r;
    index[h + 1] = g;
    index[h + 2] = b;
    index[h + 3] = a;
    const off = px * 4;
    pixels[off] = r;
    pixels[off + 1] = g;
    pixels[off + 2] = b;
    pixels[off + 3] = a;
    px++;
  }

  if (pos !== dataEnd) throw new Error("Unexpected QOI pixel data");

  return { header: { width, height, channels, colorspace }, pixels };
}

export function qoiEncode(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4 = 4,
): Uint8Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid QOI dimensions");
  }
  if (channels !== 3 && channels !== 4) throw new Error("Invalid QOI channels");

  const totalPixels = width * height;
  if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_QOI_PIXELS) {
    throw new Error("QOI image exceeds the pixel safety limit");
  }
  if (pixels.length !== totalPixels * channels) {
    throw new Error("QOI pixel buffer length does not match dimensions and channels");
  }

  const maxSize = QOI_HEADER_SIZE + totalPixels * (channels + 1) + QOI_END_MARKER.length;
  const out = new Uint8Array(maxSize);
  const view = new DataView(out.buffer);

  view.setUint32(0, QOI_MAGIC);
  view.setUint32(4, width);
  view.setUint32(8, height);
  out[12] = channels;
  out[13] = 0; // sRGB

  const index = new Uint8Array(64 * 4);
  let pos = QOI_HEADER_SIZE;
  let prevR = 0,
    prevG = 0,
    prevB = 0,
    prevA = 255;
  let run = 0;
  for (let px = 0; px < totalPixels; px++) {
    const off = px * channels;
    const r = pixels[off];
    const g = pixels[off + 1];
    const b = pixels[off + 2];
    const a = channels === 4 ? pixels[off + 3] : 255;

    if (r === prevR && g === prevG && b === prevB && a === prevA) {
      run++;
      if (run === 62 || px === totalPixels - 1) {
        out[pos++] = QOI_OP_RUN | (run - 1);
        run = 0;
      }
      continue;
    }

    if (run > 0) {
      out[pos++] = QOI_OP_RUN | (run - 1);
      run = 0;
    }

    const h = hash(r, g, b, a);
    const idx = h * 4;

    if (index[idx] === r && index[idx + 1] === g && index[idx + 2] === b && index[idx + 3] === a) {
      out[pos++] = QOI_OP_INDEX | h;
    } else {
      index[idx] = r;
      index[idx + 1] = g;
      index[idx + 2] = b;
      index[idx + 3] = a;

      if (a !== prevA) {
        out[pos++] = QOI_OP_RGBA;
        out[pos++] = r;
        out[pos++] = g;
        out[pos++] = b;
        out[pos++] = a;
      } else {
        const dr = r - prevR;
        const dg = g - prevG;
        const db = b - prevB;
        const drDg = dr - dg;
        const dbDg = db - dg;

        if (dr > -3 && dr < 2 && dg > -3 && dg < 2 && db > -3 && db < 2) {
          out[pos++] = QOI_OP_DIFF | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2);
        } else if (dg > -33 && dg < 32 && drDg > -9 && drDg < 8 && dbDg > -9 && dbDg < 8) {
          out[pos++] = QOI_OP_LUMA | (dg + 32);
          out[pos++] = ((drDg + 8) << 4) | (dbDg + 8);
        } else {
          out[pos++] = QOI_OP_RGB;
          out[pos++] = r;
          out[pos++] = g;
          out[pos++] = b;
        }
      }
    }

    prevR = r;
    prevG = g;
    prevB = b;
    prevA = a;
  }

  out.set(QOI_END_MARKER, pos);
  pos += QOI_END_MARKER.length;
  return out.slice(0, pos);
}
