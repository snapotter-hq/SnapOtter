import type { ToolContent } from "./types.js";

export const reverseVideo: ToolContent = {
  toolId: "reverse-video",
  testedWith: "SnapOtter 2.3.0 (official Docker image, FFmpeg backend), measured 2026-11-19.",
  runs: [
    {
      input: "Sintel trailer. MP4, H.264 1920 × 1080 at 24 fps with AAC stereo, 52.2 s",
      settings: "No settings",
      output:
        "MP4, H.264 1920 × 1080 at 24 fps, same 52.2 s length. Picture and sound both reversed, kept in sync",
      inputBytes: 14_621_544,
      outputBytes: 18_435_512,
    },
  ],
  steps: [
    "Open Reverse Video in the Video section and drop in a clip.",
    "Click Reverse. Long clips run in the background and show progress.",
    "Download the result. It keeps the input's container, so an MP4 comes back as an MP4.",
  ],
  limits: [
    "Clips longer than 5 minutes are rejected. Reversing means holding every decoded frame, so the cap keeps memory in check.",
    "The video is re-encoded, not copied. Here that made the file 26% larger than the original, because the encoder used a higher bitrate than the source had.",
    "The audio is reversed too. A clip with no audio track comes back silent, as it went in.",
    "Resolution and frame rate are kept as they were.",
  ],
  sources: [
    {
      name: "Sintel trailer, 1080p (Blender Foundation)",
      url: "https://download.blender.org/durian/trailer/",
      license: "CC BY 3.0, Blender Foundation (durian.blender.org)",
    },
  ],
  alternatives: {
    text: "Kapwing's free plan exports with a watermark, at 720p, for videos up to 4 minutes. The clip above came back at 1080p with no watermark.",
    sourceName: "Kapwing pricing",
    sourceUrl: "https://www.kapwing.com/pricing",
    checked: "2026-11-19",
  },
};
