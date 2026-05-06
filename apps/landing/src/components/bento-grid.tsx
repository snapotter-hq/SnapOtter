"use client";

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  AudioLines,
  Code,
  Columns,
  Columns2,
  Copy,
  Crop,
  Droplets,
  Eraser,
  Eye,
  EyeOff,
  FileEdit,
  FileImage,
  FileOutput,
  FileText,
  Film,
  Focus,
  Frame,
  Globe,
  Grid3x3,
  ImagePlus,
  Info,
  Layers,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Palette,
  PenLine,
  PenTool,
  Pipette,
  QrCode,
  RotateCw,
  Scaling,
  Scan,
  ScanFace,
  ScanLine,
  ScanText,
  Search,
  ShieldOff,
  SlidersHorizontal,
  Sparkles,
  TextCursorInput,
  Type,
  Undo2,
  UserCheck,
  Wand2,
  ZoomIn,
} from "lucide-react";
import { useMemo, useState } from "react";
import { FadeIn } from "./fade-in";

const categories = [
  { id: "essentials", name: "Essentials", color: "#3B82F6" },
  { id: "optimization", name: "Optimization", color: "#10B981" },
  { id: "adjustments", name: "Adjustments", color: "#8B5CF6" },
  { id: "watermark", name: "Watermark & Overlay", color: "#EF4444" },
  { id: "utilities", name: "Utilities", color: "#6366F1" },
  { id: "layout", name: "Layout & Composition", color: "#EC4899" },
  { id: "format", name: "Format & Conversion", color: "#14B8A6" },
  { id: "ai", name: "AI Tools", color: "#F59E0B" },
];

const tools: { name: string; description: string; category: string; icon: LucideIcon }[] = [
  // Essentials
  {
    name: "Resize",
    description: "Resize by pixels, percentage, or social media presets",
    category: "essentials",
    icon: Maximize2,
  },
  {
    name: "Crop",
    description: "Freeform crop, aspect ratio presets, shape crop",
    category: "essentials",
    icon: Crop,
  },
  {
    name: "Rotate & Flip",
    description: "Rotate, flip, and straighten images",
    category: "essentials",
    icon: RotateCw,
  },
  {
    name: "Convert",
    description: "Convert between image formats",
    category: "essentials",
    icon: FileOutput,
  },
  {
    name: "Compress",
    description: "Reduce file size by quality or target size",
    category: "essentials",
    icon: Minimize2,
  },
  // Optimization
  {
    name: "Optimize for Web",
    description:
      "Optimize images for web with format conversion, quality control, and live preview",
    category: "optimization",
    icon: Globe,
  },
  {
    name: "Remove Metadata",
    description: "Remove EXIF, GPS, and camera info",
    category: "optimization",
    icon: ShieldOff,
  },
  {
    name: "Edit Metadata",
    description: "Edit EXIF, GPS, and camera info",
    category: "optimization",
    icon: PenLine,
  },
  {
    name: "Bulk Rename",
    description: "Rename multiple files with patterns",
    category: "optimization",
    icon: FileEdit,
  },
  {
    name: "Image to PDF",
    description: "Combine images into a PDF document",
    category: "optimization",
    icon: FileText,
  },
  {
    name: "Favicon Generator",
    description: "Generate all favicon and app icon sizes",
    category: "optimization",
    icon: AppWindow,
  },
  // Adjustments
  {
    name: "Adjust Colors",
    description: "Brightness, contrast, exposure, saturation, temperature, sharpness, and effects",
    category: "adjustments",
    icon: SlidersHorizontal,
  },
  {
    name: "Sharpening",
    description: "Adaptive, unsharp mask, and high-pass sharpening with presets",
    category: "adjustments",
    icon: Focus,
  },
  {
    name: "Replace & Invert Color",
    description: "Replace specific colors or invert",
    category: "adjustments",
    icon: Pipette,
  },
  // AI Tools
  {
    name: "Remove Background",
    description: "AI-powered background removal",
    category: "ai",
    icon: Eraser,
  },
  {
    name: "Image Upscaling",
    description: "AI super-resolution enhancement",
    category: "ai",
    icon: ZoomIn,
  },
  {
    name: "Object Eraser",
    description: "Remove unwanted objects with AI",
    category: "ai",
    icon: Wand2,
  },
  {
    name: "OCR / Text Extraction",
    description: "Extract text from images",
    category: "ai",
    icon: ScanText,
  },
  {
    name: "Face / PII Blur",
    description: "Auto-detect and blur faces and sensitive info",
    category: "ai",
    icon: EyeOff,
  },
  {
    name: "Smart Crop",
    description: "Smart subject, face, or trim-based cropping",
    category: "ai",
    icon: Scan,
  },
  {
    name: "Image Enhancement",
    description: "One-click auto-improve with smart analysis",
    category: "ai",
    icon: Sparkles,
  },
  {
    name: "Face Enhancement",
    description: "Restore and enhance faces with AI",
    category: "ai",
    icon: ScanFace,
  },
  {
    name: "AI Colorization",
    description: "Convert B&W photos to full color with AI",
    category: "ai",
    icon: Palette,
  },
  {
    name: "Noise Removal",
    description: "AI-powered noise and grain removal",
    category: "ai",
    icon: AudioLines,
  },
  {
    name: "Red Eye Removal",
    description: "AI-detect and fix red eye in flash photos",
    category: "ai",
    icon: Eye,
  },
  {
    name: "Photo Restoration",
    description: "Fix scratches, tears, and damage on old photos with AI",
    category: "ai",
    icon: Undo2,
  },
  {
    name: "Passport Photo",
    description: "AI-powered passport and ID photo generator",
    category: "ai",
    icon: UserCheck,
  },
  {
    name: "Content-Aware Resize",
    description: "Seam carving resize that preserves important content",
    category: "ai",
    icon: Scaling,
  },
  {
    name: "PNG Transparency Fixer",
    description: "Fix fake transparent PNGs with AI matting",
    category: "ai",
    icon: Droplets,
  },
  // Watermark & Overlay
  {
    name: "Text Watermark",
    description: "Add text watermark overlay",
    category: "watermark",
    icon: Type,
  },
  {
    name: "Image Watermark",
    description: "Overlay a logo as watermark",
    category: "watermark",
    icon: ImagePlus,
  },
  {
    name: "Text Overlay",
    description: "Add styled text to images",
    category: "watermark",
    icon: TextCursorInput,
  },
  {
    name: "Image Composition",
    description: "Layer images with position and opacity",
    category: "watermark",
    icon: Layers,
  },
  // Utilities
  {
    name: "Image Info",
    description: "View all metadata and image properties",
    category: "utilities",
    icon: Info,
  },
  {
    name: "Image Compare",
    description: "Side-by-side comparison of two images",
    category: "utilities",
    icon: Columns2,
  },
  {
    name: "Find Duplicates",
    description: "Detect duplicate and near-duplicate images",
    category: "utilities",
    icon: Copy,
  },
  {
    name: "Color Palette",
    description: "Extract dominant colors from image",
    category: "utilities",
    icon: Palette,
  },
  {
    name: "QR Code Generator",
    description: "Generate styled QR codes with custom colors, patterns, and logos",
    category: "utilities",
    icon: QrCode,
  },
  {
    name: "Barcode Reader",
    description: "Scan images for QR codes, barcodes, and 2D codes",
    category: "utilities",
    icon: ScanLine,
  },
  {
    name: "Image to Base64",
    description: "Convert images to base64 strings for embedding in HTML, CSS, and more",
    category: "utilities",
    icon: Code,
  },
  // Layout & Composition
  {
    name: "Collage / Grid",
    description: "Combine images into beautiful grid collages with 25+ templates",
    category: "layout",
    icon: LayoutGrid,
  },
  {
    name: "Stitch / Combine",
    description: "Join images side by side, stacked, or in a grid",
    category: "layout",
    icon: Columns,
  },
  {
    name: "Image Splitting",
    description: "Split images into grid tiles or by pixel size with live preview",
    category: "layout",
    icon: Grid3x3,
  },
  {
    name: "Border & Frame",
    description: "Add borders, rounded corners, shadows",
    category: "layout",
    icon: Frame,
  },
  // Format & Conversion
  {
    name: "SVG to Raster",
    description: "Convert SVG to PNG, JPEG, WebP, AVIF, TIFF, GIF, or HEIF at custom scale and DPI",
    category: "format",
    icon: FileImage,
  },
  {
    name: "Image to SVG",
    description: "Vectorize images using tracing",
    category: "format",
    icon: PenTool,
  },
  {
    name: "GIF Tools",
    description:
      "Resize, optimize, change speed, reverse, extract frames, and rotate animated GIFs",
    category: "format",
    icon: Film,
  },
  {
    name: "PDF to Image",
    description: "Convert PDF pages to images",
    category: "format",
    icon: FileOutput,
  },
];

const categoryMap = new Map(categories.map((c) => [c.id, c]));

function getCategoryCount(id: string) {
  return tools.filter((t) => t.category === id).length;
}

export function BentoGrid() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tools.filter((tool) => {
      if (activeCategory !== "all" && tool.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const cat = categoryMap.get(tool.category);
      return (
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        (cat?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [search, activeCategory]);

  return (
    <section id="features" className="px-6 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <h2 className="font-[family-name:var(--font-nunito)] text-center text-3xl font-bold tracking-tight md:text-4xl">
            48 tools. Zero cloud dependency.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted">
            Search to find exactly what you need. Every tool runs 100% locally.
          </p>
        </FadeIn>

        {/* Search bar */}
        <div className="mx-auto mt-12 max-w-md">
          <div className="relative">
            <Search size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search tools..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-background py-3 pr-4 pl-11 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="mt-6 flex flex-nowrap gap-2 overflow-x-auto pb-2 md:flex-wrap md:justify-center md:overflow-visible">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === "all"
                ? "bg-accent text-accent-foreground"
                : "border border-border hover:bg-background-alt"
            }`}
          >
            All ({tools.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-accent text-accent-foreground"
                  : "border border-border hover:bg-background-alt"
              }`}
            >
              {cat.name} ({getCategoryCount(cat.id)})
            </button>
          ))}
        </div>

        {/* Result count */}
        <p className="mt-6 text-center text-sm text-muted">
          Showing {filtered.length} of {tools.length} tools
        </p>

        {/* Tool grid */}
        {filtered.length > 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {filtered.map((tool) => {
              const cat = categoryMap.get(tool.category);
              const Icon = tool.icon;
              return (
                <div
                  key={tool.name}
                  className="tool-card flex flex-col items-center rounded-xl border border-border bg-background-alt px-4 py-6 text-center transition-all hover:shadow-md"
                  style={
                    {
                      "--cat-color": cat?.color,
                    } as React.CSSProperties
                  }
                >
                  <Icon size={30} style={{ color: cat?.color }} className="mb-3 shrink-0" />
                  <span className="font-bold text-sm">{tool.name}</span>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{tool.description}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-16 text-center text-muted">No tools found. Try a different search.</p>
        )}
      </div>
    </section>
  );
}
