import type { ToolContent } from "./types.js";

export const ocrPdf: ToolContent = {
  toolId: "ocr-pdf",
  testedWith:
    "SnapOtter 2.3.0 (official Docker image), Fast quality (built-in Tesseract, CPU, no OCR bundle installed), language Auto, measured 2026-11-19.",
  runs: [
    {
      input:
        "Venture Into Space (NASA SP-4301, 1968), a 370-page scanned book. Pages 20 to 29 selected",
      settings: "Quality Fast, language Auto, pages 20-29",
      output:
        "Plain text, 10 pages, about 3,600 words, each page headed by a page marker. Body text came out mostly clean; headings and drop caps had errors",
      inputBytes: 27_125_361,
      outputBytes: 21_105,
    },
  ],
  steps: [
    "Open PDF OCR in the PDF section and drop in a scanned PDF.",
    "Pick a quality. Fast works out of the box; Balanced and Best use the OCR feature bundle.",
    "Choose the language, or leave it on Auto, and list the pages you want, such as 1-3, 5.",
    "Click Extract Text, then download the .txt file.",
  ],
  limits: [
    "Up to 50 pages per run. For a longer book, run it in page ranges.",
    "The result is text, not a searchable copy of the PDF.",
    'Expect mistakes on decorative type. Here a stamp reading "BLANK" came out as "BEANK", and a drop cap turned "THE" into "TE". Body text was mostly right, with the odd slip such as "I" read as "|".',
    "Fast reads English, German, French, Spanish, Simplified Chinese and Japanese. Korean and Arabic need Balanced or Best. Password-protected PDFs are refused, so unlock them first.",
  ],
  sources: [
    {
      name: "Venture Into Space (NASA SP-4301) (Wikimedia Commons)",
      url: "https://commons.wikimedia.org/wiki/File:Venture_Into_Space-_Early_Years_of_Goddard_Space_Flight_Center_(NASA_SP-4301).pdf",
      license: "Public domain (NASA)",
    },
  ],
  alternatives: {
    text: "iLovePDF's free plan runs OCR on one file per task, up to 15 MB. The 27 MB scan above would not fit.",
    sourceName: "iLovePDF pricing",
    sourceUrl: "https://www.ilovepdf.com/pricing",
    checked: "2026-11-19",
  },
};
