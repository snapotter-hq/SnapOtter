# Phase 2: Core Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the image processing engine, file upload/download pipeline, and the first 10 core tools with both API endpoints and frontend settings UI. This is the phase where Stirling-Image goes from a shell to a functional image processing suite.

**Architecture:** Each tool follows a uniform pattern: Fastify route accepts multipart file upload + JSON settings, delegates to the `@stirling-image/image-engine` package (Sharp wrapper), returns the processed file for download. A generic route factory eliminates boilerplate across all 37 tools. Batch processing uses p-queue for concurrency control and SSE for progress.

**Tech Stack:** Sharp (libvips), @fastify/multipart, p-queue, archiver (ZIP), react-image-crop, Zustand, SSE

**Spec:** `PRD.md` sections 5.1, 5.2, 5.3, 15

**Depends on:** Phase 1 (foundation) -- completed

---

## Task 1: Image Engine Package

Build the Sharp wrapper in `packages/image-engine`. Each operation is a separate file exporting a single async function. All operations accept a Sharp instance (or Buffer) and return a Sharp instance (or Buffer), making them composable for the pipeline builder later.

### Files to create

```
packages/image-engine/
├── src/
│   ├── index.ts                    # Re-exports all operations + types
│   ├── types.ts                    # Shared types: OperationResult, ImageInfo, format enums
│   ├── engine.ts                   # Core engine: load image, detect format, apply operations, output
│   ├── operations/
│   │   ├── resize.ts               # Resize by pixels, percentage, fit mode
│   │   ├── crop.ts                 # Crop by coordinates (left, top, width, height)
│   │   ├── rotate.ts               # Rotate by angle, auto-crop background
│   │   ├── flip.ts                 # Flip horizontal / vertical
│   │   ├── convert.ts              # Convert between formats with format-specific options
│   │   ├── compress.ts             # Quality-based and target-size compression
│   │   ├── strip-metadata.ts       # Selective metadata removal (EXIF, GPS, ICC, XMP)
│   │   ├── brightness.ts           # Brightness adjustment via Sharp modulate/linear
│   │   ├── contrast.ts             # Contrast adjustment via linear transform
│   │   ├── saturation.ts           # Saturation adjustment via Sharp modulate
│   │   ├── color-channels.ts       # Per-channel R/G/B multipliers via recomb
│   │   ├── grayscale.ts            # Convert to grayscale
│   │   ├── sepia.ts                # Sepia tone via recomb matrix
│   │   └── invert.ts              # Invert colors via Sharp negate
│   ├── formats/
│   │   └── detect.ts               # Format detection from buffer magic bytes + MIME mapping
│   └── utils/
│       ├── metadata.ts             # Read/parse EXIF, GPS, camera info via Sharp metadata()
│       └── mime.ts                 # Extension <-> MIME type mapping
```

### Files to modify

```
packages/image-engine/package.json  # Add sharp dependency
```

### Key interfaces

```typescript
// types.ts
export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  channels: number;
  size: number;
  hasAlpha: boolean;
  metadata: Record<string, unknown>;
}

export interface OperationResult {
  buffer: Buffer;
  info: ImageInfo;
}

// engine.ts
export async function processImage(
  input: Buffer,
  operations: ImageOperation[],
  outputFormat?: OutputFormat
): Promise<OperationResult>;

export async function getImageInfo(input: Buffer): Promise<ImageInfo>;

// operations/resize.ts
export interface ResizeOptions {
  width?: number;
  height?: number;
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
  withoutEnlargement?: boolean;
  percentage?: number;
}
export async function resize(image: Sharp, options: ResizeOptions): Promise<Sharp>;

// operations/crop.ts
export interface CropOptions {
  left: number;
  top: number;
  width: number;
  height: number;
}
export async function crop(image: Sharp, options: CropOptions): Promise<Sharp>;

// operations/compress.ts
export interface CompressOptions {
  quality?: number;           // 1-100
  targetSizeBytes?: number;   // binary search to hit target
  format?: OutputFormat;
}
export async function compress(image: Sharp, options: CompressOptions): Promise<Sharp>;
```

### Steps

- [ ] Add `sharp` as a dependency in `packages/image-engine/package.json`
- [ ] Create `src/types.ts` with `ImageInfo`, `OperationResult`, `ResizeOptions`, `CropOptions`, `RotateOptions`, `FlipOptions`, `ConvertOptions`, `CompressOptions`, `StripMetadataOptions`, `BrightnessOptions`, `ContrastOptions`, `SaturationOptions`, `ColorChannelOptions`, `OutputFormat` type
- [ ] Create `src/formats/detect.ts` -- use Sharp metadata + magic-byte fallback to detect input format, export `detectFormat(buffer: Buffer): Promise<string>`
- [ ] Create `src/utils/mime.ts` -- bidirectional map between file extensions and MIME types for all supported formats
- [ ] Create `src/utils/metadata.ts` -- wrap `sharp(buffer).metadata()` and parse EXIF fields into structured object
- [ ] Create `src/operations/resize.ts` -- use `sharp.resize()` with fit mode mapping
- [ ] Create `src/operations/crop.ts` -- use `sharp.extract()` with bounds validation
- [ ] Create `src/operations/rotate.ts` -- use `sharp.rotate(angle)` with background option for non-90 angles
- [ ] Create `src/operations/flip.ts` -- use `sharp.flip()` and `sharp.flop()`
- [ ] Create `src/operations/convert.ts` -- use `sharp.toFormat()` with per-format quality/option defaults from PRD section 6.2
- [ ] Create `src/operations/compress.ts` -- quality mode: pass quality to format encoder; target-size mode: binary search (max 8 iterations) adjusting quality until output is within 5% of target
- [ ] Create `src/operations/strip-metadata.ts` -- use `sharp.withMetadata()` / `sharp.keepMetadata()` with selective field control
- [ ] Create `src/operations/brightness.ts` -- use `sharp.modulate({ brightness })` where 1.0 = no change, map -100..+100 slider to 0..2 multiplier
- [ ] Create `src/operations/contrast.ts` -- use `sharp.linear(a, b)` where a is contrast multiplier, map -100..+100 to 0.5..1.5
- [ ] Create `src/operations/saturation.ts` -- use `sharp.modulate({ saturation })` where 1.0 = no change
- [ ] Create `src/operations/color-channels.ts` -- use `sharp.recomb()` with 3x3 matrix for per-channel multipliers
- [ ] Create `src/operations/grayscale.ts` -- use `sharp.grayscale()`
- [ ] Create `src/operations/sepia.ts` -- use `sharp.recomb()` with sepia matrix `[[0.393,0.769,0.189],[0.349,0.686,0.168],[0.272,0.534,0.131]]`
- [ ] Create `src/operations/invert.ts` -- use `sharp.negate()`
- [ ] Create `src/engine.ts` -- the orchestrator that loads a buffer, chains operations, and outputs in the requested format
- [ ] Update `src/index.ts` to re-export everything
- [ ] Write unit tests: `packages/image-engine/tests/operations.test.ts` -- test each operation with a small test image (1x1 or 10x10 PNG generated in-memory via Sharp). Verify output dimensions, format, and that no errors are thrown.

### Test

```bash
cd packages/image-engine && pnpm test
```

Create a test that generates a 100x100 red PNG in-memory, runs each operation, and asserts the output is a valid image buffer with expected properties.

### Commit

```
feat(image-engine): add Sharp wrapper with 14 image operations

Operations: resize, crop, rotate, flip, convert, compress, strip-metadata,
brightness, contrast, saturation, color-channels, grayscale, sepia, invert.
Includes format detection, MIME mapping, and metadata parsing.
```

---

## Task 2: File Upload & Download System

Add multipart file upload to Fastify, workspace session management (temp directory per processing request), and download routes. This is the backbone all tools share.

### Files to create

```
apps/api/src/plugins/upload.ts        # Register @fastify/multipart with size limits
apps/api/src/lib/workspace.ts         # Create/manage temp dirs per job: create(jobId), getPath(jobId, filename), cleanup(jobId)
apps/api/src/routes/files.ts          # POST /api/v1/upload, GET /api/v1/download/:jobId/:filename
apps/api/src/lib/file-validation.ts   # Validate file type (magic bytes, not just extension), size, megapixel limit
```

### Files to modify

```
apps/api/src/index.ts                 # Register upload plugin + file routes
apps/api/src/lib/env.ts               # Already has WORKSPACE_PATH, MAX_UPLOAD_SIZE_MB -- no changes needed
apps/web/src/lib/api.ts               # Add apiUpload() for multipart form data, apiDownload() for blob download
```

### Key interfaces

```typescript
// plugins/upload.ts
export async function registerUpload(app: FastifyInstance): Promise<void>;
// Registers @fastify/multipart with limits: fileSize from env.MAX_UPLOAD_SIZE_MB

// lib/workspace.ts
export function createWorkspace(jobId: string): string;    // returns absolute path to temp dir
export function getWorkspacePath(jobId: string): string;
export function cleanupWorkspace(jobId: string): Promise<void>;

// lib/file-validation.ts
export interface ValidationResult { valid: boolean; error?: string; detectedFormat: string; }
export async function validateImageFile(buffer: Buffer, filename: string): Promise<ValidationResult>;
// Checks: buffer not empty, magic bytes match image format, format in SUPPORTED_INPUT_FORMATS,
//         dimensions within MAX_MEGAPIXELS

// routes/files.ts
// POST /api/v1/upload -- accepts multipart/form-data, saves to workspace, returns { jobId, files: [{ name, size, format }] }
// GET /api/v1/download/:jobId/:filename -- serves file from workspace with Content-Disposition: attachment

// web lib/api.ts additions
export async function apiUpload(file: File): Promise<UploadResponse>;
export async function apiDownloadBlob(jobId: string, filename: string): Promise<Blob>;
```

### Steps

- [ ] Create `apps/api/src/plugins/upload.ts` -- register `@fastify/multipart` with `limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 }` and `attachFieldsToBody: false` (use streaming/pump approach)
- [ ] Create `apps/api/src/lib/workspace.ts` -- `createWorkspace` creates `${WORKSPACE_PATH}/${jobId}/input/` and `${WORKSPACE_PATH}/${jobId}/output/` directories, returns the job workspace root
- [ ] Create `apps/api/src/lib/file-validation.ts` -- validate magic bytes using first 12 bytes of buffer against known signatures (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, WebP: `52 49 46 46...57 45 42 50`, etc.), check format against `SUPPORTED_INPUT_FORMATS`, check dimensions via `sharp(buffer).metadata()` against `MAX_MEGAPIXELS`
- [ ] Create `apps/api/src/routes/files.ts` -- upload route: generate jobId via `randomUUID()`, create workspace, iterate multipart parts, validate each file, save to `input/` directory, return job metadata. Download route: resolve path within workspace, validate it exists, stream file with proper Content-Type and Content-Disposition headers. Guard against path traversal (reject `..` in filenames)
- [ ] Modify `apps/api/src/index.ts` -- import and register upload plugin and file routes
- [ ] Add `apiUpload` to `apps/web/src/lib/api.ts` -- construct FormData, POST to `/api/v1/upload`, return parsed JSON response
- [ ] Add `apiDownloadBlob` to `apps/web/src/lib/api.ts` -- fetch blob from download route, return blob for client-side download trigger

### Test

```bash
# Manual: use curl to upload a test image
curl -X POST http://localhost:1349/api/v1/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@test.jpg"

# Verify response contains jobId and file metadata
# Then download:
curl http://localhost:1349/api/v1/download/<jobId>/test.jpg \
  -H "Authorization: Bearer <token>" -o output.jpg
```

### Commit

```
feat(api): add multipart file upload, workspace management, and download routes

POST /api/v1/upload accepts images with magic-byte validation.
GET /api/v1/download/:jobId/:filename serves processed results.
Workspace creates isolated temp dirs per job with auto-cleanup.
```

---

## Task 3: Generic Tool Route Factory

Create a reusable pattern for tool API routes. Every tool follows the same flow: accept file upload + JSON settings body, process via image-engine, return processed file. The factory eliminates duplicating this boilerplate for each of the 37 tools.

### Files to create

```
apps/api/src/routes/tool-factory.ts   # Generic route factory
apps/api/src/routes/tools/index.ts    # Registers all tool routes
```

### Files to modify

```
apps/api/src/index.ts                 # Import and register tool routes
packages/shared/src/types.ts          # Add ToolSettings base type, ProcessResponse type
```

### Key interfaces

```typescript
// routes/tool-factory.ts
export interface ToolRouteConfig<TSettings> {
  toolId: string;                                                    // matches TOOLS[].id from shared constants
  settingsSchema: ZodType<TSettings>;                                // Zod schema for validating settings JSON
  process: (input: Buffer, settings: TSettings, info: ImageInfo) => Promise<OperationResult>;
  acceptsMultiple?: boolean;                                         // default false; true for batch tools
}

export function createToolRoute<TSettings>(
  app: FastifyInstance,
  config: ToolRouteConfig<TSettings>
): void;
// Registers: POST /api/v1/tools/:toolId
// Flow:
//   1. Parse multipart: extract file(s) + "settings" JSON field
//   2. Validate settings against config.settingsSchema
//   3. Create workspace (jobId)
//   4. Save input file to workspace
//   5. Call config.process(buffer, validatedSettings, imageInfo)
//   6. Save output to workspace
//   7. Return { jobId, output: { filename, size, format, downloadUrl } }

// routes/tools/index.ts
export async function registerToolRoutes(app: FastifyInstance): Promise<void>;
// Loops through tool configs and calls createToolRoute for each

// shared/types.ts additions
export interface ProcessResponse {
  jobId: string;
  output: {
    filename: string;
    size: number;
    format: string;
    width: number;
    height: number;
    downloadUrl: string;
  };
  originalSize: number;
  processingTimeMs: number;
}
```

### Steps

- [ ] Add `ProcessResponse` type to `packages/shared/src/types.ts`
- [ ] Create `apps/api/src/routes/tool-factory.ts` -- implement `createToolRoute` that handles the full upload-process-download cycle. Use `performance.now()` to measure processing time. Catch errors from the process function and return structured error responses with the original filename
- [ ] Create `apps/api/src/routes/tools/index.ts` -- placeholder that will import and register each tool as they are built in tasks 4-10
- [ ] Modify `apps/api/src/index.ts` -- register tool routes via `registerToolRoutes(app)` after auth middleware

### Test

```bash
# Will be fully testable after Task 4 (Resize) adds the first tool
# For now: verify the factory compiles and the /api/v1/tools route prefix is registered
pnpm --filter @stirling-image/api typecheck
```

### Commit

```
feat(api): add generic tool route factory for uniform tool endpoints

createToolRoute() handles multipart upload, settings validation, image
processing delegation, and download URL generation. Eliminates per-tool
boilerplate for all 37 tools.
```

---

## Task 4: Resize Tool

First tool built on the factory. API route + full frontend settings panel.

### Files to create

```
apps/api/src/routes/tools/resize.ts           # Tool config using createToolRoute
apps/web/src/components/tools/resize-settings.tsx  # Width/height inputs, aspect ratio lock, presets, fit mode
apps/web/src/stores/file-store.ts              # Zustand store for uploaded files + processing state
apps/web/src/hooks/use-tool-processor.ts       # Hook: upload file, send settings, poll/wait, trigger download
```

### Files to modify

```
apps/api/src/routes/tools/index.ts    # Register resize route
apps/web/src/pages/tool-page.tsx      # Render tool-specific settings component based on toolId
```

### Key interfaces

```typescript
// routes/tools/resize.ts
const resizeSettingsSchema = z.object({
  width: z.number().int().min(1).max(16384).optional(),
  height: z.number().int().min(1).max(16384).optional(),
  percentage: z.number().min(1).max(1000).optional(),
  fit: z.enum(['contain', 'cover', 'fill', 'inside', 'outside']).default('contain'),
  withoutEnlargement: z.boolean().default(true),
  outputFormat: z.enum(['jpg', 'png', 'webp', 'avif', 'tiff']).optional(),
});

// components/tools/resize-settings.tsx
interface ResizeSettingsProps {
  settings: ResizeSettings;
  onChange: (settings: ResizeSettings) => void;
  imageInfo?: ImageInfo;  // original image dimensions for aspect ratio calc
}

// stores/file-store.ts (Zustand)
interface FileStore {
  files: UploadedFile[];
  activeFile: UploadedFile | null;
  processing: boolean;
  result: ProcessResponse | null;
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  setResult: (result: ProcessResponse) => void;
  reset: () => void;
}

// hooks/use-tool-processor.ts
function useToolProcessor(toolId: string): {
  process: (file: File, settings: Record<string, unknown>) => Promise<ProcessResponse>;
  download: (jobId: string, filename: string) => Promise<void>;
  processing: boolean;
  progress: number;
  result: ProcessResponse | null;
  error: string | null;
};
```

### Steps

- [ ] Create `apps/web/src/stores/file-store.ts` -- Zustand store tracking uploaded files (id, name, size, objectUrl for preview, file reference), active file selection, processing state, and result
- [ ] Create `apps/web/src/hooks/use-tool-processor.ts` -- hook that wraps apiUpload + tool processing call + download trigger. Constructs FormData with file + settings JSON, POSTs to `/api/v1/tools/:toolId`, manages loading/error states
- [ ] Create `apps/api/src/routes/tools/resize.ts` -- define `resizeSettingsSchema`, call `resize()` from image-engine, register via `createToolRoute`
- [ ] Register resize in `apps/api/src/routes/tools/index.ts`
- [ ] Create `apps/web/src/components/tools/resize-settings.tsx` -- width/height number inputs (linked by aspect ratio lock toggle), social media presets dropdown (from `SOCIAL_MEDIA_PRESETS` in shared constants), fit mode selector (radio group: contain/cover/fill), percentage input as alternative mode
- [ ] Modify `apps/web/src/pages/tool-page.tsx` -- import a `toolSettingsMap` keyed by `toolId`, render the matching settings component in the sidebar. Wire `Dropzone.onFiles` to `fileStore.addFiles`. Wire Process button to `useToolProcessor.process`. Show download button when result is available

### Test

```bash
# Start dev servers
pnpm dev

# 1. Navigate to /resize
# 2. Upload a test image
# 3. Set width=500, height=500, fit=cover
# 4. Click Process
# 5. Verify download produces a 500x500 image
# 6. Test aspect ratio lock: enter width, verify height auto-calculates
# 7. Test social media presets: select "Instagram Post", verify 1080x1080
```

### Commit

```
feat: add resize tool with API endpoint and frontend settings UI

Includes social media presets, aspect ratio lock, fit mode selector.
Also adds file-store (Zustand), use-tool-processor hook, and tool-page
settings rendering pattern used by all subsequent tools.
```

---

## Task 5: Crop Tool

Interactive visual crop on the uploaded image preview.

### Files to create

```
apps/api/src/routes/tools/crop.ts                  # Tool config
apps/web/src/components/tools/crop-settings.tsx     # Aspect ratio presets, dimension inputs
apps/web/src/components/common/image-cropper.tsx    # Interactive crop component wrapping react-image-crop
```

### Files to modify

```
apps/api/src/routes/tools/index.ts     # Register crop route
apps/web/src/pages/tool-page.tsx       # Add crop to toolSettingsMap
apps/web/package.json                  # Add react-image-crop dependency
```

### Key interfaces

```typescript
// routes/tools/crop.ts
const cropSettingsSchema = z.object({
  left: z.number().min(0),
  top: z.number().min(0),
  width: z.number().min(1),
  height: z.number().min(1),
});

// components/common/image-cropper.tsx
interface ImageCropperProps {
  src: string;                          // object URL of uploaded image
  aspectRatio?: number;                 // locked aspect ratio (e.g., 1 for 1:1, 16/9)
  onCropChange: (crop: CropArea) => void;
}
// Uses react-image-crop to render a draggable/resizable crop box over the image.
// Outputs pixel coordinates (left, top, width, height) relative to original image dimensions.

// components/tools/crop-settings.tsx
// Aspect ratio preset buttons: Free, 1:1, 4:3, 16:9, 2:3, 4:5, 9:16
// Manual dimension inputs for left, top, width, height (updates crop box)
// Displays current crop dimensions
```

### Steps

- [ ] Add `react-image-crop` to `apps/web/package.json`
- [ ] Create `apps/web/src/components/common/image-cropper.tsx` -- wrap `ReactCrop` component, handle percentage-to-pixel coordinate conversion based on actual image dimensions vs rendered dimensions, emit `CropArea` with absolute pixel values
- [ ] Create `apps/api/src/routes/tools/crop.ts` -- validate coordinates are within image bounds (clamp if needed), call `crop()` from image-engine
- [ ] Register crop in `apps/api/src/routes/tools/index.ts`
- [ ] Create `apps/web/src/components/tools/crop-settings.tsx` -- aspect ratio preset buttons that lock the `ReactCrop` aspect, manual coordinate inputs that sync bidirectionally with the crop box
- [ ] Modify `apps/web/src/pages/tool-page.tsx` -- for crop tool, render `ImageCropper` in the main area instead of static preview. Add crop to `toolSettingsMap`

### Test

```bash
# 1. Navigate to /crop
# 2. Upload a 1920x1080 image
# 3. Draw a crop area, verify coordinates display
# 4. Select 1:1 aspect ratio, verify crop box constrains
# 5. Click Process, verify output dimensions match crop area
# 6. Test edge case: crop area exceeds image bounds
```

### Commit

```
feat: add crop tool with interactive visual crop area and aspect presets

Uses react-image-crop for drag-to-select crop region. Supports aspect
ratio presets (1:1, 4:3, 16:9, etc.) and manual coordinate input.
```

---

## Task 6: Rotate & Flip Tool

### Files to create

```
apps/api/src/routes/tools/rotate.ts                # Tool config
apps/web/src/components/tools/rotate-settings.tsx   # Rotation controls + flip buttons
```

### Files to modify

```
apps/api/src/routes/tools/index.ts     # Register rotate route
apps/web/src/pages/tool-page.tsx       # Add rotate to toolSettingsMap
```

### Key interfaces

```typescript
// routes/tools/rotate.ts
const rotateSettingsSchema = z.object({
  angle: z.number().min(0).max(360).default(0),
  flipHorizontal: z.boolean().default(false),
  flipVertical: z.boolean().default(false),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#000000'),  // fill for non-90 angles
});

// components/tools/rotate-settings.tsx
// - 90-degree quick buttons: [Rotate Left] [Rotate Right] (decrement/increment by 90)
// - Arbitrary angle input: number input or slider (0-360)
// - Flip buttons: [Flip Horizontal] [Flip Vertical] (toggles)
// - Background color picker (for non-90-degree rotation fill)
// - Live rotation preview via CSS transform on the image thumbnail
```

### Steps

- [ ] Create `apps/api/src/routes/tools/rotate.ts` -- apply rotation first (via `rotate()` from image-engine), then flip if requested (via `flip()` from image-engine). For non-90-degree angles, use `backgroundColor` option
- [ ] Register rotate in `apps/api/src/routes/tools/index.ts`
- [ ] Create `apps/web/src/components/tools/rotate-settings.tsx` -- four quick-rotate buttons (-90, +90, 180, 0/reset), arbitrary angle slider (0-360 range), flip H/V toggle buttons with icons, background color picker (shown only when angle is not a multiple of 90). Apply `CSS transform: rotate(Xdeg) scaleX(flip)` on the image element for instant visual feedback before server processing
- [ ] Add rotate to `toolSettingsMap` in `apps/web/src/pages/tool-page.tsx`

### Test

```bash
# 1. Navigate to /rotate
# 2. Upload an image
# 3. Click Rotate Right, verify preview rotates 90 degrees CW
# 4. Click Flip Horizontal, verify preview mirrors
# 5. Set angle to 45, verify preview shows angled image
# 6. Process and download, verify output matches preview
# 7. Verify non-90-degree rotation fills background with selected color
```

### Commit

```
feat: add rotate & flip tool with live CSS preview and arbitrary angle support

Quick 90-degree buttons, arbitrary angle slider, flip H/V toggles.
CSS transform preview before server-side processing.
```

---

## Task 7: Convert Tool

### Files to create

```
apps/api/src/routes/tools/convert.ts                # Tool config
apps/web/src/components/tools/convert-settings.tsx   # Format picker, quality options
```

### Files to modify

```
apps/api/src/routes/tools/index.ts     # Register convert route
apps/web/src/pages/tool-page.tsx       # Add convert to toolSettingsMap
```

### Key interfaces

```typescript
// routes/tools/convert.ts
const convertSettingsSchema = z.object({
  targetFormat: z.enum(['jpg', 'png', 'webp', 'avif', 'tiff', 'gif']),
  quality: z.number().min(1).max(100).optional(),          // for lossy formats
  compressionLevel: z.number().min(0).max(9).optional(),   // for PNG
  lossless: z.boolean().optional(),                        // for WebP/AVIF
});

// components/tools/convert-settings.tsx
// - Source format: auto-detected, displayed as badge (e.g., "Source: PNG")
// - Target format: radio group or dropdown with format icons
// - Format-specific options shown conditionally:
//   - JPG: quality slider (1-100, default 80)
//   - PNG: compression level (0-9, default 6)
//   - WebP: quality slider + lossless toggle
//   - AVIF: quality slider (default 50)
//   - TIFF: compression type dropdown (none, lzw, deflate)
```

### Steps

- [ ] Create `apps/api/src/routes/tools/convert.ts` -- call `convert()` from image-engine with format and quality options. Set output filename extension to match target format
- [ ] Register convert in `apps/api/src/routes/tools/index.ts`
- [ ] Create `apps/web/src/components/tools/convert-settings.tsx` -- auto-detect source format from uploaded file metadata (returned by upload endpoint), render format radio group with icons for each supported output format, conditionally show format-specific quality controls. Display estimated output size when possible
- [ ] Add convert to `toolSettingsMap` in `apps/web/src/pages/tool-page.tsx`

### Test

```bash
# 1. Upload a JPG, convert to WebP, verify output is valid WebP
# 2. Upload a PNG with transparency, convert to JPG, verify alpha is composited on white
# 3. Convert to AVIF, verify quality slider works (small file at q=30, larger at q=80)
# 4. Convert PNG to PNG with compression level 9, verify file is smaller
# 5. Test lossless WebP toggle
```

### Commit

```
feat: add format conversion tool with auto-detection and per-format quality options

Supports JPG, PNG, WebP, AVIF, TIFF, GIF output. Format-specific
quality controls shown conditionally (quality slider, lossless toggle,
compression level).
```

---

## Task 8: Compress Tool

### Files to create

```
apps/api/src/routes/tools/compress.ts                # Tool config
apps/web/src/components/tools/compress-settings.tsx   # Quality vs target size mode
```

### Files to modify

```
apps/api/src/routes/tools/index.ts     # Register compress route
apps/web/src/pages/tool-page.tsx       # Add compress to toolSettingsMap
```

### Key interfaces

```typescript
// routes/tools/compress.ts
const compressSettingsSchema = z.object({
  mode: z.enum(['quality', 'targetSize']),
  quality: z.number().min(1).max(100).optional(),            // used when mode=quality
  targetSizeKB: z.number().min(1).max(102400).optional(),    // used when mode=targetSize
  outputFormat: z.enum(['jpg', 'png', 'webp', 'avif']).optional(),  // keep original if not set
});

// components/tools/compress-settings.tsx
// - Mode toggle: [Quality] / [Target File Size] (segmented control)
// - Quality mode: slider 1-100 with labels (Low / Medium / High / Original)
// - Target size mode: number input + unit dropdown (KB / MB)
// - Before/after file size display: "4.2 MB -> ~890 KB (79% reduction)"
//   (estimated from quality, confirmed after processing)
// - Output format selector (optional -- keep original format by default)
```

### Steps

- [ ] Create `apps/api/src/routes/tools/compress.ts` -- two code paths: quality mode passes quality directly to `compress()` from image-engine; target-size mode passes `targetSizeBytes` which triggers binary search in the engine
- [ ] Register compress in `apps/api/src/routes/tools/index.ts`
- [ ] Create `apps/web/src/components/tools/compress-settings.tsx` -- segmented control for mode toggle, quality slider with labeled ticks, target size input with KB/MB unit toggle. After processing, show before/after comparison: original size, compressed size, percentage reduction, compression ratio
- [ ] Add compress to `toolSettingsMap` in `apps/web/src/pages/tool-page.tsx`

### Test

```bash
# 1. Upload a 5MB JPG
# 2. Quality mode: set quality=50, process, verify output is significantly smaller
# 3. Target size mode: set target=200KB, process, verify output is within ~10% of 200KB
# 4. Verify file size comparison shows correct values
# 5. Edge case: target size larger than original -- return original unchanged
# 6. Edge case: target size impossibly small -- return lowest quality result with warning
```

### Commit

```
feat: add compress tool with quality slider and target file size modes

Binary search compression for target size (within 5% accuracy, max 8
iterations). Before/after file size comparison in the UI.
```

---

## Task 9: Strip Metadata Tool

### Files to create

```
apps/api/src/routes/tools/strip-metadata.ts                # Tool config
apps/web/src/components/tools/strip-metadata-settings.tsx   # Metadata field checkboxes
```

### Files to modify

```
apps/api/src/routes/tools/index.ts     # Register strip-metadata route
apps/web/src/pages/tool-page.tsx       # Add strip-metadata to toolSettingsMap
```

### Key interfaces

```typescript
// routes/tools/strip-metadata.ts
const stripMetadataSettingsSchema = z.object({
  removeExif: z.boolean().default(true),
  removeGps: z.boolean().default(true),
  removeCameraInfo: z.boolean().default(true),
  removeIccProfile: z.boolean().default(false),    // ICC affects color -- default keep
  removeXmp: z.boolean().default(true),
  removeIptc: z.boolean().default(true),
});

// components/tools/strip-metadata-settings.tsx
// - Checkbox group with descriptions:
//   [x] EXIF Data (camera settings, date, software)
//   [x] GPS Location (latitude, longitude, altitude)
//   [x] Camera Info (make, model, lens, serial number)
//   [ ] ICC Color Profile (affects color accuracy -- caution)
//   [x] XMP Data (editing history, keywords)
//   [x] IPTC Data (copyright, caption, credits)
// - "Select All" / "Deselect All" buttons
// - Before/after metadata preview: show what will be removed
// - Warning when removing ICC profile
```

### Steps

- [ ] Create `apps/api/src/routes/tools/strip-metadata.ts` -- call `stripMetadata()` from image-engine with the field flags. Return both the processed image and a diff of what metadata was removed
- [ ] Register strip-metadata in `apps/api/src/routes/tools/index.ts`
- [ ] Create `apps/web/src/components/tools/strip-metadata-settings.tsx` -- checkbox group with field descriptions, select all/none toggles. Before processing: show current metadata summary (fetched from image info). After processing: show removed fields in a collapsible diff
- [ ] Add strip-metadata to `toolSettingsMap` in `apps/web/src/pages/tool-page.tsx`

### Test

```bash
# 1. Upload a photo with rich EXIF (phone photo with GPS)
# 2. Check all boxes, process, verify metadata is stripped (inspect with exiftool or image info tool)
# 3. Uncheck ICC Profile, process, verify ICC is preserved but EXIF/GPS removed
# 4. Verify output image is visually identical to input
# 5. Verify file size is slightly smaller (metadata removed)
```

### Commit

```
feat: add strip metadata tool with selective field removal

Checkboxes for EXIF, GPS, Camera, ICC, XMP, IPTC. Shows metadata
before/after diff. ICC removal warns about color accuracy impact.
```

---

## Task 10: Color Adjustments Tool

Combines brightness, contrast, saturation, color channels, and color effects into a single comprehensive tool page (maps to PRD sections A-01 through A-04 under Adjustments).

### Files to create

```
apps/api/src/routes/tools/color-adjustments.ts                # Tool config
apps/web/src/components/tools/color-adjustments-settings.tsx   # Tabbed settings: Adjust / Channels / Effects
```

### Files to modify

```
apps/api/src/routes/tools/index.ts     # Register color adjustment routes
apps/web/src/pages/tool-page.tsx       # Add all four adjustment tool IDs to toolSettingsMap
```

### Key interfaces

```typescript
// routes/tools/color-adjustments.ts
// Handles four tool IDs: brightness-contrast, saturation, color-channels, color-effects
// They share one route handler since the operations are composable

const colorAdjustmentsSchema = z.object({
  brightness: z.number().min(-100).max(100).default(0),
  contrast: z.number().min(-100).max(100).default(0),
  saturation: z.number().min(-100).max(100).default(0),
  exposure: z.number().min(-100).max(100).default(0),
  channelR: z.number().min(0).max(200).default(100),  // percentage
  channelG: z.number().min(0).max(200).default(100),
  channelB: z.number().min(0).max(200).default(100),
  effect: z.enum(['none', 'grayscale', 'sepia', 'invert']).default('none'),
  effectIntensity: z.number().min(0).max(100).default(100),
});

// components/tools/color-adjustments-settings.tsx
// Three tabs or accordion sections:
//
// [Adjust] tab:
//   - Brightness slider (-100 to +100, center=0)
//   - Contrast slider (-100 to +100, center=0)
//   - Saturation slider (-100 to +100, center=0)
//   - Exposure slider (-100 to +100, center=0)
//   - Reset All button
//
// [Channels] tab:
//   - Red slider (0% to 200%, center=100%)
//   - Green slider (0% to 200%, center=100%)
//   - Blue slider (0% to 200%, center=100%)
//   - Colored slider tracks (red/green/blue tinted)
//
// [Effects] tab:
//   - Effect buttons: [Original] [Grayscale] [Sepia] [Invert]
//   - Intensity slider (0-100%) for sepia
//   - Active effect highlighted
```

### Steps

- [ ] Create `apps/api/src/routes/tools/color-adjustments.ts` -- apply operations in deterministic order: brightness -> contrast -> saturation -> color channels -> effect. Use the individual operation functions from image-engine. Register four route variants (one per tool ID) that all use the same handler but with different default tab focus
- [ ] Register all four adjustment tool IDs in `apps/api/src/routes/tools/index.ts`
- [ ] Create `apps/web/src/components/tools/color-adjustments-settings.tsx` -- three-tab layout using shadcn Tabs component. Each slider shows its current value. Double-click a slider to reset to default. "Reset All" clears everything. When navigated to via `/brightness-contrast`, auto-select the Adjust tab; via `/color-channels`, auto-select Channels tab; via `/color-effects`, auto-select Effects tab
- [ ] Add all four adjustment tool IDs (`brightness-contrast`, `saturation`, `color-channels`, `color-effects`) to `toolSettingsMap` in `apps/web/src/pages/tool-page.tsx`, all pointing to the same `ColorAdjustmentsSettings` component with a `defaultTab` prop

### Test

```bash
# 1. Upload an image to /brightness-contrast
# 2. Drag brightness to +50, verify image appears brighter after processing
# 3. Navigate to /color-effects, apply Grayscale, verify output is grayscale
# 4. Apply Sepia at 50% intensity, verify tinted output
# 5. Navigate to /color-channels, set Red to 0%, verify red channel is removed
# 6. Apply multiple adjustments together: brightness +30, contrast +20, saturation -50
# 7. Verify Reset All returns all sliders to default
```

### Commit

```
feat: add color adjustments tool with brightness, contrast, saturation,
channels, and effects (grayscale, sepia, invert)

Tabbed settings UI serves four tool routes. Operations are composable
and applied in deterministic order.
```

---

## Task 11: Before/After Preview Component

Reusable React component showing original vs processed image with a draggable split slider. Used by compress, color adjustments, and future tools where visual comparison matters.

### Files to create

```
apps/web/src/components/common/before-after-preview.tsx   # The slider component
apps/web/src/components/common/file-size-badge.tsx        # "4.2 MB -> 890 KB (79%)" badge
apps/web/src/components/common/image-preview.tsx          # Single image preview with zoom/pan
```

### Files to modify

```
apps/web/src/pages/tool-page.tsx       # Replace static dropzone with preview when result exists
```

### Key interfaces

```typescript
// components/common/before-after-preview.tsx
interface BeforeAfterPreviewProps {
  beforeSrc: string;       // object URL of original
  afterSrc: string;        // object URL of processed result
  beforeLabel?: string;    // default "Original"
  afterLabel?: string;     // default "Processed"
  beforeSize?: number;     // bytes
  afterSize?: number;      // bytes
}
// Renders two images stacked with CSS clip-path. A vertical divider bar
// is draggable left/right (mouse + touch). Left side shows "before" clipped
// to the divider position, right side shows "after". Labels in top corners.
// File size comparison badge at bottom.

// components/common/file-size-badge.tsx
interface FileSizeBadgeProps {
  originalBytes: number;
  processedBytes: number;
}
// Renders: "4.2 MB -> 890 KB (79% smaller)" or "890 KB -> 1.2 MB (35% larger)"
// Green for reduction, amber for increase

// components/common/image-preview.tsx
interface ImagePreviewProps {
  src: string;
  alt?: string;
  maxHeight?: number;
  onLoad?: (info: { width: number; height: number }) => void;
}
// Renders image with object-fit contain, optional zoom on scroll, pan on drag
```

### Steps

- [ ] Create `apps/web/src/components/common/image-preview.tsx` -- simple image renderer with `object-fit: contain`, natural dimension detection via `onLoad`, and optional scroll-to-zoom
- [ ] Create `apps/web/src/components/common/file-size-badge.tsx` -- format bytes to human-readable (KB/MB), calculate percentage change, color-code (green for smaller, amber for larger)
- [ ] Create `apps/web/src/components/common/before-after-preview.tsx` -- implementation approach: two `<img>` elements absolutely positioned in a container; left image clipped with `clip-path: inset(0 ${100-position}% 0 0)`, right image clipped with `clip-path: inset(0 0 0 ${position}%)`; draggable divider bar uses `onPointerDown/Move/Up` for mouse and touch support; position stored in state (default 50%). Include `FileSizeBadge` below the images
- [ ] Modify `apps/web/src/pages/tool-page.tsx` -- after processing completes, replace the dropzone area with `BeforeAfterPreview` showing original vs result. Add a "New Image" button to reset and show dropzone again. Add a "Download" button

### Test

```bash
# 1. Process any image with compress tool
# 2. Verify before/after slider appears showing both images
# 3. Drag the slider left and right, verify smooth clipping
# 4. Verify file size badge shows correct sizes and percentage
# 5. Test on mobile viewport -- verify touch dragging works
# 6. Click "New Image", verify dropzone reappears
# 7. Verify component works when images have different aspect ratios
```

### Commit

```
feat: add before/after preview slider with file size comparison

Draggable split-view comparing original and processed images. Includes
file size badge showing reduction percentage. Mouse and touch support.
```

---

## Task 12: Batch Processing & ZIP Download

Allow multiple files to be uploaded and processed through any tool. Return results as a ZIP file. Progress tracked via Server-Sent Events.

### Files to create

```
apps/api/src/lib/job-queue.ts              # p-queue wrapper with concurrency from env.CONCURRENT_JOBS
apps/api/src/routes/batch.ts               # POST /api/v1/batch/:toolId, GET /api/v1/jobs/:jobId/progress (SSE)
apps/api/src/lib/zip.ts                    # Create ZIP from multiple output files using archiver
apps/web/src/components/common/batch-progress.tsx  # Per-file progress bars with SSE listener
apps/web/src/hooks/use-sse.ts              # Hook for consuming SSE endpoint
```

### Files to modify

```
apps/api/src/index.ts                      # Register batch routes
apps/api/package.json                      # Add p-queue, archiver dependencies
apps/web/src/pages/tool-page.tsx           # Show batch progress UI when multiple files uploaded
apps/web/src/stores/file-store.ts          # Add batch processing state (per-file progress)
apps/web/src/components/common/dropzone.tsx # Already supports multiple -- no changes needed
```

### Key interfaces

```typescript
// lib/job-queue.ts
import PQueue from 'p-queue';

export const jobQueue: PQueue;    // concurrency: env.CONCURRENT_JOBS
export interface QueuedJob {
  jobId: string;
  toolId: string;
  files: string[];
  settings: Record<string, unknown>;
  progress: Map<string, { status: string; progress: number }>;
}
export function enqueueJob(job: QueuedJob): void;

// routes/batch.ts
// POST /api/v1/batch/:toolId
// Body: multipart with multiple files + settings JSON
// Response: { jobId: string, totalFiles: number }
//
// GET /api/v1/jobs/:jobId/progress
// Response: SSE stream
// Events:
//   data: { status: "processing", progress: 45, currentFile: "photo3.jpg", completedFiles: 4, totalFiles: 10 }
//   data: { status: "completed", downloadUrl: "/api/v1/download/:jobId/results.zip" }
//   data: { status: "failed", error: "...", failedFile: "photo7.psd" }
//
// GET /api/v1/download/:jobId/results.zip
// Response: ZIP file with all processed images

// lib/zip.ts
export async function createZip(files: Array<{ path: string; name: string }>): Promise<Buffer>;

// web hooks/use-sse.ts
export function useSSE<T>(url: string | null): {
  data: T | null;
  error: string | null;
  connected: boolean;
};

// web components/common/batch-progress.tsx
interface BatchProgressProps {
  jobId: string;
  totalFiles: number;
  onComplete: (downloadUrl: string) => void;
}
// Renders:
// - Overall progress bar (X of Y files completed)
// - Per-file status list (filename + icon: pending/processing/done/failed)
// - Download ZIP button when complete
// - Partial failure notice with list of failed files
```

### Steps

- [ ] Add `p-queue` and `archiver` to `apps/api/package.json`, add `@types/archiver` to devDependencies
- [ ] Create `apps/api/src/lib/job-queue.ts` -- instantiate `PQueue` with `concurrency: env.CONCURRENT_JOBS`. Export `enqueueJob` that adds a processing function to the queue. Store active jobs in a `Map<string, QueuedJob>` for progress lookup
- [ ] Create `apps/api/src/lib/zip.ts` -- use `archiver('zip')` to pack multiple files into a ZIP buffer. Accept an array of `{ path, name }` objects
- [ ] Create `apps/api/src/routes/batch.ts` -- batch endpoint: accept multiple files via multipart, generate jobId, create workspace, enqueue per-file processing tasks. Each task calls the same `process` function from the tool config. As each file completes, update the job's progress map. SSE endpoint: register on `GET /api/v1/jobs/:jobId/progress`, set `Content-Type: text/event-stream`, push events as files complete. When all files done, create ZIP in workspace and send final `completed` event with download URL. Handle partial failures: continue processing remaining files, report failed ones
- [ ] Create `apps/web/src/hooks/use-sse.ts` -- wrap `EventSource` in a React hook. Connect when URL is provided, parse `data` field as JSON, expose latest data and connection state. Clean up on unmount
- [ ] Create `apps/web/src/components/common/batch-progress.tsx` -- consume `useSSE` hook, render overall progress bar and per-file status list. "Download ZIP" button triggers `apiDownloadBlob`
- [ ] Update `apps/web/src/stores/file-store.ts` -- add batch state: `batchJobId`, `batchProgress` map, `isBatchMode` flag (true when files.length > 1)
- [ ] Modify `apps/web/src/pages/tool-page.tsx` -- when multiple files are uploaded, show "Process All (N files)" button instead of single-file process. After clicking, show `BatchProgress` component. Wire download to blob trigger
- [ ] Modify `apps/api/src/index.ts` -- register batch routes

### Test

```bash
# 1. Navigate to /resize
# 2. Upload 5 images at once
# 3. Set resize to 500x500
# 4. Click "Process All (5 files)"
# 5. Verify progress bar advances per file
# 6. Verify SSE events stream correctly (open DevTools Network tab -> EventStream)
# 7. On completion, click "Download ZIP"
# 8. Extract ZIP, verify all 5 images are 500x500
# 9. Test partial failure: include one invalid file (e.g., .txt renamed to .jpg)
# 10. Verify remaining files still process and failed file is reported
```

### Commit

```
feat: add batch processing with ZIP download and SSE progress tracking

Multiple files processed via p-queue with configurable concurrency.
Progress streamed via Server-Sent Events. Results packaged as ZIP.
Partial failure handling continues processing and reports failed files.
```

---

## Dependency Graph

```
Task 1 (Image Engine)
  └─> Task 2 (Upload/Download)
       └─> Task 3 (Route Factory)
            ├─> Task 4 (Resize)    ─> Task 11 (Before/After Preview)
            ├─> Task 5 (Crop)
            ├─> Task 6 (Rotate)
            ├─> Task 7 (Convert)
            ├─> Task 8 (Compress)  ─> Task 11 (Before/After Preview)
            ├─> Task 9 (Metadata)
            └─> Task 10 (Color)   ─> Task 11 (Before/After Preview)
                                      └─> Task 12 (Batch + ZIP)
```

Tasks 4-10 can be built in parallel once Task 3 is done. Task 11 can be built alongside tasks 4-10 but should be wired in after at least one tool exists. Task 12 depends on everything else.

## Total New Files

| Area | Count |
|------|-------|
| `packages/image-engine/src/` | 18 files (engine, types, 14 operations, format detect, 2 utils) |
| `apps/api/src/routes/` | 10 files (factory, 7 tool routes, batch, files) |
| `apps/api/src/lib/` | 4 files (workspace, file-validation, job-queue, zip) |
| `apps/api/src/plugins/` | 1 file (upload) |
| `apps/web/src/components/tools/` | 7 files (settings for each tool) |
| `apps/web/src/components/common/` | 4 files (image-cropper, before-after, file-size-badge, image-preview, batch-progress) |
| `apps/web/src/stores/` | 1 file (file-store) |
| `apps/web/src/hooks/` | 2 files (use-tool-processor, use-sse) |
| Tests | 1 file (image-engine operations) |
| **Total** | **~48 files** |
