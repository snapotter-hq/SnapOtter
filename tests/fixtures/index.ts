import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)); // tests/fixtures
const p = (rel: string): string => join(ROOT, rel);

export const fixtureRoot = ROOT;
export const fixtureDir = {
  // Backward-compat flat aliases (used by format-matrix, hostile-inputs, multimodal tests)
  formats: join(ROOT, "image/formats"),
  hostile: join(ROOT, "image/hostile"),
  media: join(ROOT, "video/formats"),
  documents: join(ROOT, "document/formats"),
  data: join(ROOT, "data/valid"),
  security: join(ROOT, "security"),
  // Modality-structured dirs
  image: {
    valid: join(ROOT, "image/valid"),
    formats: join(ROOT, "image/formats"),
    edge: join(ROOT, "image/edge"),
    hostile: join(ROOT, "image/hostile"),
  },
  video: {
    valid: join(ROOT, "video/valid"),
    formats: join(ROOT, "video/formats"),
    hostile: join(ROOT, "video/hostile"),
  },
  audio: {
    valid: join(ROOT, "audio/valid"),
    formats: join(ROOT, "audio/formats"),
    hostile: join(ROOT, "audio/hostile"),
  },
  document: {
    valid: join(ROOT, "document/valid"),
    formats: join(ROOT, "document/formats"),
    edge: join(ROOT, "document/edge"),
    hostile: join(ROOT, "document/hostile"),
  },
};

export const fixtures = {
  image: {
    base: {
      png200: p("image/valid/test-200x150.png"),
      jpg100: p("image/valid/test-100x100.jpg"),
      webp50: p("image/valid/test-50x50.webp"),
      svg100: p("image/valid/test-100x100.svg"),
      heic200: p("image/valid/test-200x150.heic"),
    },
    scene: p("image/valid/test-scene.png"),
    portrait: {
      jpg: p("image/valid/portrait-color.jpg"),
      heic: p("image/valid/portrait-headshot.heic"),
      bw: p("image/valid/portrait-bw.jpeg"),
      isolated: p("image/valid/portrait-isolated.png"),
    },
    multiFace: p("image/valid/multi-face.webp"),
    redEye: p("image/valid/red-eye.jpg"),
    exifGps: p("image/valid/test-with-exif.jpg"),
    transparent: p("image/edge/test-fake-transparency.png"),
    animated: {
      gif: p("image/valid/animated.gif"),
      webp: p("image/valid/animated.webp"),
      apng: p("image/valid/animated.apng"),
      real: p("image/valid/animated-simpsons.gif"),
    },
    ocr: {
      clean: p("image/valid/ocr-clean.png"),
      japanese: p("image/valid/ocr-japanese.png"),
      chat: p("image/valid/ocr-chat.jpeg"),
    },
    code: {
      barcodePng: p("image/valid/barcode.png"),
      barcodeAvif: p("image/valid/barcode.avif"),
      qrPng: p("image/valid/qr-code.png"),
      qrSvg: p("image/valid/qr-code.svg"),
      qrAvif: p("image/valid/qr-code.avif"),
    },
    svgLogo: p("image/valid/svg-logo.svg"),
    motorcycle: p("image/valid/motorcycle.heif"),
    crossFormatChat: p("image/valid/cross-format-chat.webp"),
    portraitJpg: p("image/valid/test-portrait.jpg"),
    portraitHeic: p("image/valid/test-portrait.heic"),
    watermark: p("image/valid/watermark.jpg"),
    stressLarge: p("image/valid/stress-large.jpg"),
    edge: {
      px1: p("image/edge/test-1x1.png"),
      blank: p("image/edge/test-blank.png"),
      tall: p("image/edge/test-portrait-tall.png"),
      extreme: p("image/edge/test-portrait-extreme.png"),
    },
    formats: (ext: string) => p(`image/formats/sample.${ext}`),
    multipageTiff: p("image/formats/multipage.tiff"),
    hostile: {
      truncated: p("image/hostile/truncated.jpg"),
      garbage: p("image/hostile/garbage.jpg"),
      bomb: p("image/hostile/bomb-50000x50000.png"),
      extMismatch: p("image/hostile/png-bytes.jpg"),
    },
    hostileEmpty: { zeroByte: p("image/hostile/zero-byte.png") },
  },
  video: {
    hero: {
      mp4: p("video/valid/media-30s.mp4"),
      mov: p("video/valid/hero.mov"),
      webm: p("video/valid/hero.webm"),
      mkv: p("video/valid/hero.mkv"),
      avi: p("video/valid/hero.avi"),
    },
    speech: { mp4: p("video/valid/speech-10s.mp4") },
    withMeta: p("video/valid/video-with-meta.mp4"),
    tiny: (ext: string) => p(`video/formats/tiny.${ext}`),
    subs: {
      mkv: p("video/formats/tiny-subs.mkv"),
      srt: p("video/formats/tiny.srt"),
      vtt: p("video/formats/tiny.vtt"),
      ass: p("video/formats/tiny.ass"),
    },
    hostile: { truncated: p("video/hostile/truncated.mp4") },
  },
  audio: {
    speech: {
      wav: p("audio/valid/speech-10s.wav"),
      flac: p("audio/valid/speech.flac"),
      ogg: p("audio/valid/speech.ogg"),
      m4a: p("audio/valid/speech.m4a"),
      aac: p("audio/valid/speech.aac"),
      opus: p("audio/valid/speech.opus"),
    },
    music: { wav: p("audio/valid/media-30s.wav") },
    tagged: p("audio/valid/audio-with-tags.mp3"),
    stereo: p("audio/formats/tone-stereo.wav"),
    gap: p("audio/formats/tone-gap.wav"),
    tiny: (ext: string) => p(`audio/formats/tiny.${ext}`),
    hostileEmpty: { zeroByte: p("audio/hostile/zero-byte.wav") },
  },
  document: {
    pdfMulti: p("document/valid/multipage-6.pdf"),
    pdf2: p("document/valid/alt-2page.pdf"),
    pdf3: p("document/valid/test-3page.pdf"),
    pdfScanned: p("document/valid/ocr-scanned.pdf"),
    encrypted: p("document/valid/encrypted.pdf"),
    coloredBlock: p("document/edge/colored-block.pdf"),
    tiny: (ext: string) => p(`document/formats/tiny.${ext}`),
    remoteImgHtml: p("document/edge/remote-img.html"),
    hostile: {
      truncatedDocx: p("document/hostile/truncated.docx"),
      garbagePdf: p("document/hostile/garbage.pdf"),
    },
  },
  data: {
    csv: p("data/valid/tiny.csv"),
    csvA: p("data/valid/tiny-a.csv"),
    csvB: p("data/valid/tiny-b.csv"),
    json: p("data/valid/tiny.json"),
    xml: p("data/valid/tiny.xml"),
    yaml: p("data/valid/tiny.yaml"),
    tsv: p("data/valid/tiny.tsv"),
    zip: p("data/valid/tiny.zip"),
  },
  security: {
    svgXxeFile: p("security/svg-xxe-file-read.svg"),
    svgXxeSsrf: p("security/svg-xxe-ssrf.svg"),
    polyglot: p("image/hostile/png-bytes.jpg"),
    htmlSsrf: p("document/edge/remote-img.html"),
  },
} as const;

export function readFixture(path: string): Buffer {
  return readFileSync(path);
}

// Recursively collect every string-valued leaf, EXCLUDING `*hostileEmpty*` groups
// (intentionally zero-byte) and function leaves (the `formats`/`tiny` accessors).
export function flattenFixturePaths(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) =>
      k.toLowerCase().includes("hostileempty") ? [] : flattenFixturePaths(v),
    );
  }
  return []; // functions (accessors) and other non-leaves
}
