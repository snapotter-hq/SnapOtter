#!/usr/bin/env node
/**
 * Phase 5 codemod: migrate ad-hoc fixture path references to the typed registry.
 *
 * Usage: node scripts/codemod-fixture-refs.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = process.cwd();

// ── Hand-authored fixture-path -> registry-expression map ────────
const PATH_TO_REGISTRY = {
  "test-200x150.png": "fixtures.image.base.png200",
  "test-100x100.jpg": "fixtures.image.base.jpg100",
  "test-50x50.webp": "fixtures.image.base.webp50",
  "test-100x100.svg": "fixtures.image.base.svg100",
  "test-200x150.heic": "fixtures.image.base.heic200",
  "test-scene.png": "fixtures.image.scene",
  "content/portrait-color.jpg": "fixtures.image.portrait.jpg",
  "content/portrait-headshot.heic": "fixtures.image.portrait.heic",
  "content/portrait-bw.jpeg": "fixtures.image.portrait.bw",
  "content/portrait-isolated.png": "fixtures.image.portrait.isolated",
  "test-portrait.jpg": "fixtures.image.portraitJpg",
  "test-portrait.heic": "fixtures.image.portraitHeic",
  "content/multi-face.webp": "fixtures.image.multiFace",
  "content/red-eye.jpg": "fixtures.image.redEye",
  "test-with-exif.jpg": "fixtures.image.exifGps",
  "test-fake-transparency.png": "fixtures.image.transparent",
  "animated.gif": "fixtures.image.animated.gif",
  "animated.webp": "fixtures.image.animated.webp",
  "content/animated-simpsons.gif": "fixtures.image.animated.real",
  "content/ocr-clean.png": "fixtures.image.ocr.clean",
  "content/ocr-japanese.png": "fixtures.image.ocr.japanese",
  "content/ocr-chat.jpeg": "fixtures.image.ocr.chat",
  "content/barcode.png": "fixtures.image.code.barcodePng",
  "content/barcode.avif": "fixtures.image.code.barcodeAvif",
  "content/qr-code.png": "fixtures.image.code.qrPng",
  "content/qr-code.svg": "fixtures.image.code.qrSvg",
  "content/qr-code.avif": "fixtures.image.code.qrAvif",
  "content/svg-logo.svg": "fixtures.image.svgLogo",
  "content/motorcycle.heif": "fixtures.image.motorcycle",
  "content/cross-format-chat.webp": "fixtures.image.crossFormatChat",
  "content/watermark.jpg": "fixtures.image.watermark",
  "content/stress-large.jpg": "fixtures.image.stressLarge",
  "test-1x1.png": "fixtures.image.edge.px1",
  "test-blank.png": "fixtures.image.edge.blank",
  "test-portrait-tall.png": "fixtures.image.edge.tall",
  "test-portrait-extreme.png": "fixtures.image.edge.extreme",
  "formats/multipage.tiff": "fixtures.image.multipageTiff",
  "hostile/truncated.jpg": "fixtures.image.hostile.truncated",
  "hostile/garbage.jpg": "fixtures.image.hostile.garbage",
  "hostile/bomb-50000x50000.png": "fixtures.image.hostile.bomb",
  "hostile/png-bytes.jpg": "fixtures.image.hostile.extMismatch",
  "hostile/zero-byte.png": "fixtures.image.hostileEmpty.zeroByte",
  "content/media-30s.mp4": "fixtures.video.hero.mp4",
  "content/hero.mov": "fixtures.video.hero.mov",
  "content/hero.webm": "fixtures.video.hero.webm",
  "content/hero.mkv": "fixtures.video.hero.mkv",
  "content/hero.avi": "fixtures.video.hero.avi",
  "content/speech-10s.mp4": "fixtures.video.speech.mp4",
  "content/video-with-meta.mp4": "fixtures.video.withMeta",
  "media/tiny-subs.mkv": "fixtures.video.subs.mkv",
  "media/tiny.srt": "fixtures.video.subs.srt",
  "media/tiny.vtt": "fixtures.video.subs.vtt",
  "media/tiny.ass": "fixtures.video.subs.ass",
  "hostile/truncated.mp4": "fixtures.video.hostile.truncated",
  "content/speech-10s.wav": "fixtures.audio.speech.wav",
  "content/speech.flac": "fixtures.audio.speech.flac",
  "content/speech.ogg": "fixtures.audio.speech.ogg",
  "content/speech.m4a": "fixtures.audio.speech.m4a",
  "content/speech.aac": "fixtures.audio.speech.aac",
  "content/speech.opus": "fixtures.audio.speech.opus",
  "content/media-30s.wav": "fixtures.audio.music.wav",
  "content/audio-with-tags.mp3": "fixtures.audio.tagged",
  "media/tone-stereo.wav": "fixtures.audio.stereo",
  "media/tone-gap.wav": "fixtures.audio.gap",
  "hostile/zero-byte.wav": "fixtures.audio.hostileEmpty.zeroByte",
  "content/multipage-6.pdf": "fixtures.document.pdfMulti",
  "content/alt-2page.pdf": "fixtures.document.pdf2",
  "test-3page.pdf": "fixtures.document.pdf3",
  "content/ocr-scanned.pdf": "fixtures.document.pdfScanned",
  "documents/encrypted.pdf": "fixtures.document.encrypted",
  "documents/remote-img.html": "fixtures.document.remoteImgHtml",
  "hostile/truncated.docx": "fixtures.document.hostile.truncatedDocx",
  "hostile/garbage.pdf": "fixtures.document.hostile.garbagePdf",
  "documents/tiny.pdf": 'fixtures.document.tiny("pdf")',
  "data/tiny.csv": "fixtures.data.csv",
  "data/tiny-a.csv": "fixtures.data.csvA",
  "data/tiny-b.csv": "fixtures.data.csvB",
  "data/tiny.json": "fixtures.data.json",
  "data/tiny.xml": "fixtures.data.xml",
  "data/tiny.yaml": "fixtures.data.yaml",
  "data/tiny.tsv": "fixtures.data.tsv",
  "data/tiny.zip": "fixtures.data.zip",
  "security/svg-xxe-file-read.svg": "fixtures.security.svgXxeFile",
  "security/svg-xxe-ssrf.svg": "fixtures.security.svgXxeSsrf",
};

const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "mkv", "avi", "flv", "wmv", "m4v", "mpg", "mpeg", "ogv", "3gp", "m2ts", "mts"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus", "wma", "aiff", "amr", "ac3"]);

function tinyAccessor(dir, file) {
  if (!file.startsWith("tiny.")) return null;
  const ext = file.replace("tiny.", "");
  if (dir === "media") {
    if (AUDIO_EXTS.has(ext)) return `fixtures.audio.tiny("${ext}")`;
    return `fixtures.video.tiny("${ext}")`;
  }
  if (dir === "documents") return `fixtures.document.tiny("${ext}")`;
  return null;
}

function formatAccessor(file) {
  const m = file.match(/^sample\.(.+)$/);
  if (m) return `fixtures.image.formats("${m[1]}")`;
  return null;
}

function resolveFixturePath(segments) {
  // segments: array of path parts after the "fixtures" part
  // e.g. ["media", "tiny.mp4"] or ["test-200x150.png"]
  if (segments.length === 1) {
    // Direct file in fixtures/
    const reg = PATH_TO_REGISTRY[segments[0]];
    if (reg) return reg;
    // Could be formats/sample.ext as single string
    const fmtMatch = segments[0].match(/^formats\/sample\.(.+)$/);
    if (fmtMatch) return `fixtures.image.formats("${fmtMatch[1]}")`;
    return null;
  }
  if (segments.length === 2) {
    const [dir, file] = segments;
    const combined = `${dir}/${file}`;
    const reg = PATH_TO_REGISTRY[combined];
    if (reg) return reg;
    // format accessor
    if (dir === "formats") return formatAccessor(file);
    // tiny accessor
    return tinyAccessor(dir, file);
  }
  return null;
}

// ── Collect target files ─────────────────────────────────────
function collectTestFiles(dir) {
  const result = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip fixture subdirs (Phase 2 depth tests already use registry)
        if (entry.name === "fixtures") continue;
        result.push(...collectTestFiles(full));
      } else if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
        result.push(full);
      }
    }
  } catch (_) { /* dir doesn't exist */ }
  return result;
}

const testDirs = [join(ROOT, "tests/unit"), join(ROOT, "tests/integration")];
const allTestFiles = testDirs.flatMap(collectTestFiles);

let totalMigrated = 0;
const migratedFiles = [];

for (const file of allTestFiles) {
  let src = readFileSync(file, "utf-8");
  const origSrc = src;

  // Quick check: does this file have any fixture refs?
  if (!/fixtures|FIXTURES|FORMATS_DIR|HOSTILE_DIR|FIXTURE\b/.test(src)) continue;

  let needsFixtures = false;
  let needsReadFixture = false;
  let needsFixtureDir = false;
  let needsFixtureRoot = false;
  const fileDir = dirname(file);
  let relPath = relative(fileDir, join(ROOT, "tests/fixtures/index.js"));
  if (!relPath.startsWith(".")) relPath = "./" + relPath;

  // ── PASS 1: Inline buffer reads ────────────────────────────
  // readFileSync(join(__dirname, "..", "fixtures", "dir", "file"))
  // readFileSync(join(__dirname, "..", "fixtures", "file"))
  // Also with "../.."
  // Two+ segment inline buffer read
  src = src.replace(
    /readFileSync\(join\(__dirname,\s*"[^"]+",\s*"fixtures",\s*"([^"]+)",\s*"([^"]+)"\)\)/g,
    (match, dir, file) => {
      const reg = resolveFixturePath([dir, file]);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      return match;
    }
  );
  // One segment inline buffer read
  src = src.replace(
    /readFileSync\(join\(__dirname,\s*"[^"]+",\s*"fixtures",\s*"([^"]+)"\)\)/g,
    (match, file) => {
      const reg = resolveFixturePath([file]);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      return match;
    }
  );

  // await readFile(join(__dirname, "..", "fixtures", ...))
  src = src.replace(
    /await readFile\(join\(__dirname,\s*"[^"]+",\s*"fixtures",\s*"([^"]+)",\s*"([^"]+)"\)\)/g,
    (match, dir, file) => {
      const reg = resolveFixturePath([dir, file]);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      return match;
    }
  );
  src = src.replace(
    /await readFile\(join\(__dirname,\s*"[^"]+",\s*"fixtures",\s*"([^"]+)"\)\)/g,
    (match, file) => {
      const reg = resolveFixturePath([file]);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      return match;
    }
  );

  // ── PASS 1b: Inline path-only refs ─────────────────────────
  // join(__dirname, "..", "fixtures", "dir", "file") -> registry path
  src = src.replace(
    /join\(__dirname,\s*"[^"]+",\s*"fixtures",\s*"([^"]+)",\s*"([^"]+)"\)/g,
    (match, dir, file) => {
      const reg = resolveFixturePath([dir, file]);
      if (reg) { needsFixtures = true; return reg; }
      return match;
    }
  );
  src = src.replace(
    /join\(__dirname,\s*"[^"]+",\s*"fixtures",\s*"([^"]+)"\)/g,
    (match, file) => {
      const reg = resolveFixturePath([file]);
      if (reg) { needsFixtures = true; return reg; }
      return match;
    }
  );

  // ── PASS 1c: Inline dir-level refs ─────────────────────────
  // join(__dirname, "..", "fixtures", "formats") -> fixtureDir.formats
  // join(__dirname, "..", "fixtures", "hostile") -> fixtureDir.hostile
  // join(__dirname, "..", "fixtures") -> fixtureRoot
  src = src.replace(
    /join\(__dirname,\s*"[^"]+",\s*"fixtures",\s*"(formats|hostile|media|documents|data|content|security)"\)/g,
    (match, dir) => { needsFixtureDir = true; return `fixtureDir.${dir}`; }
  );
  src = src.replace(
    /join\(__dirname,\s*"[^"]+",\s*"[^"]+",\s*"fixtures",\s*"(formats|hostile|media|documents|data|content|security)"\)/g,
    (match, dir) => { needsFixtureDir = true; return `fixtureDir.${dir}`; }
  );
  src = src.replace(
    /join\(__dirname,\s*"[^"]+",\s*"fixtures"\)/g,
    () => { needsFixtureRoot = true; return "fixtureRoot"; }
  );
  src = src.replace(
    /join\(__dirname,\s*"[^"]+",\s*"[^"]+",\s*"fixtures"\)/g,
    () => { needsFixtureRoot = true; return "fixtureRoot"; }
  );

  // ── PASS 2: FIXTURES/FIXTURES_DIR const-level patterns ─────
  // readFileSync(join(FIXTURES, "dir", "file"))
  src = src.replace(
    /(?:readFileSync|await readFile)\(join\((?:FIXTURES|FIXTURES_DIR|FIXTURES_ROOT),\s*"([^"]+)",\s*"([^"]+)"\)\)/g,
    (match, dir, file) => {
      const reg = resolveFixturePath([dir, file]);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      return match;
    }
  );
  // readFileSync(join(FIXTURES, "file"))
  src = src.replace(
    /(?:readFileSync|await readFile)\(join\((?:FIXTURES|FIXTURES_DIR|FIXTURES_ROOT),\s*"([^"]+)"\)\)/g,
    (match, file) => {
      const reg = resolveFixturePath([file]);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      return match;
    }
  );

  // readFileSync(join(FORMATS_DIR, "sample.ext"))
  src = src.replace(
    /readFileSync\((?:path\.)?join\(FORMATS_DIR,\s*"([^"]+)"\)\)/g,
    (match, file) => {
      const reg = resolveFixturePath(["formats", file]);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      return match;
    }
  );

  // readFileSync(join(FORMATS, `sample.${ext}`))
  src = src.replace(
    /readFileSync\(join\(FORMATS,\s*`sample\.\$\{([^}]+)\}`\)\)/g,
    (match, ext) => {
      needsFixtures = true; needsReadFixture = true;
      return `readFixture(fixtures.image.formats(${ext}))`;
    }
  );

  // ── PASS 3: path-only join(FIXTURES, ...) ──────────────────
  // join(FIXTURES, "dir", "file")
  src = src.replace(
    /join\((?:FIXTURES|FIXTURES_DIR|FIXTURES_ROOT),\s*"([^"]+)",\s*"([^"]+)"\)/g,
    (match, dir, file) => {
      const reg = resolveFixturePath([dir, file]);
      if (reg) { needsFixtures = true; return reg; }
      return match;
    }
  );
  // join(FIXTURES, "file")
  src = src.replace(
    /join\((?:FIXTURES|FIXTURES_DIR|FIXTURES_ROOT),\s*"([^"]+)"\)/g,
    (match, file) => {
      const reg = resolveFixturePath([file]);
      if (reg) { needsFixtures = true; return reg; }
      // Directory refs
      if (["formats", "hostile", "media", "documents", "data", "content", "security"].includes(file)) {
        needsFixtureDir = true;
        return `fixtureDir.${file}`;
      }
      return match;
    }
  );

  // ── PASS 4: FORMATS_DIR path-only ──────────────────────────
  src = src.replace(
    /(?:path\.)?join\(FORMATS_DIR,\s*"([^"]+)"\)/g,
    (match, file) => {
      const reg = resolveFixturePath(["formats", file]);
      if (reg) { needsFixtures = true; return reg; }
      return match;
    }
  );

  // ── PASS 5: MEDIA path refs ────────────────────────────────
  src = src.replace(
    /join\(MEDIA,\s*"([^"]+)"\)/g,
    (match, file) => {
      const reg = resolveFixturePath(["media", file]);
      if (reg) { needsFixtures = true; return reg; }
      return match;
    }
  );

  // ── PASS 6: process.cwd() patterns ─────────────────────────
  src = src.replace(
    /(?:await readFile|readFileSync)\(join\(process\.cwd\(\),\s*"tests\/fixtures\/([^"]+)"\)\)/g,
    (match, path) => {
      const segments = path.split("/");
      const reg = resolveFixturePath(segments);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      return match;
    }
  );
  src = src.replace(
    /join\(process\.cwd\(\),\s*"tests\/fixtures\/([^"]+)"\)/g,
    (match, path) => {
      const segments = path.split("/");
      const reg = resolveFixturePath(segments);
      if (reg) { needsFixtures = true; return reg; }
      return match;
    }
  );

  // ── PASS 7: path.resolve(__dirname, "../../fixtures/formats") etc ──
  src = src.replace(
    /path\.resolve\(__dirname,\s*"[^"]*fixtures\/formats"\)/g,
    () => { needsFixtureDir = true; return "fixtureDir.formats"; }
  );
  src = src.replace(
    /path\.resolve\(__dirname,\s*"[^"]*fixtures"\)/g,
    () => { needsFixtureRoot = true; return "fixtureRoot"; }
  );

  // ── PASS 8: path.join(FIXTURES_DIR, "file") in unit tests ──
  src = src.replace(
    /readFileSync\(path\.join\((?:FIXTURES_DIR|fixtureRoot),\s*"([^"]+)"\)\)/g,
    (match, p) => {
      const reg = resolveFixturePath([p]);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      // formats/sample.xxx as single string
      const segs = p.split("/");
      if (segs.length === 2) {
        const r2 = resolveFixturePath(segs);
        if (r2) { needsFixtures = true; needsReadFixture = true; return `readFixture(${r2})`; }
      }
      return match;
    }
  );
  src = src.replace(
    /path\.join\((?:FIXTURES_DIR|fixtureRoot),\s*"([^"]+)"\)/g,
    (match, p) => {
      const reg = resolveFixturePath([p]);
      if (reg) { needsFixtures = true; return reg; }
      const segs = p.split("/");
      if (segs.length === 2) {
        const r2 = resolveFixturePath(segs);
        if (r2) { needsFixtures = true; return r2; }
      }
      return match;
    }
  );

  // readFileSync(path.join(FORMATS_DIR|fixtureDir.formats, "sample.ext"))
  src = src.replace(
    /readFileSync\(path\.join\((?:FORMATS_DIR|fixtureDir\.formats),\s*"([^"]+)"\)\)/g,
    (match, file) => {
      const reg = resolveFixturePath(["formats", file]);
      if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
      return match;
    }
  );
  src = src.replace(
    /path\.join\((?:FORMATS_DIR|fixtureDir\.formats),\s*"([^"]+)"\)/g,
    (match, file) => {
      const reg = resolveFixturePath(["formats", file]);
      if (reg) { needsFixtures = true; return reg; }
      return match;
    }
  );

  // ── PASS 9: FIXTURE singular (media-engine.test.ts) ────────
  src = src.replace(
    /const FIXTURE = join\(process\.cwd\(\), "tests\/fixtures\/media\/tiny\.mp4"\);?\n?/g,
    () => { needsFixtures = true; return ""; }
  );
  // Replace FIXTURE usage (only if the def was removed)
  if (origSrc.includes('const FIXTURE = join(process.cwd(), "tests/fixtures/media/tiny.mp4")') &&
      !src.includes("const FIXTURE")) {
    src = src.replace(/\bFIXTURE\b/g, 'fixtures.video.tiny("mp4")');
  }

  // ── PASS 10: Remove now-orphaned const defs ────────────────
  // Remove const FIXTURES = join(...) if FIXTURES is no longer used
  const removeConstIfOrphaned = (constName, replacement) => {
    const defPatterns = [
      new RegExp(`const ${constName} = join\\(__dirname,\\s*"[^"]+",\\s*"fixtures"\\);?\\n?`, "g"),
      new RegExp(`const ${constName} = join\\(__dirname,\\s*"[^"]+",\\s*"[^"]+",\\s*"fixtures"\\);?\\n?`, "g"),
      new RegExp(`const ${constName} = join\\(__dirname,\\s*"[^"]*fixtures"\\);?\\n?`, "g"),
      new RegExp(`const ${constName} = join\\(import\\.meta\\.dirname,\\s*"[^"]+",\\s*"[^"]+",\\s*"fixtures"\\);?\\n?`, "g"),
      new RegExp(`const ${constName} = join\\(import\\.meta\\.dirname,\\s*"[^"]+"\\);?\\n?`, "g"),
    ];
    for (const pat of defPatterns) {
      if (pat.test(src)) {
        // Check if the const is still referenced anywhere (excluding its own definition)
        const withoutDef = src.replace(pat, "");
        const re = new RegExp(`\\b${constName}\\b`);
        if (!re.test(withoutDef)) {
          src = src.replace(pat, "");
        }
      }
    }
  };

  removeConstIfOrphaned("FIXTURES");
  removeConstIfOrphaned("_FIXTURES");
  removeConstIfOrphaned("FIXTURES_DIR");
  removeConstIfOrphaned("FIXTURES_ROOT");

  // Remove FORMATS_DIR def if orphaned
  const formatsDirDefs = [
    /const FORMATS_DIR = join\(__dirname, "[^"]+", "fixtures", "formats"\);?\n?/g,
    /const FORMATS_DIR = join\(FIXTURES, "formats"\);?\n?/g,
    /const FORMATS_DIR = path\.resolve\(__dirname, "[^"]+"\);?\n?/g,
    /const FORMATS_DIR = fixtureDir\.formats;?\n?/g,
  ];
  for (const pat of formatsDirDefs) {
    if (pat.test(src)) {
      const withoutDef = src.replace(pat, "");
      if (!/\bFORMATS_DIR\b/.test(withoutDef)) {
        src = src.replace(pat, "");
      } else {
        // Still used - replace def with fixtureDir import and replace usage
        src = src.replace(pat, "");
        src = src.replace(/\bFORMATS_DIR\b/g, "fixtureDir.formats");
        needsFixtureDir = true;
      }
    }
  }

  // Remove HOSTILE_DIR def
  const hostileDefs = [
    /const HOSTILE_DIR = join\(__dirname, "[^"]+", "fixtures", "hostile"\);?\n?/g,
    /const HOSTILE_DIR = fixtureDir\.hostile;?\n?/g,
  ];
  for (const pat of hostileDefs) {
    if (pat.test(src)) {
      const withoutDef = src.replace(pat, "");
      if (!/\bHOSTILE_DIR\b/.test(withoutDef)) {
        src = src.replace(pat, "");
      } else {
        src = src.replace(pat, "");
        src = src.replace(/\bHOSTILE_DIR\b/g, "fixtureDir.hostile");
        needsFixtureDir = true;
      }
    }
  }

  // Remove MEDIA = join(FIXTURES, "media") and MEDIA_DIR
  src = src.replace(/const MEDIA = join\(FIXTURES, "media"\);?\n?/g, () => {
    return "";
  });
  if (origSrc.includes('const MEDIA = join(FIXTURES, "media")') && !src.includes("const MEDIA")) {
    if (/\bMEDIA\b/.test(src.replace(/\bMEDIA_/g, "").replace(/"MEDIA/g, ""))) {
      src = src.replace(/\bMEDIA\b(?!_|")/g, "fixtureDir.media");
      needsFixtureDir = true;
    }
  }

  // Remove FORMATS = join(FIXTURES, "formats")
  src = src.replace(/const FORMATS = join\(FIXTURES, "formats"\);?\n?/g, () => {
    return "";
  });
  if (origSrc.includes('const FORMATS = join(FIXTURES, "formats")') && !src.includes("const FORMATS")) {
    if (/\bFORMATS\b/.test(src.replace(/\bFORMATS_/g, "").replace(/"FORMATS/g, ""))) {
      src = src.replace(/\bFORMATS\b(?!_|")/g, "fixtureDir.formats");
      needsFixtureDir = true;
    }
  }

  // Remove MEDIA_DIR, DOCUMENTS_DIR, DATA_DIR from multimodal etc
  for (const [vname, dir] of [["MEDIA_DIR", "media"], ["DOCUMENTS_DIR", "documents"], ["DATA_DIR", "data"]]) {
    const p1 = new RegExp(`const ${vname} = join\\(FIXTURES_ROOT, "${dir}"\\);?\\n?`, "g");
    const p2 = new RegExp(`const ${vname} = join\\(fixtureRoot, "${dir}"\\);?\\n?`, "g");
    for (const p of [p1, p2]) {
      if (p.test(src)) {
        src = src.replace(p, "");
        const re = new RegExp(`\\b${vname}\\b`);
        if (re.test(src)) {
          src = src.replace(re, `fixtureDir.${dir}`);
          needsFixtureDir = true;
        }
      }
    }
  }

  // Remove FIXTURES_ROOT = join(...)
  src = src.replace(/const FIXTURES_ROOT = join\(__dirname, "[^"]+", "fixtures"\);?\n?/g, "");
  src = src.replace(/const FIXTURES_ROOT = fixtureRoot;?\n?/g, "");
  if (origSrc.includes("const FIXTURES_ROOT") && !src.includes("const FIXTURES_ROOT")) {
    if (/\bFIXTURES_ROOT\b/.test(src)) {
      src = src.replace(/\bFIXTURES_ROOT\b/g, "fixtureRoot");
      needsFixtureRoot = true;
    }
  }

  // Second pass: remove FIXTURES_DIR = path.resolve or fixtureRoot
  for (const pat of [
    /const FIXTURES_DIR = fixtureRoot;?\n?/g,
    /const FIXTURES_DIR = path\.resolve\(__dirname, "[^"]+"\);?\n?/g,
  ]) {
    if (pat.test(src)) {
      const withoutDef = src.replace(pat, "");
      if (!/\bFIXTURES_DIR\b/.test(withoutDef)) {
        src = src.replace(pat, "");
      } else {
        src = src.replace(pat, "");
        src = src.replace(/\bFIXTURES_DIR\b/g, "fixtureRoot");
        needsFixtureRoot = true;
      }
    }
  }

  // Final: remove FIXTURES if now orphaned again
  for (const pat of [
    /const FIXTURES = join\(__dirname,\s*"[^"]+",\s*"fixtures"\);?\n?/g,
    /const FIXTURES = join\(__dirname,\s*"[^"]+",\s*"[^"]+",\s*"fixtures"\);?\n?/g,
    /const FIXTURES = join\(import\.meta\.dirname,\s*"[^"]+",\s*"[^"]+",\s*"fixtures"\);?\n?/g,
    /const FIXTURES = join\(import\.meta\.dirname,\s*"[^"]+"\);?\n?/g,
    /const FIXTURES = fixtureRoot;?\n?/g,
  ]) {
    if (pat.test(src)) {
      const withoutDef = src.replace(pat, "");
      if (!/\bFIXTURES\b/.test(withoutDef)) {
        src = src.replace(pat, "");
      }
    }
  }

  // settings-matrix uses FIXTURES_DIR for join(FIXTURES_DIR, ...)
  if (src.includes("FIXTURES_DIR") && !src.includes("const FIXTURES_DIR")) {
    src = src.replace(/\bFIXTURES_DIR\b/g, "fixtureRoot");
    needsFixtureRoot = true;
  }

  // Remaining FIXTURES usages
  if (src.includes("FIXTURES") && !src.includes("const FIXTURES") &&
      !src.includes("fixtures.") && !src.includes("BY_EXT")) {
    // Check for lingering join(FIXTURES, ...) that wasn't caught
    src = src.replace(
      /readFileSync\(join\(FIXTURES,\s*"([^"]+)"\)\)/g,
      (match, p) => {
        const reg = resolveFixturePath([p]);
        if (reg) { needsFixtures = true; needsReadFixture = true; return `readFixture(${reg})`; }
        return match;
      }
    );
    src = src.replace(
      /join\(FIXTURES,\s*"([^"]+)"\)/g,
      (match, p) => {
        const reg = resolveFixturePath([p]);
        if (reg) { needsFixtures = true; return reg; }
        return match;
      }
    );
  }

  if (src === origSrc) continue;

  // ── Add import statement ───────────────────────────────────
  const importParts = [];
  if (needsFixtures) importParts.push("fixtures");
  if (needsReadFixture) importParts.push("readFixture");
  if (needsFixtureDir) importParts.push("fixtureDir");
  if (needsFixtureRoot) importParts.push("fixtureRoot");

  if (importParts.length > 0) {
    const importLine = `import { ${importParts.join(", ")} } from "${relPath}";`;

    if (src.includes('fixtures/index.js"')) {
      src = src.replace(
        /import \{[^}]+\} from "[^"]*fixtures\/index\.js";?/,
        importLine
      );
    } else {
      const lines = src.split("\n");
      let lastImportIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i]) || /^} from "/.test(lines[i])) {
          lastImportIdx = i;
        }
      }
      if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, importLine);
        src = lines.join("\n");
      } else {
        src = importLine + "\n" + src;
      }
    }
  }

  // ── Clean up unused imports ────────────────────────────────
  // Remove readFileSync if no longer used
  if (!/readFileSync\s*\(/.test(src) && /import\s*\{[^}]*readFileSync/.test(src)) {
    src = src.replace(
      /(import\s*\{[^}]*)readFileSync,?\s*([^}]*\}\s*from\s*"node:fs")/,
      (match, before, after) => {
        const cleaned = (before + after).replace(/,\s*,/g, ",").replace(/\{\s*,/g, "{ ").replace(/,\s*\}/g, " }");
        return cleaned;
      }
    );
  }

  // Remove join from node:path if no longer used
  if (!/\bjoin\s*\(/.test(src) && /import\s*\{[^}]*\bjoin\b/.test(src)) {
    src = src.replace(
      /(import\s*\{[^}]*)\bjoin\b,?\s*([^}]*\}\s*from\s*"node:path")/,
      (match, before, after) => {
        const cleaned = (before + after).replace(/,\s*,/g, ",").replace(/\{\s*,/g, "{ ").replace(/,\s*\}/g, " }");
        return cleaned;
      }
    );
  }

  // Remove entire empty imports
  src = src.replace(/import\s*\{\s*\}\s*from\s*"[^"]+";\n?/g, "");
  // Remove duplicate empty lines
  src = src.replace(/\n{3,}/g, "\n\n");

  if (src !== origSrc) {
    totalMigrated++;
    migratedFiles.push(relative(ROOT, file));
    if (!DRY_RUN) {
      writeFileSync(file, src, "utf-8");
    }
  }
}

console.log(`\n=== Codemod Results ===`);
console.log(`Files migrated: ${totalMigrated}`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLIED"}`);
console.log(`\nMigrated files:`);
for (const f of migratedFiles) console.log(`  ${f}`);
