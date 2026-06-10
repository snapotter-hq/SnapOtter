#!/usr/bin/env node
/**
 * Generates the hostile-input fixtures in tests/fixtures/hostile/.
 *
 * Deterministic on purpose: re-running produces byte-identical files so the
 * committed fixtures never churn. No dependencies (the bomb PNG is built by
 * hand instead of with sharp).
 *
 * Run from the repo root: node scripts/generate-hostile-fixtures.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tests", "fixtures", "hostile");
mkdirSync(outDir, { recursive: true });

// --- 1. truncated.jpg: a real JPEG cut off at 40% ---------------------------
const realJpeg = readFileSync(join(root, "tests", "fixtures", "sample-photo.jpg"));
writeFileSync(join(outDir, "truncated.jpg"), realJpeg.subarray(0, Math.floor(realJpeg.length * 0.4)));

// --- 2. zero-byte.png --------------------------------------------------------
writeFileSync(join(outDir, "zero-byte.png"), Buffer.alloc(0));

// --- 3. garbage.jpg: 8KB of seeded pseudo-random bytes ----------------------
const garbage = Buffer.alloc(8192);
let state = 0xdeadbeef;
for (let i = 0; i < garbage.length; i++) {
  // LCG (numerical recipes constants) for deterministic noise
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  garbage[i] = state & 0xff;
}
writeFileSync(join(outDir, "garbage.jpg"), garbage);

// --- 4. png-bytes.jpg: valid PNG content with a lying .jpg extension --------
const realPng = readFileSync(join(root, "tests", "fixtures", "test-200x150.png"));
writeFileSync(join(outDir, "png-bytes.jpg"), realPng);

// --- 5. bomb-50000x50000.png: tiny file whose header claims 2,500 megapixels
// A decompression-bomb shape: valid signature + IHDR declaring 50000x50000,
// with a minimal IDAT. Anything that trusts the header and allocates dies;
// the API must reject it via its megapixel limit instead.
function crc32(buf) {
  let c = 0xffffffff;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i;
    for (let j = 0; j < 8; j++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    table[i] = v;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(50000, 0); // width
ihdr.writeUInt32BE(50000, 4); // height
ihdr[8] = 8; // bit depth
ihdr[9] = 0; // grayscale
// One deflated row's worth of zeroes; far less data than the header promises.
const idat = zlib.deflateSync(Buffer.alloc(1024));
writeFileSync(
  join(outDir, "bomb-50000x50000.png"),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);

console.log(`Hostile fixtures written to ${outDir}`);
