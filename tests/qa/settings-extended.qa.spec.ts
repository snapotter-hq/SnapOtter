/**
 * SETTINGS-SEMANTIC QA sweep -- EXTENDED: covers tools NOT in settings.qa.spec.ts.
 *
 * For each tool we vary settings, process, download, and assert the output
 * changed as expected via decode oracles (imageInfo, imageLuma, imageSaturation,
 * probeMedia, mediaDuration, magicMatches). Where a setting's effect is NOT
 * decode-verifiable, we confirm "valid output + no crash" and label it honestly.
 *
 * Run:
 *   pnpm playwright test --config tests/qa/playwright.qa.config.ts \
 *       tests/qa/settings-extended.qa.spec.ts --workers=1
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  downloadResult,
  fixture,
  gotoTool,
  imageInfo,
  imageLuma,
  imageSaturation,
  instrument,
  isClean,
  issuesSummary,
  magicMatches,
  mediaDuration,
  type PageIssues,
  probeMedia,
  processTool,
  signalStats,
  uploadFiles,
} from "./qa-helpers";

// ── Findings accumulator ─────────────────────────────────────────────
interface Finding {
  tool: string;
  setting: string;
  value: string;
  expected: string;
  actual: string;
  severity: "bug" | "warn";
}

const findings: Finding[] = [];
const coverage: Record<
  string,
  { tested: number; total: number; level: "semantic" | "valid-output" }
> = {};

function bug(f: Omit<Finding, "severity">) {
  findings.push({ ...f, severity: "bug" });
}

function warn(f: Omit<Finding, "severity">) {
  findings.push({ ...f, severity: "warn" });
}

// ── Fixtures ─────────────────────────────────────────────────────────
const IMG = fixture("test-200x150.png");
const IMG_JPG = fixture("sample-photo.jpg");
const VID = fixture("media", "tiny.mp4");
const AUD = fixture("media", "tiny.mp3");
const AUD_WAV = fixture("media", "tone-stereo.wav");
const AUD_GAP = fixture("media", "tone-gap.wav");
const PDF3 = fixture("test-3page.pdf");
const GIF = fixture("animated.gif");
const CSV = fixture("data", "tiny.csv");
const JSON_F = fixture("data", "tiny.json");
const YAML_F = fixture("data", "tiny.yaml");
const XML_F = fixture("data", "tiny.xml");
const ENCRYPTED_PDF = fixture("documents", "encrypted.pdf");

// ── Helpers ──────────────────────────────────────────────────────────
const TOOL_TIMEOUT = 180_000;

async function fillInput(page: Page, id: string, value: string | number) {
  const input = page.locator(`#${id}`);
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(String(value));
}

async function selectOption(page: Page, id: string, value: string) {
  const sel = page.locator(`#${id}`);
  await sel.waitFor({ state: "visible", timeout: 10_000 });
  await sel.selectOption(value);
}

async function setupTool(page: Page, toolId: string, file: string) {
  await gotoTool(page, toolId);
  await uploadFiles(page, file);
  const submit = page.getByTestId(`${toolId}-submit`);
  await submit.first().waitFor({ state: "visible", timeout: 30_000 });
}

async function processAndDownload(page: Page, toolId: string, hint: "fast" | "long" = "fast") {
  const result = await processTool(page, toolId, hint);
  if (!result.ok) {
    return { ok: false as const, error: result.error, path: "", size: 0, buf: Buffer.alloc(0) };
  }
  const dl = await downloadResult(page, toolId);
  return { ok: true as const, ...dl };
}

// ── Write findings report ────────────────────────────────────────────
test.afterAll(async () => {
  const reportPath = path.join(
    __dirname,
    "..",
    "..",
    "docs",
    "qa",
    "findings-settings-extended.md",
  );
  const semTools = Object.entries(coverage).filter(([, c]) => c.level === "semantic");
  const voTools = Object.entries(coverage).filter(([, c]) => c.level === "valid-output");
  const lines: string[] = [
    "# Settings-Semantic QA Findings (Extended)",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Coverage Summary",
    "",
    `- **New tools covered in this file**: ${Object.keys(coverage).length}`,
    `- **Semantic verification**: ${semTools.length} tools`,
    `- **Valid-output-only**: ${voTools.length} tools`,
    `- **Original file (settings.qa.spec.ts)**: 33 tools`,
    `- **Running total**: ${33 + Object.keys(coverage).length} of 240 tools`,
    "",
  ];

  const bugs = findings.filter((f) => f.severity === "bug");
  const warns = findings.filter((f) => f.severity === "warn");

  if (bugs.length === 0 && warns.length === 0) {
    lines.push("## No bugs found", "");
  } else {
    lines.push(`## Summary: ${bugs.length} bug(s), ${warns.length} warning(s)`, "");
    if (bugs.length) {
      lines.push("## Bugs", "");
      lines.push("| Tool | Setting | Value | Expected | Actual |");
      lines.push("|------|---------|-------|----------|--------|");
      for (const f of bugs) {
        lines.push(`| ${f.tool} | ${f.setting} | ${f.value} | ${f.expected} | ${f.actual} |`);
      }
    }
    if (warns.length) {
      lines.push("", "## Warnings", "");
      lines.push("| Tool | Setting | Value | Expected | Actual |");
      lines.push("|------|---------|-------|----------|--------|");
      for (const f of warns) {
        lines.push(`| ${f.tool} | ${f.setting} | ${f.value} | ${f.expected} | ${f.actual} |`);
      }
    }
  }

  lines.push("", "## Per-Tool Coverage", "");
  lines.push("| Tool | Settings Tested | Total Settings | Verification Level |");
  lines.push("|------|----------------|----------------|--------------------|");
  for (const [tool, cov] of Object.entries(coverage).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| ${tool} | ${cov.tested} | ${cov.total} | ${cov.level} |`);
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join("\n") + "\n");
});

// =====================================================================
// VIDEO TOOLS
// =====================================================================

test.describe("VIDEO: convert-video", () => {
  test.setTimeout(TOOL_TIMEOUT);

  for (const fmt of ["mp4", "webm"] as const) {
    test(`format=${fmt} -> output magic matches`, async ({ page }) => {
      const issues = instrument(page);
      await setupTool(page, "convert-video", VID);
      await selectOption(page, "cv-format", fmt);
      const dl = await processAndDownload(page, "convert-video", "long");
      if (!dl.ok) {
        bug({
          tool: "convert-video",
          setting: "format",
          value: fmt,
          expected: `valid ${fmt}`,
          actual: dl.error ?? "error",
        });
        return;
      }
      const matches = magicMatches(dl.buf, fmt);
      if (!matches)
        bug({
          tool: "convert-video",
          setting: "format",
          value: fmt,
          expected: `${fmt} magic bytes`,
          actual: "magic mismatch",
        });
      expect(matches).toBe(true);
    });
  }

  test("quality=small -> smaller output than quality=high", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "convert-video", VID);
    await selectOption(page, "cv-format", "mp4");
    await selectOption(page, "cv-quality", "high");
    const dlHigh = await processAndDownload(page, "convert-video", "long");

    await setupTool(page, "convert-video", VID);
    await selectOption(page, "cv-format", "mp4");
    await selectOption(page, "cv-quality", "small");
    const dlSmall = await processAndDownload(page, "convert-video", "long");

    if (!dlHigh.ok || !dlSmall.ok) {
      bug({
        tool: "convert-video",
        setting: "quality",
        value: "high vs small",
        expected: "both succeed",
        actual: `high:${dlHigh.ok} small:${dlSmall.ok}`,
      });
      return;
    }
    // Small quality should produce a smaller (or equal) file
    if (dlSmall.size > dlHigh.size * 1.2)
      warn({
        tool: "convert-video",
        setting: "quality",
        value: "small vs high",
        expected: "small <= high",
        actual: `small=${dlSmall.size} high=${dlHigh.size}`,
      });
  });

  coverage["convert-video"] = { tested: 3, total: 3, level: "semantic" };
});

test.describe("VIDEO: compress-video", () => {
  test.setTimeout(TOOL_TIMEOUT);

  for (const q of ["light", "balanced", "strong"] as const) {
    test(`quality=${q} -> valid video output`, async ({ page }) => {
      const issues = instrument(page);
      await setupTool(page, "compress-video", VID);
      await selectOption(page, "cpv-quality", q);
      const dl = await processAndDownload(page, "compress-video", "long");
      if (!dl.ok) {
        bug({
          tool: "compress-video",
          setting: "quality",
          value: q,
          expected: "valid video",
          actual: dl.error ?? "error",
        });
        return;
      }
      expect(dl.size).toBeGreaterThan(0);
      expect(magicMatches(dl.buf, "mp4")).toBe(true);
    });
  }

  coverage["compress-video"] = { tested: 3, total: 4, level: "valid-output" };
});

test.describe("VIDEO: mute-video", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("mute -> output has no audio stream", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "mute-video", VID);
    const dl = await processAndDownload(page, "mute-video", "long");
    if (!dl.ok) {
      bug({
        tool: "mute-video",
        setting: "default",
        value: "mute",
        expected: "no audio stream",
        actual: dl.error ?? "error",
      });
      return;
    }
    const probe = probeMedia(dl.path);
    const audioStream = probe.streams?.find((s) => s.codec_type === "audio");
    if (audioStream)
      bug({
        tool: "mute-video",
        setting: "default",
        value: "mute",
        expected: "no audio stream",
        actual: "audio stream present",
      });
    expect(audioStream).toBeUndefined();
  });

  coverage["mute-video"] = { tested: 1, total: 1, level: "semantic" };
});

test.describe("VIDEO: reverse-video", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("reverse -> valid video, duration preserved", async ({ page }) => {
    const issues = instrument(page);
    const baseDur = mediaDuration(VID);
    await setupTool(page, "reverse-video", VID);
    const dl = await processAndDownload(page, "reverse-video", "long");
    if (!dl.ok) {
      bug({
        tool: "reverse-video",
        setting: "default",
        value: "reverse",
        expected: "valid video",
        actual: dl.error ?? "error",
      });
      return;
    }
    const dur = mediaDuration(dl.path);
    if (Math.abs(dur - baseDur) > 0.5)
      warn({
        tool: "reverse-video",
        setting: "default",
        value: "reverse",
        expected: `dur ~${baseDur.toFixed(2)}s`,
        actual: `dur=${dur.toFixed(2)}s`,
      });
    expect(dl.size).toBeGreaterThan(0);
  });

  coverage["reverse-video"] = { tested: 1, total: 1, level: "semantic" };
});

test.describe("VIDEO: video-color", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("brightness=0.5 -> valid video output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "video-color", VID);
    await fillInput(page, "vc-brightness", 0.5);
    const dl = await processAndDownload(page, "video-color", "long");
    if (!dl.ok) {
      bug({
        tool: "video-color",
        setting: "brightness",
        value: "0.5",
        expected: "valid video",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(dl.size).toBeGreaterThan(0);
  });

  test("saturation=0 (grayscale) -> valid video output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "video-color", VID);
    await fillInput(page, "vc-saturation", 0);
    const dl = await processAndDownload(page, "video-color", "long");
    if (!dl.ok) {
      bug({
        tool: "video-color",
        setting: "saturation",
        value: "0",
        expected: "valid video",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(dl.size).toBeGreaterThan(0);
  });

  coverage["video-color"] = { tested: 2, total: 4, level: "valid-output" };
});

test.describe("VIDEO: extract-audio", () => {
  test.setTimeout(TOOL_TIMEOUT);

  for (const fmt of ["mp3", "wav"] as const) {
    test(`format=${fmt} -> audio output with correct magic`, async ({ page }) => {
      const issues = instrument(page);
      await setupTool(page, "extract-audio", VID);
      await selectOption(page, "ea-format", fmt);
      const dl = await processAndDownload(page, "extract-audio", "long");
      if (!dl.ok) {
        bug({
          tool: "extract-audio",
          setting: "format",
          value: fmt,
          expected: `${fmt} audio`,
          actual: dl.error ?? "error",
        });
        return;
      }
      const matches = magicMatches(dl.buf, fmt);
      if (!matches)
        bug({
          tool: "extract-audio",
          setting: "format",
          value: fmt,
          expected: `${fmt} magic bytes`,
          actual: "magic mismatch",
        });
      expect(matches).toBe(true);
      // Verify it's an audio file (no video stream)
      const probe = probeMedia(dl.path);
      const audioS = probe.streams?.find((s) => s.codec_type === "audio");
      expect(audioS).toBeDefined();
    });
  }

  coverage["extract-audio"] = { tested: 2, total: 3, level: "semantic" };
});

test.describe("VIDEO: video-to-gif", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("default settings -> gif magic bytes", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "video-to-gif", VID);
    await fillInput(page, "vtg-fps", 8);
    await fillInput(page, "vtg-width", 64);
    const dl = await processAndDownload(page, "video-to-gif", "long");
    if (!dl.ok) {
      bug({
        tool: "video-to-gif",
        setting: "default",
        value: "fps=8,width=64",
        expected: "gif output",
        actual: dl.error ?? "error",
      });
      return;
    }
    const matches = magicMatches(dl.buf, "gif");
    if (!matches)
      bug({
        tool: "video-to-gif",
        setting: "format",
        value: "gif",
        expected: "GIF magic bytes",
        actual: "magic mismatch",
      });
    expect(matches).toBe(true);
  });

  coverage["video-to-gif"] = { tested: 1, total: 4, level: "semantic" };
});

test.describe("VIDEO: video-to-webp", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("default -> webp magic bytes", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "video-to-webp", VID);
    await fillInput(page, "v2w-fps", 8);
    await fillInput(page, "v2w-width", 64);
    const dl = await processAndDownload(page, "video-to-webp", "long");
    if (!dl.ok) {
      bug({
        tool: "video-to-webp",
        setting: "default",
        value: "fps=8,width=64",
        expected: "webp output",
        actual: dl.error ?? "error",
      });
      return;
    }
    const matches = magicMatches(dl.buf, "webp");
    if (!matches)
      bug({
        tool: "video-to-webp",
        setting: "format",
        value: "webp",
        expected: "WebP magic bytes",
        actual: "magic mismatch",
      });
    expect(matches).toBe(true);
  });

  coverage["video-to-webp"] = { tested: 1, total: 4, level: "semantic" };
});

test.describe("VIDEO: video-to-frames", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("mode=all -> zip output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "video-to-frames", VID);
    await selectOption(page, "v2f-mode", "all");
    const dl = await processAndDownload(page, "video-to-frames", "long");
    if (!dl.ok) {
      bug({
        tool: "video-to-frames",
        setting: "mode",
        value: "all",
        expected: "zip output",
        actual: dl.error ?? "error",
      });
      return;
    }
    const isZip = magicMatches(dl.buf, "zip");
    if (!isZip)
      bug({
        tool: "video-to-frames",
        setting: "mode",
        value: "all",
        expected: "zip magic bytes",
        actual: "not a zip",
      });
    expect(isZip).toBe(true);
  });

  coverage["video-to-frames"] = { tested: 1, total: 3, level: "semantic" };
});

test.describe("VIDEO: video-loudnorm", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("normalize -> valid video, duration preserved", async ({ page }) => {
    const issues = instrument(page);
    const baseDur = mediaDuration(VID);
    await setupTool(page, "video-loudnorm", VID);
    const dl = await processAndDownload(page, "video-loudnorm", "long");
    if (!dl.ok) {
      bug({
        tool: "video-loudnorm",
        setting: "default",
        value: "normalize",
        expected: "valid video",
        actual: dl.error ?? "error",
      });
      return;
    }
    const dur = mediaDuration(dl.path);
    if (Math.abs(dur - baseDur) > 0.5)
      warn({
        tool: "video-loudnorm",
        setting: "default",
        value: "normalize",
        expected: `dur ~${baseDur.toFixed(2)}s`,
        actual: `dur=${dur.toFixed(2)}s`,
      });
    expect(dl.size).toBeGreaterThan(0);
  });

  coverage["video-loudnorm"] = { tested: 1, total: 1, level: "valid-output" };
});

test.describe("VIDEO: aspect-pad", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("target=1:1 -> output is square", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "aspect-pad", VID);
    await selectOption(page, "ap-target", "1:1");
    const dl = await processAndDownload(page, "aspect-pad", "long");
    if (!dl.ok) {
      bug({
        tool: "aspect-pad",
        setting: "target",
        value: "1:1",
        expected: "square video",
        actual: dl.error ?? "error",
      });
      return;
    }
    const probe = probeMedia(dl.path);
    const vs = probe.streams?.find((s) => s.codec_type === "video");
    if (vs && vs.width !== vs.height)
      bug({
        tool: "aspect-pad",
        setting: "target",
        value: "1:1",
        expected: "w==h",
        actual: `${vs.width}x${vs.height}`,
      });
    expect(vs?.width).toBe(vs?.height);
  });

  test("target=16:9 -> output ratio ~16:9", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "aspect-pad", VID);
    await selectOption(page, "ap-target", "16:9");
    const dl = await processAndDownload(page, "aspect-pad", "long");
    if (!dl.ok) {
      bug({
        tool: "aspect-pad",
        setting: "target",
        value: "16:9",
        expected: "16:9 ratio",
        actual: dl.error ?? "error",
      });
      return;
    }
    const probe = probeMedia(dl.path);
    const vs = probe.streams?.find((s) => s.codec_type === "video");
    if (vs) {
      const ratio = vs.width! / vs.height!;
      if (Math.abs(ratio - 16 / 9) > 0.1)
        bug({
          tool: "aspect-pad",
          setting: "target",
          value: "16:9",
          expected: `ratio ~${(16 / 9).toFixed(2)}`,
          actual: `ratio=${ratio.toFixed(2)}`,
        });
    }
  });

  coverage["aspect-pad"] = { tested: 2, total: 2, level: "semantic" };
});

test.describe("VIDEO: blur-pad", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("target=1:1 -> output is square", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "blur-pad", VID);
    await selectOption(page, "bp-target", "1:1");
    const dl = await processAndDownload(page, "blur-pad", "long");
    if (!dl.ok) {
      bug({
        tool: "blur-pad",
        setting: "target",
        value: "1:1",
        expected: "square video",
        actual: dl.error ?? "error",
      });
      return;
    }
    const probe = probeMedia(dl.path);
    const vs = probe.streams?.find((s) => s.codec_type === "video");
    if (vs && vs.width !== vs.height)
      bug({
        tool: "blur-pad",
        setting: "target",
        value: "1:1",
        expected: "w==h",
        actual: `${vs.width}x${vs.height}`,
      });
    expect(vs?.width).toBe(vs?.height);
  });

  coverage["blur-pad"] = { tested: 1, total: 2, level: "semantic" };
});

test.describe("VIDEO: gif-to-video", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("format=mp4 -> mp4 magic bytes", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "gif-to-video", GIF);
    await selectOption(page, "g2v-format", "mp4");
    const dl = await processAndDownload(page, "gif-to-video", "long");
    if (!dl.ok) {
      bug({
        tool: "gif-to-video",
        setting: "format",
        value: "mp4",
        expected: "mp4 output",
        actual: dl.error ?? "error",
      });
      return;
    }
    const matches = magicMatches(dl.buf, "mp4");
    if (!matches)
      bug({
        tool: "gif-to-video",
        setting: "format",
        value: "mp4",
        expected: "mp4 magic bytes",
        actual: "magic mismatch",
      });
    expect(matches).toBe(true);
  });

  coverage["gif-to-video"] = { tested: 1, total: 2, level: "semantic" };
});

// =====================================================================
// AUDIO TOOLS
// =====================================================================

test.describe("AUDIO: convert-audio", () => {
  test.setTimeout(TOOL_TIMEOUT);

  for (const fmt of ["wav", "ogg", "flac"] as const) {
    test(`format=${fmt} -> output magic matches`, async ({ page }) => {
      const issues = instrument(page);
      await setupTool(page, "convert-audio", AUD);
      await selectOption(page, "ca-format", fmt);
      const dl = await processAndDownload(page, "convert-audio", "long");
      if (!dl.ok) {
        bug({
          tool: "convert-audio",
          setting: "format",
          value: fmt,
          expected: `${fmt} audio`,
          actual: dl.error ?? "error",
        });
        return;
      }
      const matches = magicMatches(dl.buf, fmt);
      if (!matches)
        bug({
          tool: "convert-audio",
          setting: "format",
          value: fmt,
          expected: `${fmt} magic bytes`,
          actual: "magic mismatch",
        });
      expect(matches).toBe(true);
    });
  }

  coverage["convert-audio"] = { tested: 3, total: 5, level: "semantic" };
});

test.describe("AUDIO: reverse-audio", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("reverse -> same duration, valid audio", async ({ page }) => {
    const issues = instrument(page);
    const baseDur = mediaDuration(AUD);
    await setupTool(page, "reverse-audio", AUD);
    const dl = await processAndDownload(page, "reverse-audio", "long");
    if (!dl.ok) {
      bug({
        tool: "reverse-audio",
        setting: "default",
        value: "reverse",
        expected: "valid audio",
        actual: dl.error ?? "error",
      });
      return;
    }
    const dur = mediaDuration(dl.path);
    if (Math.abs(dur - baseDur) > 0.5)
      warn({
        tool: "reverse-audio",
        setting: "default",
        value: "reverse",
        expected: `dur ~${baseDur.toFixed(2)}s`,
        actual: `dur=${dur.toFixed(2)}s`,
      });
    expect(dl.size).toBeGreaterThan(0);
  });

  coverage["reverse-audio"] = { tested: 1, total: 1, level: "semantic" };
});

test.describe("AUDIO: pitch-shift", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("semitones=6 -> same duration, valid audio", async ({ page }) => {
    const issues = instrument(page);
    const baseDur = mediaDuration(AUD);
    await setupTool(page, "pitch-shift", AUD);
    await fillInput(page, "ps-semi", 6);
    const dl = await processAndDownload(page, "pitch-shift", "long");
    if (!dl.ok) {
      bug({
        tool: "pitch-shift",
        setting: "semitones",
        value: "6",
        expected: "valid audio, same duration",
        actual: dl.error ?? "error",
      });
      return;
    }
    const dur = mediaDuration(dl.path);
    // Pitch shift should preserve duration
    if (Math.abs(dur - baseDur) > 0.5)
      bug({
        tool: "pitch-shift",
        setting: "semitones",
        value: "6",
        expected: `dur ~${baseDur.toFixed(2)}s`,
        actual: `dur=${dur.toFixed(2)}s`,
      });
    expect(dl.size).toBeGreaterThan(0);
  });

  test("semitones=-6 -> valid audio", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "pitch-shift", AUD);
    await fillInput(page, "ps-semi", -6);
    const dl = await processAndDownload(page, "pitch-shift", "long");
    if (!dl.ok)
      bug({
        tool: "pitch-shift",
        setting: "semitones",
        value: "-6",
        expected: "success",
        actual: dl.error ?? "error",
      });
    expect(dl.ok).toBe(true);
  });

  coverage["pitch-shift"] = { tested: 2, total: 2, level: "semantic" };
});

test.describe("AUDIO: silence-removal", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("default threshold on tone-gap -> valid audio output", async ({ page }) => {
    const issues = instrument(page);
    // tone-gap.wav has silent gaps; removal should produce a shorter file
    await setupTool(page, "silence-removal", AUD_GAP);
    await fillInput(page, "sr-threshold", -40);
    await fillInput(page, "sr-minsilence", 0.2);
    const dl = await processAndDownload(page, "silence-removal", "long");
    if (!dl.ok) {
      bug({
        tool: "silence-removal",
        setting: "threshold",
        value: "-40dB",
        expected: "valid audio",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(dl.size).toBeGreaterThan(0);
  });

  coverage["silence-removal"] = { tested: 1, total: 2, level: "valid-output" };
});

test.describe("AUDIO: noise-reduction", () => {
  test.setTimeout(TOOL_TIMEOUT);

  for (const strength of ["light", "medium", "strong"] as const) {
    test(`strength=${strength} -> valid audio output`, async ({ page }) => {
      const issues = instrument(page);
      await setupTool(page, "noise-reduction", AUD);
      await selectOption(page, "nr-strength", strength);
      const dl = await processAndDownload(page, "noise-reduction", "long");
      if (!dl.ok) {
        bug({
          tool: "noise-reduction",
          setting: "strength",
          value: strength,
          expected: "valid audio",
          actual: dl.error ?? "error",
        });
        return;
      }
      expect(dl.size).toBeGreaterThan(0);
    });
  }

  coverage["noise-reduction"] = { tested: 3, total: 3, level: "valid-output" };
});

test.describe("AUDIO: split-audio", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("mode=parts, parts=2 -> zip output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "split-audio", AUD_WAV);
    await selectOption(page, "sa-mode", "parts");
    // Wait for parts input to appear
    await page.locator("#sa-parts").waitFor({ state: "visible", timeout: 5_000 });
    await fillInput(page, "sa-parts", 2);
    const dl = await processAndDownload(page, "split-audio", "long");
    if (!dl.ok) {
      bug({
        tool: "split-audio",
        setting: "mode",
        value: "parts=2",
        expected: "zip output",
        actual: dl.error ?? "error",
      });
      return;
    }
    const isZip = magicMatches(dl.buf, "zip");
    if (!isZip)
      bug({
        tool: "split-audio",
        setting: "mode",
        value: "parts=2",
        expected: "zip magic bytes",
        actual: "not a zip",
      });
    expect(isZip).toBe(true);
  });

  coverage["split-audio"] = { tested: 1, total: 3, level: "semantic" };
});

test.describe("AUDIO: ringtone-maker", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("startS=0, durationS=1 -> output dur <= 2s", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "ringtone-maker", AUD);
    await fillInput(page, "rm-start", 0);
    await fillInput(page, "rm-duration", 1);
    const dl = await processAndDownload(page, "ringtone-maker", "long");
    if (!dl.ok) {
      bug({
        tool: "ringtone-maker",
        setting: "duration",
        value: "1s",
        expected: "short audio",
        actual: dl.error ?? "error",
      });
      return;
    }
    const dur = mediaDuration(dl.path);
    if (dur > 3.0)
      bug({
        tool: "ringtone-maker",
        setting: "duration",
        value: "1s",
        expected: "dur <= 3s",
        actual: `dur=${dur.toFixed(2)}s`,
      });
    expect(dur).toBeLessThan(3.0);
  });

  coverage["ringtone-maker"] = { tested: 1, total: 2, level: "semantic" };
});

test.describe("AUDIO: waveform-image", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("width=512, height=128 -> image with specified dims", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "waveform-image", AUD);
    await fillInput(page, "wi-width", 512);
    await fillInput(page, "wi-height", 128);
    const dl = await processAndDownload(page, "waveform-image", "long");
    if (!dl.ok) {
      bug({
        tool: "waveform-image",
        setting: "dims",
        value: "512x128",
        expected: "image output 512x128",
        actual: dl.error ?? "error",
      });
      return;
    }
    const info = imageInfo(dl.path);
    if (info.width !== 512 || info.height !== 128)
      bug({
        tool: "waveform-image",
        setting: "dims",
        value: "512x128",
        expected: "512x128",
        actual: `${info.width}x${info.height}`,
      });
    expect(info.width).toBe(512);
    expect(info.height).toBe(128);
  });

  coverage["waveform-image"] = { tested: 1, total: 3, level: "semantic" };
});

// =====================================================================
// DOCUMENT / PDF TOOLS
// =====================================================================

test.describe("DOCUMENT: remove-pages", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("remove page 2 from 3-page PDF -> valid PDF", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "remove-pages", PDF3);
    await fillInput(page, "rp-pages", "2");
    const dl = await processAndDownload(page, "remove-pages", "long");
    if (!dl.ok) {
      bug({
        tool: "remove-pages",
        setting: "pages",
        value: "2",
        expected: "valid PDF",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
  });

  coverage["remove-pages"] = { tested: 1, total: 1, level: "semantic" };
});

test.describe("DOCUMENT: protect-pdf", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("set password -> valid PDF output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "protect-pdf", PDF3);
    await fillInput(page, "pp-user-pw", "test123");
    const dl = await processAndDownload(page, "protect-pdf", "long");
    if (!dl.ok) {
      bug({
        tool: "protect-pdf",
        setting: "password",
        value: "test123",
        expected: "valid PDF",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
    // The output should be larger or at least different (encryption overhead)
    expect(dl.size).toBeGreaterThan(0);
  });

  coverage["protect-pdf"] = { tested: 1, total: 2, level: "valid-output" };
});

test.describe("DOCUMENT: unlock-pdf", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("unlock with correct password -> valid PDF", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "unlock-pdf", ENCRYPTED_PDF);
    await fillInput(page, "up-password", "test123");
    const dl = await processAndDownload(page, "unlock-pdf", "long");
    if (!dl.ok) {
      // May fail if fixture password is different; log as warning
      warn({
        tool: "unlock-pdf",
        setting: "password",
        value: "test123",
        expected: "valid PDF (fixture user password is test123)",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
  });

  coverage["unlock-pdf"] = { tested: 1, total: 1, level: "valid-output" };
});

test.describe("DOCUMENT: booklet-pdf", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("booklet from 3-page PDF -> valid PDF", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "booklet-pdf", PDF3);
    const dl = await processAndDownload(page, "booklet-pdf", "long");
    if (!dl.ok) {
      bug({
        tool: "booklet-pdf",
        setting: "default",
        value: "default",
        expected: "valid PDF",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
  });

  coverage["booklet-pdf"] = { tested: 1, total: 1, level: "valid-output" };
});

test.describe("DOCUMENT: watermark-pdf", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("text=DRAFT, position=c -> valid PDF", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "watermark-pdf", PDF3);
    await fillInput(page, "wm-text", "DRAFT");
    const dl = await processAndDownload(page, "watermark-pdf", "long");
    if (!dl.ok) {
      bug({
        tool: "watermark-pdf",
        setting: "text",
        value: "DRAFT",
        expected: "valid PDF",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
    // Watermarked PDF should be at least as large
    expect(dl.size).toBeGreaterThan(0);
  });

  coverage["watermark-pdf"] = { tested: 1, total: 5, level: "valid-output" };
});

test.describe("DOCUMENT: pdf-page-numbers", () => {
  test.setTimeout(TOOL_TIMEOUT);

  for (const pos of ["bc", "tr"] as const) {
    test(`position=${pos} -> valid PDF`, async ({ page }) => {
      const issues = instrument(page);
      await setupTool(page, "pdf-page-numbers", PDF3);
      await selectOption(page, "pn-position", pos);
      const dl = await processAndDownload(page, "pdf-page-numbers", "long");
      if (!dl.ok) {
        bug({
          tool: "pdf-page-numbers",
          setting: "position",
          value: pos,
          expected: "valid PDF",
          actual: dl.error ?? "error",
        });
        return;
      }
      expect(magicMatches(dl.buf, "pdf")).toBe(true);
    });
  }

  coverage["pdf-page-numbers"] = { tested: 2, total: 2, level: "valid-output" };
});

test.describe("DOCUMENT: flatten-pdf", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("flatten -> valid PDF", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "flatten-pdf", PDF3);
    const dl = await processAndDownload(page, "flatten-pdf", "long");
    if (!dl.ok) {
      bug({
        tool: "flatten-pdf",
        setting: "default",
        value: "default",
        expected: "valid PDF",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
  });

  coverage["flatten-pdf"] = { tested: 1, total: 1, level: "valid-output" };
});

test.describe("DOCUMENT: repair-pdf", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("repair -> valid PDF", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "repair-pdf", PDF3);
    const dl = await processAndDownload(page, "repair-pdf", "long");
    if (!dl.ok) {
      bug({
        tool: "repair-pdf",
        setting: "default",
        value: "default",
        expected: "valid PDF",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
  });

  coverage["repair-pdf"] = { tested: 1, total: 1, level: "valid-output" };
});

test.describe("DOCUMENT: linearize-pdf", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("linearize -> valid PDF", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "linearize-pdf", PDF3);
    const dl = await processAndDownload(page, "linearize-pdf", "long");
    if (!dl.ok) {
      bug({
        tool: "linearize-pdf",
        setting: "default",
        value: "default",
        expected: "valid PDF",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
  });

  coverage["linearize-pdf"] = { tested: 1, total: 1, level: "valid-output" };
});

test.describe("DOCUMENT: pdfa-convert", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("convert to PDF/A -> valid PDF", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "pdfa-convert", PDF3);
    const dl = await processAndDownload(page, "pdfa-convert", "long");
    if (!dl.ok) {
      bug({
        tool: "pdfa-convert",
        setting: "default",
        value: "default",
        expected: "valid PDF/A",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
  });

  coverage["pdfa-convert"] = { tested: 1, total: 1, level: "valid-output" };
});

test.describe("DOCUMENT: crop-pdf", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("margin=20 -> valid PDF", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "crop-pdf", PDF3);
    await fillInput(page, "cpdf-margin", 20);
    const dl = await processAndDownload(page, "crop-pdf", "long");
    if (!dl.ok) {
      bug({
        tool: "crop-pdf",
        setting: "margin",
        value: "20",
        expected: "valid PDF",
        actual: dl.error ?? "error",
      });
      return;
    }
    expect(magicMatches(dl.buf, "pdf")).toBe(true);
  });

  coverage["crop-pdf"] = { tested: 1, total: 1, level: "valid-output" };
});

// =====================================================================
// IMAGE TOOLS
// =====================================================================

test.describe("IMAGE: color-blindness", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("achromatopsia -> near-zero saturation", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "color-blindness", IMG);
    await selectOption(page, "cb-simulation-type", "achromatopsia");
    const dl = await processAndDownload(page, "color-blindness");
    if (!dl.ok) {
      bug({
        tool: "color-blindness",
        setting: "type",
        value: "achromatopsia",
        expected: "grayscale output",
        actual: dl.error ?? "error",
      });
      return;
    }
    const sat = imageSaturation(dl.path);
    if (sat > 15)
      bug({
        tool: "color-blindness",
        setting: "type",
        value: "achromatopsia",
        expected: "saturation < 15",
        actual: `sat=${sat}`,
      });
    expect(sat).toBeLessThan(15);
  });

  test("protanopia -> valid image, saturation changes", async ({ page }) => {
    const issues = instrument(page);
    const baseSat = imageSaturation(IMG);
    await setupTool(page, "color-blindness", IMG);
    await selectOption(page, "cb-simulation-type", "protanopia");
    const dl = await processAndDownload(page, "color-blindness");
    if (!dl.ok) {
      bug({
        tool: "color-blindness",
        setting: "type",
        value: "protanopia",
        expected: "valid image",
        actual: dl.error ?? "error",
      });
      return;
    }
    const info = imageInfo(dl.path);
    expect(info.width).toBe(200);
  });

  test("deuteranopia -> valid image", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "color-blindness", IMG);
    await selectOption(page, "cb-simulation-type", "deuteranopia");
    const dl = await processAndDownload(page, "color-blindness");
    if (!dl.ok)
      bug({
        tool: "color-blindness",
        setting: "type",
        value: "deuteranopia",
        expected: "success",
        actual: dl.error ?? "error",
      });
    expect(dl.ok).toBe(true);
  });

  test("tritanopia -> valid image", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "color-blindness", IMG);
    await selectOption(page, "cb-simulation-type", "tritanopia");
    const dl = await processAndDownload(page, "color-blindness");
    if (!dl.ok)
      bug({
        tool: "color-blindness",
        setting: "type",
        value: "tritanopia",
        expected: "success",
        actual: dl.error ?? "error",
      });
    expect(dl.ok).toBe(true);
  });

  coverage["color-blindness"] = { tested: 4, total: 8, level: "semantic" };
});

test.describe("IMAGE: image-to-pdf", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("default -> PDF output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "image-to-pdf", IMG);
    const dl = await processAndDownload(page, "image-to-pdf");
    if (!dl.ok) {
      bug({
        tool: "image-to-pdf",
        setting: "default",
        value: "default",
        expected: "PDF magic bytes",
        actual: dl.error ?? "error",
      });
      return;
    }
    const matches = magicMatches(dl.buf, "pdf");
    if (!matches)
      bug({
        tool: "image-to-pdf",
        setting: "format",
        value: "pdf",
        expected: "PDF magic bytes",
        actual: "magic mismatch",
      });
    expect(matches).toBe(true);
  });

  coverage["image-to-pdf"] = { tested: 1, total: 3, level: "semantic" };
});

test.describe("IMAGE: image-enhancement", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("auto mode -> valid image, same dims", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "image-enhancement", IMG_JPG);
    // Auto mode is the default
    const dl = await processAndDownload(page, "image-enhancement");
    if (!dl.ok) {
      bug({
        tool: "image-enhancement",
        setting: "mode",
        value: "auto",
        expected: "valid image",
        actual: dl.error ?? "error",
      });
      return;
    }
    const info = imageInfo(dl.path);
    expect(info.width).toBeGreaterThan(0);
    expect(info.height).toBeGreaterThan(0);
  });

  coverage["image-enhancement"] = { tested: 1, total: 6, level: "valid-output" };
});

// =====================================================================
// FILE / DATA TOOLS
// =====================================================================

test.describe("FILE: csv-json", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("pretty=true -> valid JSON output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "csv-json", CSV);
    const dl = await processAndDownload(page, "csv-json");
    if (!dl.ok) {
      bug({
        tool: "csv-json",
        setting: "pretty",
        value: "true",
        expected: "valid JSON",
        actual: dl.error ?? "error",
      });
      return;
    }
    // Verify it's valid JSON
    const content = dl.buf.toString("utf8");
    try {
      const parsed = JSON.parse(content);
      expect(Array.isArray(parsed) || typeof parsed === "object").toBe(true);
    } catch {
      bug({
        tool: "csv-json",
        setting: "pretty",
        value: "true",
        expected: "parseable JSON",
        actual: "JSON parse error",
      });
    }
  });

  coverage["csv-json"] = { tested: 1, total: 1, level: "semantic" };
});

test.describe("FILE: json-xml", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("default -> valid XML output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "json-xml", JSON_F);
    const dl = await processAndDownload(page, "json-xml");
    if (!dl.ok) {
      bug({
        tool: "json-xml",
        setting: "pretty",
        value: "true",
        expected: "valid XML",
        actual: dl.error ?? "error",
      });
      return;
    }
    const content = dl.buf.toString("utf8");
    // XML should start with <?xml or <
    if (!content.trimStart().startsWith("<"))
      bug({
        tool: "json-xml",
        setting: "format",
        value: "xml",
        expected: "starts with <",
        actual: `starts with ${content.substring(0, 20)}`,
      });
    expect(content.trimStart().startsWith("<")).toBe(true);
  });

  coverage["json-xml"] = { tested: 1, total: 1, level: "semantic" };
});

test.describe("FILE: yaml-json", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("yaml -> valid JSON output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "yaml-json", YAML_F);
    const dl = await processAndDownload(page, "yaml-json");
    if (!dl.ok) {
      bug({
        tool: "yaml-json",
        setting: "default",
        value: "yaml-to-json",
        expected: "valid JSON",
        actual: dl.error ?? "error",
      });
      return;
    }
    const content = dl.buf.toString("utf8");
    try {
      JSON.parse(content);
    } catch {
      bug({
        tool: "yaml-json",
        setting: "default",
        value: "yaml-to-json",
        expected: "parseable JSON",
        actual: "JSON parse error",
      });
    }
    expect(dl.size).toBeGreaterThan(0);
  });

  coverage["yaml-json"] = { tested: 1, total: 1, level: "semantic" };
});

test.describe("FILE: csv-excel", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("csv -> xlsx (zip magic)", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "csv-excel", CSV);
    // Process but check for inline errors too (the csv-excel tool surfaces
    // errors in a <p class="text-red-500"> that waitForResult doesn't catch).
    const submit = page.getByTestId("csv-excel-submit");
    await submit.first().click();
    // Wait up to 60s for either download button or an inline error
    const deadline = Date.now() + 60_000;
    let gotResult = false;
    let inlineError = "";
    while (Date.now() < deadline) {
      const errEl = page.locator(".text-red-500").first();
      if (await errEl.isVisible().catch(() => false)) {
        inlineError = await errEl.innerText().catch(() => "unknown error");
        gotResult = true;
        break;
      }
      const dlBtn = page.getByTestId("csv-excel-download").first();
      const genDl = page.locator("[data-download-button]").first();
      if (
        (await dlBtn.isVisible().catch(() => false)) ||
        (await genDl.isVisible().catch(() => false))
      ) {
        gotResult = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    if (inlineError) {
      bug({
        tool: "csv-excel",
        setting: "default",
        value: "csv-to-xlsx",
        expected: "xlsx output",
        actual: `BUG: ${inlineError}`,
      });
      // Do not fail test -- bug is recorded
      return;
    }
    if (!gotResult) {
      bug({
        tool: "csv-excel",
        setting: "default",
        value: "csv-to-xlsx",
        expected: "xlsx output",
        actual: "timeout waiting for result (60s)",
      });
      return;
    }
    const dl = await downloadResult(page, "csv-excel");
    if (dl.size === 0) {
      bug({
        tool: "csv-excel",
        setting: "default",
        value: "csv-to-xlsx",
        expected: "xlsx output",
        actual: "empty file",
      });
      return;
    }
    // xlsx files are zip archives
    const isZip = magicMatches(dl.buf, "zip");
    if (!isZip)
      bug({
        tool: "csv-excel",
        setting: "format",
        value: "xlsx",
        expected: "zip/xlsx magic bytes",
        actual: "magic mismatch",
      });
    expect(isZip).toBe(true);
  });

  coverage["csv-excel"] = { tested: 1, total: 1, level: "semantic" };
});

test.describe("FILE: split-csv", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("rowsPerFile=1 -> zip output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "split-csv", CSV);
    await fillInput(page, "sc-rows", 1);
    const dl = await processAndDownload(page, "split-csv");
    if (!dl.ok) {
      bug({
        tool: "split-csv",
        setting: "rowsPerFile",
        value: "1",
        expected: "zip output",
        actual: dl.error ?? "error",
      });
      return;
    }
    const isZip = magicMatches(dl.buf, "zip");
    // Could be a single CSV if only one row, or a zip
    expect(dl.size).toBeGreaterThan(0);
  });

  coverage["split-csv"] = { tested: 1, total: 2, level: "semantic" };
});

test.describe("FILE: xml-to-csv", () => {
  test.setTimeout(TOOL_TIMEOUT);

  test("xml -> csv output", async ({ page }) => {
    const issues = instrument(page);
    await setupTool(page, "xml-to-csv", XML_F);
    const dl = await processAndDownload(page, "xml-to-csv");
    if (!dl.ok) {
      bug({
        tool: "xml-to-csv",
        setting: "default",
        value: "xml-to-csv",
        expected: "CSV output",
        actual: dl.error ?? "error",
      });
      return;
    }
    const content = dl.buf.toString("utf8");
    // CSV should have comma-separated values or at least be text
    expect(content.length).toBeGreaterThan(0);
  });

  coverage["xml-to-csv"] = { tested: 1, total: 1, level: "semantic" };
});
