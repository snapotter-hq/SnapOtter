import type { ToolContent } from "./types.js";

export const smartCrop: ToolContent = {
  toolId: "smart-crop",
  testedWith:
    "SnapOtter 2.3.0 (official Docker image) with the Face Detection bundle installed, measured 2026-11-19. Output quality left at its default.",
  runs: [
    {
      input: "Buzz Aldrin on the Moon, NASA original scan. JPEG, 3912 × 3936",
      settings: "Subject Focus, Attention, 1080 × 1350 (4:5 portrait)",
      output: "JPEG, 1080 × 1350. Aldrin whole, helmet to boots, with his shadow below",
      inputBytes: 4_815_461,
      outputBytes: 524_598,
    },
    {
      input: "Same Aldrin photo",
      settings: "Subject Focus, Attention, 1920 × 1080 (16:9)",
      output: "JPEG, 1920 × 1080. Kept his legs and shadow, cut off his head and torso",
      inputBytes: 4_815_461,
      outputBytes: 732_888,
    },
    {
      input: "Same Aldrin photo",
      settings: "Subject Focus, Entropy, 1920 × 1080 (16:9)",
      output: "JPEG, 1920 × 1080. Kept his body, still cut off the helmet",
      inputBytes: 4_815_461,
      outputBytes: 678_469,
    },
    {
      input: "Neil Armstrong's official portrait. JPEG, 3300 × 4125",
      settings: "Face Focus, Head & Shoulders, 1080 × 1080",
      output: "JPEG, 1080 × 1080. Face centred, shoulders and flag patch in frame",
      inputBytes: 5_406_252,
      outputBytes: 365_647,
    },
    {
      input: "Same Armstrong portrait",
      settings: "Face Focus, Close-up, 800 × 800",
      output: "JPEG, 800 × 800. Face fills the frame, top of the hair trimmed",
      inputBytes: 5_406_252,
      outputBytes: 197_143,
    },
  ],
  steps: [
    "Open Smart Crop in the Image section and drop in your images.",
    "Choose Subject Focus for objects and scenes, Face Focus for people, or Auto Trim to cut away plain borders.",
    "Set the output size, or pick one of the Social Presets.",
    "For Face Focus, pick a framing from Close-up to Half Body. Padding adds room around the subject.",
    "Click Smart Crop (or Face Crop), then download. Batches come back as a ZIP.",
  ],
  limits: [
    "Subject Focus guesses what matters from contrast and detail, not from what the object is. On the Aldrin photo at 16:9, both strategies dropped his helmet. A taller ratio kept him whole.",
    "Face Focus needs the Face Detection feature bundle, which an admin installs from the settings page. With no face found, it falls back to Subject Focus.",
    "Width and height go up to 16,383 px each, and the crop can't pass 67,108,864 pixels (64 MP), padding included.",
    "With no size set, the crop is 1080 × 1080.",
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
