import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { validateArtifact } from "./lib/job-aware.mjs";
import {
  assertOracle,
  imageDimensions,
  isoDurationS,
  pdfPageCount,
  wavDurationS,
} from "./lib/oracles.mjs";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const fixture = (relative) => readFileSync(join(FIXTURES, relative));

test("reads raster dimensions out of every container the benchmark produces", () => {
  assert.deepEqual(imageDimensions(fixture("image/valid/test-200x150.png")), {
    width: 200,
    height: 150,
  });
  assert.deepEqual(imageDimensions(fixture("image/valid/test-100x100.jpg")), {
    width: 100,
    height: 100,
  });
  assert.deepEqual(imageDimensions(fixture("image/valid/test-50x50.webp")), {
    width: 50,
    height: 50,
  });
  assert.deepEqual(imageDimensions(fixture("image/valid/animated.gif")), {
    width: 100,
    height: 100,
  });
  assert.deepEqual(imageDimensions(fixture("image/valid/stress-large.jpg")), {
    width: 4000,
    height: 3000,
  });
});

test("returns null rather than guessing for formats it does not parse", () => {
  assert.equal(imageDimensions(fixture("image/valid/svg-logo.svg")), null);
  assert.equal(imageDimensions(fixture("image/valid/barcode.avif")), null);
  assert.equal(imageDimensions(Buffer.alloc(8)), null);
});

test("counts PDF pages whether they are in the clear or inside object streams", () => {
  assert.equal(pdfPageCount(fixture("document/valid/test-3page.pdf")), 3);
  assert.equal(pdfPageCount(fixture("document/valid/multipage-6.pdf")), 6);
  assert.equal(pdfPageCount(fixture("document/valid/alt-2page.pdf")), 2);
  // Written with a cross-reference stream: the page objects are only visible
  // after inflating, which is the case a raw regex count silently gets wrong.
  assert.equal(pdfPageCount(fixture("document/valid/ocr-scanned.pdf")), 1);
});

test("does not desynchronise its stream scan on the endstream keyword", () => {
  const hidden = deflateSync(Buffer.from("<< /Type /Page >>", "latin1"));
  const pdf = Buffer.concat([
    Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1"),
    deflateSync(Buffer.from("nothing here", "latin1")),
    Buffer.from("\nendstream\nendobj\n2 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1"),
    hidden,
    Buffer.from("\nendstream\nendobj\n%%EOF", "latin1"),
  ]);
  assert.equal(pdfPageCount(pdf), 1);
});

test("reads media duration from WAV headers and ISO movie headers", () => {
  assert.equal(wavDurationS(fixture("audio/valid/media-30s.wav")), 30);
  assert.ok(Math.abs(wavDurationS(fixture("audio/valid/speech-10s.wav")) - 6.6646) < 0.01);
  assert.equal(isoDurationS(fixture("video/valid/media-30s.mp4")), 8);
  assert.ok(Math.abs(isoDurationS(fixture("audio/valid/speech.m4a")) - 6.665) < 0.01);
  assert.equal(wavDurationS(fixture("image/valid/test-200x150.png")), null);
});

test("a resize that ignored its width fails the oracle even though the PNG is valid", () => {
  const png = fixture("image/valid/test-200x150.png");
  assert.doesNotThrow(() => assertOracle(png, { width: 200, height: 150 }));
  assert.throws(
    () => assertOracle(png, { width: 800 }),
    /oracle width: expected 800, measured 200/,
  );
});

test("a page operation that returned the wrong page count fails the oracle", () => {
  const pdf = fixture("document/valid/test-3page.pdf");
  assert.doesNotThrow(() => assertOracle(pdf, { pages: 3 }));
  assert.throws(() => assertOracle(pdf, { pages: 1 }), /oracle pages: expected 1, measured 3/);
});

test("a trim that returned the untrimmed audio fails the duration oracle", () => {
  const wav = fixture("audio/valid/media-30s.wav");
  assert.doesNotThrow(() => assertOracle(wav, { durationS: 30, toleranceS: 0.2 }));
  assert.throws(
    () => assertOracle(wav, { durationS: 5, toleranceS: 0.4 }),
    /oracle durationS: expected 5 \+\/- 0.4, measured 30.000/,
  );
});

test("an unreadable duration is a failure, not a pass", () => {
  assert.throws(
    () => assertOracle(fixture("image/valid/test-200x150.png"), { durationS: 5 }),
    /oracle durationS: expected 5, measured unreadable/,
  );
});

test("JSON and text oracles check content, not just parseability", () => {
  const payload = Buffer.from(JSON.stringify({ format: "png", meta: { width: 200 } }));
  assert.doesNotThrow(() => assertOracle(payload, { json: { "meta.width": 200 } }));
  assert.throws(
    () => assertOracle(payload, { json: { "meta.width": 800 } }),
    /oracle json.meta.width: expected 800, measured 200/,
  );
  assert.throws(
    () => assertOracle(Buffer.from("a,b\n1,2\n"), { textIncludes: "c,d" }),
    /oracle textIncludes/,
  );
});

test("validateArtifact runs the oracle after its structural checks", () => {
  const png = fixture("image/valid/test-200x150.png");
  assert.doesNotThrow(() =>
    validateArtifact(png, "image/png", { oracle: { width: 200, minBytes: 100 } }),
  );
  assert.throws(
    () => validateArtifact(png, "image/png", { oracle: { width: 800 } }),
    /oracle width: expected 800, measured 200/,
  );
});

test("validateArtifact applies a per-entry oracle inside a ZIP result", () => {
  const zip = fixture("data/valid/tiny.zip");
  assert.throws(
    () => validateArtifact(zip, "application/zip", { oracle: { zipEach: { width: 800 } } }),
    /ZIP entry .*oracle (width|dimensions)/,
  );
});
