import { describe, expect, it } from "vitest";
import { TOOLS } from "../../../packages/shared/src/constants.js";
import {
  CONVERSION_PRESETS,
  expandConversionPresets,
} from "../../../packages/shared/src/conversion-presets.js";

describe("conversion presets", () => {
  it("defines 117 presets with unique ids", () => {
    expect(CONVERSION_PRESETS.length).toBe(117);
    const ids = CONVERSION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(117);
  });

  it("subtitle presets lock convert-subtitles' format and take one extension (#5052)", () => {
    const subtitle = CONVERSION_PRESETS.filter((p) => p.base === "convert-subtitles");
    expect(subtitle.map((p) => [p.id, p.locked, p.sourceInputs])).toEqual([
      ["srt-to-vtt", { format: "vtt" }, [".srt"]],
      ["vtt-to-srt", { format: "srt" }, [".vtt"]],
      ["ass-to-srt", { format: "srt" }, [".ass"]],
      ["srt-to-ass", { format: "ass" }, [".srt"]],
    ]);
    const tool = expandConversionPresets().find((t) => t.id === "srt-to-vtt");
    expect(tool).toMatchObject({
      modality: "video",
      category: "video-subtitles",
      outputModality: "file",
    });
    expect(tool?.keywords).toContain("srt to vtt");
  });

  it("every expanded preset is a valid Tool with route, keywords, modality", () => {
    for (const tool of expandConversionPresets()) {
      expect(tool.route).toBe(`/${tool.id}`);
      expect(tool.keywords?.length).toBeGreaterThan(3);
      expect(tool.modality).toBeTruthy();
      expect(tool.executionHint).toMatch(/fast|long/);
    }
  });

  it("presets are present in the exported TOOLS catalog", () => {
    const toolIds = new Set(TOOLS.map((t) => t.id));
    for (const p of CONVERSION_PRESETS) expect(toolIds.has(p.id)).toBe(true);
  });

  it("preset keywords include the natural phrasing", () => {
    const jpgPng = expandConversionPresets().find((t) => t.id === "jpg-to-png");
    expect(jpgPng?.keywords).toContain("jpg to png");
    expect(jpgPng?.keywords).toContain("jpeg to png");
  });

  // #1099: "opus to mp3" and "mp3 to ogg" found nothing, because the audio
  // presets almost all converged on MP3 or WAV.
  it("covers every audio source and convert-audio target pairing", () => {
    const sources = ["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus", "wma", "aiff"];
    const targets = ["mp3", "wav", "flac", "ogg", "m4a"];
    const audio = new Map(
      CONVERSION_PRESETS.filter((p) => p.base === "convert-audio").map((p) => [p.id, p]),
    );
    const missing: string[] = [];
    for (const from of sources) {
      for (const to of targets) {
        if (from === to) continue;
        const preset = audio.get(`${from}-to-${to}`);
        if (!preset) {
          missing.push(`${from}-to-${to}`);
          continue;
        }
        expect(preset.locked).toEqual({ format: to });
        expect(preset.sourceInputs).toEqual([`.${from}`]);
      }
    }
    expect(missing).toEqual([]);
    expect(audio.size).toBe(sources.length * targets.length - targets.length);
  });

  it("only offers audio sources that convert-audio accepts", () => {
    const convertAudio = TOOLS.find((t) => t.id === "convert-audio");
    for (const p of CONVERSION_PRESETS.filter((p) => p.base === "convert-audio")) {
      for (const ext of p.sourceInputs) expect(convertAudio?.acceptedInputs).toContain(ext);
    }
  });

  it("finds an Opus to MP3 preset by its natural phrasing", () => {
    const opusMp3 = expandConversionPresets().find((t) => t.id === "opus-to-mp3");
    expect(opusMp3?.name).toBe("Opus to MP3");
    expect(opusMp3?.keywords).toContain("opus to mp3");
  });
});
