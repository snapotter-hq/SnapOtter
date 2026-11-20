import type { ToolContent } from "./types.js";

export const resize: ToolContent = {
  toolId: "resize",
  testedWith:
    "SnapOtter 2.3.0 (official Docker image), default output settings, measured 2026-11-19.",
  runs: [
    {
      input: "Buzz Aldrin on the Moon, NASA original scan. JPEG, 3912 × 3936",
      settings: "Custom Size, width 1200 px, height auto",
      output: "JPEG, 1200 × 1207, aspect ratio kept",
      inputBytes: 4_815_461,
      outputBytes: 520_411,
    },
    {
      input: "Neil Armstrong's official portrait. JPEG, 3300 × 4125",
      settings: "Scale, 25%",
      output: "JPEG, 825 × 1031",
      inputBytes: 5_406_252,
      outputBytes: 256_583,
    },
  ],
  steps: [
    "Open Resize Image in the Image section and drop in one image or a whole folder.",
    "Pick Custom Size and type a width or a height. Leave the other on auto to keep the aspect ratio.",
    "Or switch to Scale and enter a percentage, or to Presets for common social and web sizes.",
    "Click Resize, then download the file. A batch comes back as a ZIP.",
  ],
  limits: [
    "Width and height go up to 16,383 px each, and the output can't pass 67,108,864 pixels (64 MP).",
    "Scale accepts 1% to 1000%. Turn on Limit to original size if you never want an image scaled up.",
    "Fit Mode decides what happens when you set both sides: crop to fit, fit inside, or stretch.",
    "The output keeps the input's format and re-encodes lossy formats at quality 95. Inputs with no encoder, such as SVG, PSD or camera RAW, come back as PNG.",
  ],
  sources: [
    {
      name: "Aldrin Apollo 11 original.jpg (Wikimedia Commons)",
      url: "https://commons.wikimedia.org/wiki/File:Aldrin_Apollo_11_original.jpg",
      license: "Public domain (NASA)",
    },
    {
      name: "Neil Armstrong pose.jpg (Wikimedia Commons)",
      url: "https://commons.wikimedia.org/wiki/File:Neil_Armstrong_pose.jpg",
      license: "Public domain (NASA)",
    },
  ],
};
