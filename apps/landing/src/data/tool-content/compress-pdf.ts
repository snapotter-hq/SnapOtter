import type { ToolContent } from "./types.js";

export const compressPdf: ToolContent = {
  toolId: "compress-pdf",
  testedWith: "SnapOtter 2.3.0 (official Docker image, Ghostscript backend), measured 2026-11-19.",
  runs: [
    {
      input: "NASA STS-135 press kit. 172 pages, photo-heavy",
      settings: "Quality 75 (the app's starting value)",
      output: "PDF, all 172 pages, images capped at 300 dpi",
      inputBytes: 11_629_697,
      outputBytes: 10_264_605,
    },
    {
      input: "Same press kit",
      settings: "Quality 30",
      output: "PDF, all 172 pages, images capped at 240 dpi",
      inputBytes: 11_629_697,
      outputBytes: 6_818_329,
    },
    {
      input: "Same press kit",
      settings: "Target size 2,000 KB",
      output:
        "PDF, all 172 pages. Target missed: 5.9 MB was the smallest legible result, and the app says so",
      inputBytes: 11_629_697,
      outputBytes: 5_909_857,
    },
  ],
  steps: [
    "Open Compress PDF in the PDF section and drop in one or more PDFs.",
    "Choose Target size and type the size you need, or switch to Quality and move the slider.",
    "Click Compress, then download. Several files come back as a ZIP.",
  ],
  limits: [
    "Compression works on the images inside the PDF. A text-only PDF has little to give, and target sizes are a best effort.",
    "The tool never downsamples images below 150 dpi, so text in scanned pages stays readable. When a target needs less than that, you get the smallest legible file and a note that the target was missed.",
    "Above quality 50 the images keep full resolution and only the JPEG quality changes. Below 50 they are also downsampled.",
    "The result is never larger than the original. If compression can't help, you get your file back unchanged.",
  ],
  sources: [
    {
      name: "NASA STS-135 press kit.pdf (Wikimedia Commons)",
      url: "https://commons.wikimedia.org/wiki/File:NASA_STS-135_press_kit.pdf",
      license: "Public domain (NASA)",
    },
  ],
  alternatives: {
    text: "iLovePDF's free plan compresses at most 2 files per task, up to 200 MB. The published SnapOtter image ships with no upload size or batch count cap, and the admin can set one.",
    sourceName: "iLovePDF pricing",
    sourceUrl: "https://www.ilovepdf.com/pricing",
    checked: "2026-11-19",
  },
};
