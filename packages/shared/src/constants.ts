import type { CategoryInfo, SocialMediaPreset, Tool } from "./types.js";

export const CATEGORIES: CategoryInfo[] = [
  { id: "essentials", name: "Essentials", icon: "Layers", color: "#3B82F6" },
  { id: "optimization", name: "Optimization", icon: "Zap", color: "#10B981" },
  { id: "adjustments", name: "Adjustments", icon: "SlidersHorizontal", color: "#8B5CF6" },
  { id: "ai", name: "AI Tools", icon: "Sparkles", color: "#F59E0B" },
  { id: "watermark", name: "Watermark & Overlay", icon: "Stamp", color: "#EF4444" },
  { id: "utilities", name: "Utilities", icon: "Wrench", color: "#6366F1" },
  { id: "layout", name: "Layout & Composition", icon: "LayoutGrid", color: "#EC4899" },
  { id: "format", name: "Format & Conversion", icon: "FileType", color: "#14B8A6" },
  { id: "automation", name: "Automation", icon: "Workflow", color: "#F97316" },
];

export const TOOLS: Tool[] = [
  // Essentials
  { id: "resize", name: "Resize", description: "Resize by pixels, percentage, or social media presets", category: "essentials", icon: "Maximize2", route: "/resize" },
  { id: "crop", name: "Crop", description: "Freeform crop, aspect ratio presets, shape crop", category: "essentials", icon: "Crop", route: "/crop" },
  { id: "rotate", name: "Rotate & Flip", description: "Rotate, flip, and straighten images", category: "essentials", icon: "RotateCw", route: "/rotate" },
  { id: "convert", name: "Convert", description: "Convert between image formats", category: "essentials", icon: "FileOutput", route: "/convert" },
  { id: "compress", name: "Compress", description: "Reduce file size by quality or target size", category: "essentials", icon: "Minimize2", route: "/compress" },
  // Optimization
  { id: "strip-metadata", name: "Strip Metadata", description: "Remove EXIF, GPS, and camera info", category: "optimization", icon: "ShieldOff", route: "/strip-metadata" },
  { id: "bulk-rename", name: "Bulk Rename", description: "Rename multiple files with patterns", category: "optimization", icon: "FileEdit", route: "/bulk-rename" },
  { id: "image-to-pdf", name: "Image to PDF", description: "Combine images into a PDF document", category: "optimization", icon: "FileText", route: "/image-to-pdf" },
  { id: "favicon", name: "Favicon Generator", description: "Generate all favicon and app icon sizes", category: "optimization", icon: "Globe", route: "/favicon" },
  // Adjustments
  { id: "brightness-contrast", name: "Brightness & Contrast", description: "Adjust brightness and contrast levels", category: "adjustments", icon: "Sun", route: "/brightness-contrast" },
  { id: "saturation", name: "Saturation & Exposure", description: "Adjust color saturation and exposure", category: "adjustments", icon: "Palette", route: "/saturation" },
  { id: "color-channels", name: "Color Channels", description: "Adjust individual R, G, B channels", category: "adjustments", icon: "CircleDot", route: "/color-channels" },
  { id: "color-effects", name: "Color Effects", description: "Grayscale, Sepia, Invert, Tint", category: "adjustments", icon: "Paintbrush", route: "/color-effects" },
  { id: "replace-color", name: "Replace & Invert Color", description: "Replace specific colors or invert", category: "adjustments", icon: "Pipette", route: "/replace-color" },
  // AI Tools
  { id: "remove-background", name: "Remove Background", description: "AI-powered background removal", category: "ai", icon: "Eraser", route: "/remove-background" },
  { id: "upscale", name: "Image Upscaling", description: "AI super-resolution enhancement", category: "ai", icon: "ZoomIn", route: "/upscale" },
  { id: "erase-object", name: "Object Eraser", description: "Paint over unwanted elements", category: "ai", icon: "Wand2", route: "/erase-object" },
  { id: "ocr", name: "OCR / Text Extraction", description: "Extract text from images", category: "ai", icon: "ScanText", route: "/ocr" },
  { id: "blur-faces", name: "Face / PII Blur", description: "Auto-detect and blur faces and sensitive info", category: "ai", icon: "EyeOff", route: "/blur-faces" },
  { id: "smart-crop", name: "Smart Crop", description: "AI detects subject and crops optimally", category: "ai", icon: "Focus", route: "/smart-crop" },
  // Watermark & Overlay
  { id: "watermark-text", name: "Text Watermark", description: "Add text watermark overlay", category: "watermark", icon: "Type", route: "/watermark-text" },
  { id: "watermark-image", name: "Image Watermark", description: "Overlay a logo as watermark", category: "watermark", icon: "Image", route: "/watermark-image" },
  { id: "text-overlay", name: "Text Overlay", description: "Add styled text to images", category: "watermark", icon: "TextCursorInput", route: "/text-overlay" },
  { id: "compose", name: "Image Composition", description: "Layer images with position and opacity", category: "watermark", icon: "Layers", route: "/compose" },
  // Utilities
  { id: "info", name: "Image Info", description: "View all metadata and image properties", category: "utilities", icon: "Info", route: "/info" },
  { id: "compare", name: "Image Compare", description: "Side-by-side comparison of two images", category: "utilities", icon: "Columns2", route: "/compare" },
  { id: "find-duplicates", name: "Find Duplicates", description: "Detect duplicate and near-duplicate images", category: "utilities", icon: "Copy", route: "/find-duplicates" },
  { id: "color-palette", name: "Color Palette", description: "Extract dominant colors from image", category: "utilities", icon: "Palette", route: "/color-palette" },
  { id: "qr-generate", name: "QR Code Generator", description: "Generate QR codes from text or URLs", category: "utilities", icon: "QrCode", route: "/qr-generate" },
  { id: "barcode-read", name: "Barcode Reader", description: "Read QR codes and barcodes from images", category: "utilities", icon: "ScanLine", route: "/barcode-read" },
  // Layout & Composition
  { id: "collage", name: "Collage / Grid", description: "Combine images into a grid layout", category: "layout", icon: "LayoutGrid", route: "/collage" },
  { id: "split", name: "Image Splitting", description: "Split image into grid parts", category: "layout", icon: "Grid3x3", route: "/split" },
  { id: "border", name: "Border & Frame", description: "Add borders, rounded corners, shadows", category: "layout", icon: "Frame", route: "/border" },
  // Format & Conversion
  { id: "svg-to-raster", name: "SVG to Raster", description: "Convert SVG to PNG/JPG at custom resolution", category: "format", icon: "FileImage", route: "/svg-to-raster" },
  { id: "vectorize", name: "Image to SVG", description: "Vectorize images using tracing", category: "format", icon: "PenTool", route: "/vectorize" },
  { id: "gif-tools", name: "GIF Tools", description: "Resize/crop/convert animated GIFs", category: "format", icon: "Film", route: "/gif-tools" },
  // Automation
  { id: "pipeline", name: "Pipeline Builder", description: "Chain multiple tools into a workflow", category: "automation", icon: "Workflow", route: "/pipeline" },
  { id: "batch", name: "Batch Processing", description: "Apply any tool to multiple images", category: "automation", icon: "FolderInput", route: "/batch" },
];

export const SOCIAL_MEDIA_PRESETS: SocialMediaPreset[] = [
  { platform: "Instagram", name: "Post (Square)", width: 1080, height: 1080 },
  { platform: "Instagram", name: "Story / Reel", width: 1080, height: 1920 },
  { platform: "Instagram", name: "Profile Picture", width: 320, height: 320 },
  { platform: "Instagram", name: "Landscape Post", width: 1080, height: 566 },
  { platform: "Instagram", name: "Portrait Post", width: 1080, height: 1350 },
  { platform: "Twitter/X", name: "Post Image", width: 1200, height: 675 },
  { platform: "Twitter/X", name: "Header", width: 1500, height: 500 },
  { platform: "Twitter/X", name: "Profile Picture", width: 400, height: 400 },
  { platform: "Facebook", name: "Post Image", width: 1200, height: 630 },
  { platform: "Facebook", name: "Cover Photo", width: 820, height: 312 },
  { platform: "Facebook", name: "Profile Picture", width: 170, height: 170 },
  { platform: "Facebook", name: "Event Cover", width: 1920, height: 1005 },
  { platform: "YouTube", name: "Thumbnail", width: 1280, height: 720 },
  { platform: "YouTube", name: "Channel Banner", width: 2560, height: 1440 },
  { platform: "YouTube", name: "Profile Picture", width: 800, height: 800 },
  { platform: "LinkedIn", name: "Post Image", width: 1200, height: 627 },
  { platform: "LinkedIn", name: "Banner", width: 1584, height: 396 },
  { platform: "LinkedIn", name: "Profile Picture", width: 400, height: 400 },
  { platform: "TikTok", name: "Video Cover", width: 1080, height: 1920 },
  { platform: "TikTok", name: "Profile Picture", width: 200, height: 200 },
  { platform: "WhatsApp", name: "Profile Picture", width: 500, height: 500 },
  { platform: "Pinterest", name: "Pin", width: 1000, height: 1500 },
  { platform: "Threads", name: "Post Image", width: 1080, height: 1080 },
];

export const SUPPORTED_INPUT_FORMATS = [
  "jpg", "jpeg", "png", "webp", "avif", "tiff", "tif",
  "bmp", "gif", "svg", "heic", "heif", "jxl", "ico",
  "cr2", "nef", "arw", "dng", "orf", "rw2",
] as const;

export const SUPPORTED_OUTPUT_FORMATS = [
  "jpg", "png", "webp", "avif", "tiff", "gif", "jxl", "svg", "ico", "pdf",
] as const;

export const DEFAULT_OUTPUT_FORMAT = "jpg" as const;

export const APP_VERSION = "0.1.0";
