import type { ToolContent } from "./types.js";

export const extractSubtitles: ToolContent = {
  toolId: "extract-subtitles",
  testedWith: "SnapOtter 2.3.0 (official Docker image, FFmpeg backend), measured 2026-11-19.",
  runs: [
    {
      input:
        "Sintel, the full 720p film as released. MKV, 14 min 48 s, ten embedded text subtitle tracks (German listed first)",
      settings: "No settings",
      output: "SRT, the German track: 26 cues, from 00:01:47 to 00:10:29",
      inputBytes: 681_285_280,
      outputBytes: 1_651,
    },
  ],
  steps: [
    "Open Extract Subtitles in the Video section and drop in a video with built-in subtitles, usually an MKV or MP4.",
    "Click Extract Subtitles.",
    "Download the .srt file, ready for any player or editor.",
  ],
  limits: [
    "Only the first subtitle track comes out. Sintel's file lists German first, so that's what we got, not English. To get another language, make it the first track before you upload.",
    "Image-based tracks (Blu-ray PGS, DVD VobSub) can't become SRT without OCR, so the tool says so instead of writing an empty file.",
    "A video with no subtitle track gets a clear error. Burned-in subtitles are part of the picture, not a track, so they can't be extracted.",
    "The whole 681 MB film went through in one upload. The published image has no upload size cap unless the admin sets MAX_UPLOAD_SIZE_MB.",
  ],
  sources: [
    {
      name: "Sintel.2010.720p.mkv (Blender Foundation)",
      url: "https://download.blender.org/durian/movies/",
      license: "CC BY 3.0, Blender Foundation (durian.blender.org)",
    },
  ],
};
