import type { ToolContent } from "./types.js";

export const ringtoneMaker: ToolContent = {
  toolId: "ringtone-maker",
  testedWith: "SnapOtter 2.3.0 (official Docker image, FFmpeg backend), measured 2026-11-19.",
  runs: [
    {
      input: "Sintel soundtrack, music and effects mix. FLAC, 48 kHz stereo, 14 min 48 s",
      settings: "Start time 120 s, duration 30 s",
      output: "M4R (AAC in an iPhone ringtone container), 192 kb/s stereo, exactly 30.0 s",
      inputBytes: 74_266_467,
      outputBytes: 761_382,
    },
  ],
  steps: [
    "Open Ringtone Maker in the Audio section and drop in a song: MP3, WAV, FLAC, AAC, M4A, OGG, Opus, WMA, AIFF, AMR or AC3.",
    "Set Start time to the second where the part you want begins.",
    "Set Duration, up to 30 seconds.",
    "Click Create Ringtone and download the .m4r file.",
  ],
  limits: [
    "A ringtone is 1 to 30 seconds long.",
    "The output is always M4R at 192 kb/s AAC, the format iPhone ringtones use. For a clip in another format, use Trim Audio.",
    "There's no fade in or fade out. Pick a start time where the music already sounds right, or run the result through Fade Audio.",
    "A start time past the end of the track is rejected rather than giving you silence.",
  ],
  sources: [
    {
      name: "Sintel music and effects soundtrack (Blender Foundation)",
      url: "https://download.blender.org/durian/movies/",
      license: "CC BY 3.0, Blender Foundation (durian.blender.org)",
    },
  ],
};
