// SEO comparison pages: "open-source alternative to <X>" content.
// Each entry renders a static page at /alternatives/<slug> plus a card on the hub.
// Keep competitor claims general and defensible; the differentiator is self-hosting
// plus breadth across all five modalities, not point-by-point feature parity.

export interface ComparisonRow {
  feature: string;
  snapotter: string;
  competitor: string;
  /** true when SnapOtter has the advantage on this row (drives the check styling) */
  snapotterWins: boolean;
}

export interface AltFaq {
  q: string;
  a: string;
}

export interface Alternative {
  slug: string;
  /** Competitor brand name, e.g. "Smallpdf" */
  competitor: string;
  /** Short category label for cards, e.g. "PDF tools" */
  category: string;
  /** SEO <title>, written as the phrase people search */
  pageTitle: string;
  /** On-page H1 */
  h1: string;
  /** Meta description */
  metaDescription: string;
  /** One or two sentence lede under the H1 */
  intro: string;
  /** What SnapOtter brings beyond this competitor's single lane */
  breadth: string;
  /** true when the competitor is itself open-source / self-hostable (shifts framing to breadth) */
  competitorOpenSource: boolean;
  rows: ComparisonRow[];
  faqs: AltFaq[];
}

const cloudRows = (category: string, pricing: string, beyond: string): ComparisonRow[] => [
  {
    feature: "Where your files go",
    snapotter: "Your own server",
    competitor: "Their cloud",
    snapotterWins: true,
  },
  {
    feature: "Pricing",
    snapotter: "Free, open source (AGPLv3)",
    competitor: pricing,
    snapotterWins: true,
  },
  {
    feature: "File-size limits",
    snapotter: "Bounded by your hardware",
    competitor: "Capped by plan",
    snapotterWins: true,
  },
  {
    feature: "Works offline / air-gapped",
    snapotter: "Yes",
    competitor: "No, needs their servers",
    snapotterWins: true,
  },
  {
    feature: `Beyond ${category}`,
    snapotter: "Image, video, audio, PDF, and files",
    competitor: beyond,
    snapotterWins: true,
  },
  {
    feature: "Open source",
    snapotter: "Yes, AGPLv3",
    competitor: "No",
    snapotterWins: true,
  },
  {
    feature: "REST API and pipelines",
    snapotter: "Built in, self-hosted",
    competitor: "API on paid plans",
    snapotterWins: true,
  },
];

export const ALTERNATIVES: Alternative[] = [
  {
    slug: "smallpdf",
    competitor: "Smallpdf",
    category: "PDF tools",
    pageTitle: "The Open-Source, Self-Hosted Alternative to Smallpdf",
    h1: "The open-source, self-hosted alternative to Smallpdf",
    metaDescription:
      "Smallpdf uploads your documents to its servers. SnapOtter runs the same PDF tools on yours. 40 PDF tools plus 200 more for image, video, audio, and files. Open source, AGPLv3.",
    intro:
      "Smallpdf is a cloud PDF suite, so every file you touch goes up to its servers. SnapOtter runs the same kinds of tools on hardware you own, and the file never leaves it.",
    breadth:
      "Smallpdf does PDFs. SnapOtter ships 40 PDF tools (merge, split, compress, convert, redact, OCR, and more) and another 200 across image, video, audio, and files, so one stack covers what you'd otherwise spread across several accounts.",
    competitorOpenSource: false,
    rows: cloudRows("PDFs", "Subscription, free tier with daily limits", "PDF only"),
    faqs: [
      {
        q: "Is there a free, self-hosted alternative to Smallpdf?",
        a: "Yes. SnapOtter is open source under AGPLv3 and runs on your own server with Docker. It covers merge, split, compress, convert, protect, redact, watermark, page numbers, and OCR, with no per-file fees.",
      },
      {
        q: "Do my documents get uploaded anywhere?",
        a: "No. SnapOtter processes files on the machine you run it on. Nothing is sent to a third-party PDF service, which is the whole point of self-hosting it.",
      },
      {
        q: "Does it do more than PDFs?",
        a: "Yes. Beyond its 40 PDF tools, SnapOtter handles image, video, audio, and file tasks too, 240 tools in one stack.",
      },
    ],
  },
  {
    slug: "ilovepdf",
    competitor: "iLovePDF",
    category: "PDF tools",
    pageTitle: "The Open-Source, Self-Hosted Alternative to iLovePDF",
    h1: "The open-source, self-hosted alternative to iLovePDF",
    metaDescription:
      "iLovePDF processes your files in the cloud. SnapOtter runs PDF merge, split, compress, convert, and OCR on your own server. 240 tools across five file types. Open source, AGPLv3.",
    intro:
      "iLovePDF is a hosted PDF service, which means your documents are uploaded to process them. SnapOtter gives you the same toolset to run yourself, with the file staying on your server.",
    breadth:
      "iLovePDF stays inside PDFs. SnapOtter pairs 40 PDF tools with image, video, audio, and file tools, so the same deployment handles a contract, a screen recording, and a podcast edit.",
    competitorOpenSource: false,
    rows: cloudRows("PDFs", "Subscription, free tier with limits", "PDF only"),
    faqs: [
      {
        q: "What's a self-hosted alternative to iLovePDF?",
        a: "SnapOtter. It's open source (AGPLv3), deploys with Docker, and gives you merge, split, compress, convert, protect, OCR, and the rest on your own hardware.",
      },
      {
        q: "Is SnapOtter free?",
        a: "The full open-source edition is free forever. A paid enterprise tier adds SSO, audit logging, and similar controls, but every file tool is in the free edition.",
      },
    ],
  },
  {
    slug: "tinypng",
    competitor: "TinyPNG",
    category: "Image compression",
    pageTitle: "The Open-Source, Self-Hosted Alternative to TinyPNG",
    h1: "The open-source, self-hosted alternative to TinyPNG",
    metaDescription:
      "TinyPNG compresses images in the cloud with a monthly quota. SnapOtter compresses PNG, JPEG, WebP, and AVIF on your own server, with no quota and no upload. Open source, AGPLv3.",
    intro:
      "TinyPNG is a cloud image compressor with a monthly free quota and an upload step. SnapOtter compresses images on your own hardware, with no quota and nothing leaving your network.",
    breadth:
      "TinyPNG compresses images. SnapOtter compresses across PNG, JPEG, WebP, and AVIF, and then keeps going: resize, crop, convert between 14 output formats, watermark, plus 60+ other image tools and full video, audio, PDF, and file support.",
    competitorOpenSource: false,
    rows: cloudRows("image compression", "Monthly free quota, then paid", "Image compression only"),
    faqs: [
      {
        q: "Is there a self-hosted TinyPNG alternative with no quota?",
        a: "Yes. SnapOtter runs image compression locally, so the only limit is your hardware. There's no per-month cap and no API key to a third party.",
      },
      {
        q: "Which formats can it compress?",
        a: "PNG, JPEG, WebP, and AVIF, with conversion between formats. SnapOtter reads 55+ input formats including 23 camera RAW formats.",
      },
    ],
  },
  {
    slug: "cloudconvert",
    competitor: "CloudConvert",
    category: "File conversion",
    pageTitle: "The Open-Source, Self-Hosted Alternative to CloudConvert",
    h1: "The open-source, self-hosted alternative to CloudConvert",
    metaDescription:
      "CloudConvert converts files in the cloud, billed per conversion. SnapOtter converts image, video, audio, PDF, and data formats on your own server. Open source, AGPLv3, no upload.",
    intro:
      "CloudConvert is a hosted converter, so files are uploaded and conversions are metered. SnapOtter converts across every modality on hardware you own, with no metering and no upload.",
    breadth:
      "CloudConvert converts. SnapOtter converts too, across image, video, audio, PDF, and data formats, and then adds compression, editing, OCR, transcription, and pipelines, so conversion is one of 240 things it does.",
    competitorOpenSource: false,
    rows: cloudRows("file conversion", "Pay per conversion / minutes", "Conversion only"),
    faqs: [
      {
        q: "Can I self-host a CloudConvert alternative?",
        a: "Yes. SnapOtter is open source and runs on Docker. It converts image, video, audio, PDF, and data formats locally, with no per-conversion billing.",
      },
      {
        q: "Does it convert video and audio too?",
        a: "Yes. SnapOtter uses FFmpeg under the hood for video and audio, alongside Sharp for images and qpdf and LibreOffice for documents.",
      },
    ],
  },
  {
    slug: "otter-ai",
    competitor: "Otter.ai",
    category: "Transcription",
    pageTitle: "The Open-Source, Self-Hosted Alternative to Otter.ai",
    h1: "The open-source, self-hosted alternative to Otter.ai",
    metaDescription:
      "Otter.ai transcribes audio in the cloud. SnapOtter transcribes on your own GPU or CPU with local Whisper models. No upload, no per-minute fees. Open source, AGPLv3.",
    intro:
      "Otter.ai uploads your recordings to transcribe them in the cloud. SnapOtter runs speech-to-text on your own hardware with local models, so sensitive recordings never leave your network.",
    breadth:
      "Otter.ai transcribes. SnapOtter transcribes locally and also handles the rest of an audio workflow (trim, normalize, noise reduction, format conversion) plus video subtitles, image, PDF, and file tools.",
    competitorOpenSource: false,
    rows: [
      {
        feature: "Where your audio goes",
        snapotter: "Your own server / GPU",
        competitor: "Their cloud",
        snapotterWins: true,
      },
      {
        feature: "Pricing",
        snapotter: "Free, open source (AGPLv3)",
        competitor: "Subscription, per-minute limits",
        snapotterWins: true,
      },
      {
        feature: "Transcription engine",
        snapotter: "Local Whisper models, on your hardware",
        competitor: "Cloud service",
        snapotterWins: true,
      },
      {
        feature: "Works offline / air-gapped",
        snapotter: "Yes",
        competitor: "No",
        snapotterWins: true,
      },
      {
        feature: "Beyond transcription",
        snapotter: "Audio editing, video, image, PDF, files",
        competitor: "Notes and transcription",
        snapotterWins: true,
      },
      {
        feature: "Open source",
        snapotter: "Yes, AGPLv3",
        competitor: "No",
        snapotterWins: true,
      },
    ],
    faqs: [
      {
        q: "Is there a self-hosted Otter.ai alternative?",
        a: "Yes. SnapOtter runs transcription locally with Whisper models on your own GPU or CPU. No audio is uploaded to a third party.",
      },
      {
        q: "Do I need a GPU?",
        a: "A GPU is faster, but transcription also runs on CPU. The models install on demand the first time you use the feature.",
      },
    ],
  },
  {
    slug: "stirling-pdf",
    competitor: "Stirling-PDF",
    category: "Self-hosted PDF",
    pageTitle: "SnapOtter vs Stirling-PDF: Self-Hosted File Tools Compared",
    h1: "SnapOtter vs Stirling-PDF",
    metaDescription:
      "Stirling-PDF is a great self-hosted PDF toolkit. SnapOtter covers PDFs too, plus image, video, audio, and file tools in one stack. Both open source. Here's how they compare.",
    intro:
      "Stirling-PDF and SnapOtter are both self-hosted and open source, so files stay on your server either way. The difference is scope: Stirling-PDF focuses on PDFs, SnapOtter spans all five file types.",
    breadth:
      "If you only ever touch PDFs, Stirling-PDF is excellent and worth a look. If you also resize images, convert video, transcribe audio, or batch files, SnapOtter handles all of it in one deployment instead of running several tools side by side.",
    competitorOpenSource: true,
    rows: [
      {
        feature: "Self-hosted",
        snapotter: "Yes",
        competitor: "Yes",
        snapotterWins: false,
      },
      {
        feature: "Open source",
        snapotter: "Yes, AGPLv3",
        competitor: "Yes",
        snapotterWins: false,
      },
      {
        feature: "Modalities covered",
        snapotter: "Image, video, audio, PDF, files",
        competitor: "PDF only",
        snapotterWins: true,
      },
      {
        feature: "Tool count",
        snapotter: "240",
        competitor: "50+ PDF tools",
        snapotterWins: true,
      },
      {
        feature: "Local AI (OCR, transcription, upscaling)",
        snapotter: "Yes, on-demand bundles",
        competitor: "OCR",
        snapotterWins: true,
      },
      {
        feature: "Layer-based image editor",
        snapotter: "Yes",
        competitor: "No",
        snapotterWins: true,
      },
      {
        feature: "Pipelines and batch processing",
        snapotter: "Yes",
        competitor: "Pipelines",
        snapotterWins: false,
      },
    ],
    faqs: [
      {
        q: "Is SnapOtter a replacement for Stirling-PDF?",
        a: "It can be, if you want one stack for more than PDFs. SnapOtter's PDF coverage is broad, and it adds image, video, audio, and file tools. For a PDF-only setup, Stirling-PDF is a solid, focused choice.",
      },
      {
        q: "Are both free and open source?",
        a: "Yes. Both are open source and self-hostable. SnapOtter is AGPLv3 and adds an optional paid enterprise tier for SSO and audit features.",
      },
    ],
  },
  {
    slug: "convertx",
    competitor: "ConvertX",
    category: "Self-hosted conversion",
    pageTitle: "SnapOtter vs ConvertX: Self-Hosted File Tools Compared",
    h1: "SnapOtter vs ConvertX",
    metaDescription:
      "ConvertX is a self-hosted file converter for 1000+ formats. SnapOtter converts too, and adds editing, compression, OCR, and transcription across five modalities. Both open source.",
    intro:
      "ConvertX and SnapOtter are both self-hosted and open source. ConvertX is built around format conversion; SnapOtter does conversion plus the rest of a file workflow.",
    breadth:
      "ConvertX is a focused converter and handles a huge list of formats. SnapOtter converts as well, then adds compression, editing, redaction, OCR, transcription, and pipelines, so it's a fit when conversion is one step among many.",
    competitorOpenSource: true,
    rows: [
      {
        feature: "Self-hosted",
        snapotter: "Yes",
        competitor: "Yes",
        snapotterWins: false,
      },
      {
        feature: "Open source",
        snapotter: "Yes, AGPLv3",
        competitor: "Yes",
        snapotterWins: false,
      },
      {
        feature: "Primary focus",
        snapotter: "Full file workflow across five types",
        competitor: "Format conversion",
        snapotterWins: true,
      },
      {
        feature: "Beyond conversion",
        snapotter: "Compress, edit, redact, OCR, transcribe",
        competitor: "Conversion",
        snapotterWins: true,
      },
      {
        feature: "Tool count",
        snapotter: "240",
        competitor: "Conversion-focused",
        snapotterWins: true,
      },
      {
        feature: "Local AI tools",
        snapotter: "OCR, transcription, upscaling, more",
        competitor: "No",
        snapotterWins: true,
      },
      {
        feature: "Layer-based image editor",
        snapotter: "Yes",
        competitor: "No",
        snapotterWins: true,
      },
    ],
    faqs: [
      {
        q: "Should I use SnapOtter or ConvertX?",
        a: "If you mainly need format conversion across many formats, ConvertX is a clean, focused option. If you also edit, compress, redact, OCR, or transcribe, SnapOtter does all of that in one stack.",
      },
      {
        q: "Do both keep files on my server?",
        a: "Yes. Both are self-hosted, so files stay on your infrastructure. The difference is breadth, not where your data lives.",
      },
    ],
  },
];
