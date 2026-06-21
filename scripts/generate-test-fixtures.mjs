#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
/**
 * Generates the tiny media/document fixtures committed under tests/fixtures/.
 * Requires ffmpeg on PATH (or FFMPEG_PATH) and qpdf (or QPDF_PATH).
 * Run once; outputs are committed.
 *   node scripts/generate-test-fixtures.mjs
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const videoDir = join(root, "tests/fixtures/video/formats");
const audioDir = join(root, "tests/fixtures/audio/formats");
const docsDir = join(root, "tests/fixtures/document/formats");
mkdirSync(videoDir, { recursive: true });
mkdirSync(audioDir, { recursive: true });
mkdirSync(docsDir, { recursive: true });

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

function whichBin(envVar, name) {
  if (process.env[envVar]) return process.env[envVar];
  const res = spawnSync("which", [name], { encoding: "utf8" });
  if (res.status === 0 && res.stdout.trim()) return res.stdout.trim().split("\n")[0];
  return null;
}

function run(args) {
  const res = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    console.error(`ffmpeg failed: ${args.join(" ")}`);
    process.exit(1);
  }
}

// 1s 64x64 mp4 with video + audio (h264 + aac; needed by extract-audio + mute-video)
run([
  "-f",
  "lavfi",
  "-i",
  "testsrc=duration=1:size=64x64:rate=8",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=1",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "32k",
  "-shortest",
  join(videoDir, "tiny.mp4"),
]);
// 1s sine mp3
run([
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=1",
  "-c:a",
  "libmp3lame",
  "-b:a",
  "32k",
  join(audioDir, "tiny.mp3"),
]);
// 1s sine wav
run([
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=1",
  "-c:a",
  "pcm_s16le",
  "-ar",
  "8000",
  join(audioDir, "tiny.wav"),
]);

// Minimal OOXML/EPUB containers via archiver (resolved from apps/api).
const apiRequire = createRequire(join(root, "apps/api/package.json"));
const archiver = apiRequire("archiver");

async function writeZip(outPath, entries, firstStored) {
  const { createWriteStream } = await import("node:fs");
  await new Promise((resolvePromise, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const out = createWriteStream(outPath);
    out.on("close", resolvePromise);
    archive.on("error", reject);
    archive.pipe(out);
    if (firstStored) archive.append(firstStored.content, { name: firstStored.name, store: true });
    for (const [name, content] of Object.entries(entries)) archive.append(content, { name });
    archive.finalize();
  });
}

const docxDocument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>SnapOtter test document</w:t></w:r></w:p></w:body></w:document>`;
const docxContentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const docxRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const xlsxSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SnapOtter</t></is></c></row></sheetData></worksheet>`;
const xlsxWorkbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const xlsxWorkbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
const xlsxContentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
const xlsxRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const epubContainer = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const epubOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">snapotter-test</dc:identifier><dc:title>Test</dc:title><dc:language>en</dc:language></metadata><manifest><item id="c" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`;
const epubChapter = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Test</title></head><body><p>SnapOtter test epub</p></body></html>`;

await writeZip(join(docsDir, "tiny.docx"), {
  "[Content_Types].xml": docxContentTypes,
  "_rels/.rels": docxRels,
  "word/document.xml": docxDocument,
});
await writeZip(join(docsDir, "tiny.xlsx"), {
  "[Content_Types].xml": xlsxContentTypes,
  "_rels/.rels": xlsxRels,
  "xl/workbook.xml": xlsxWorkbook,
  "xl/_rels/workbook.xml.rels": xlsxWorkbookRels,
  "xl/worksheets/sheet1.xml": xlsxSheet,
});
// EPUB requires the mimetype entry FIRST and STORED (uncompressed).
await writeZip(
  join(docsDir, "tiny.epub"),
  {
    "META-INF/container.xml": epubContainer,
    "OEBPS/content.opf": epubOpf,
    "OEBPS/chapter.xhtml": epubChapter,
  },
  { name: "mimetype", content: "application/epub+zip" },
);

// Encrypted PDF fixture derived from test-3page.pdf via qpdf (AES-256).
// Skip if the file already exists -- qpdf encryption uses random IVs, so
// re-running produces different bytes and would break manifest hashes.
const encPdf = join(root, "tests/fixtures/document/valid/encrypted.pdf");
if (existsSync(encPdf)) {
  console.log("encrypted.pdf already exists; skipping (qpdf encryption is non-deterministic)");
} else {
  const qpdf = whichBin("QPDF_PATH", "qpdf");
  if (qpdf) {
    const srcPdf = join(root, "tests/fixtures/document/valid/test-3page.pdf");
    const qres = spawnSync(qpdf, [srcPdf, "--encrypt", "test123", "owner123", "256", "--", encPdf], {
      stdio: "inherit",
    });
    if (qres.status !== 0) {
      console.error("qpdf encryption failed");
      process.exit(1);
    }
    console.log("encrypted.pdf written");
  } else {
    console.warn("qpdf not found; skipping encrypted.pdf");
  }
}

// tiny.html fixture for html-to-pdf tests.
writeFileSync(
  join(docsDir, "tiny.html"),
  `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>SnapOtter test</title>
  <style>h1 { color: #336; } p { font-size: 12pt; }</style></head>
  <body><h1>SnapOtter HTML fixture</h1><p>Paged media test paragraph.</p></body>
</html>
`,
);

// tiny.md fixture for markdown-to-pdf tests.
writeFileSync(
  join(docsDir, "tiny.md"),
  `# SnapOtter Markdown fixture

A paragraph with **bold** and a list:

- alpha
- beta
`,
);

console.log("Fixtures written to tests/fixtures/{video,audio}/formats and tests/fixtures/document/formats");
