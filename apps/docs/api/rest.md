---
description: Complete REST API reference. Tool endpoints, batch processing, pipelines, file library, authentication, teams, and admin operations.
---

# REST API Reference

Interactive API docs with request/response examples are available at [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Machine-readable specs:
- `/api/v1/openapi.yaml` - OpenAPI 3.1 spec
- `/llms.txt` - LLM-friendly summary
- `/llms-full.txt` - Complete LLM-friendly docs

## Authentication

All endpoints require authentication unless `AUTH_ENABLED=false`.

### Session Token

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/resize \
  -H "Authorization: Bearer <session-token>"
```

Sessions expire after 7 days (configurable via `SESSION_DURATION_HOURS`).

### API Keys

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/resize \
  -H "Authorization: Bearer si_<your-key>"
```

Keys are prefixed `si_` and stored as scrypt hashes - the raw key is shown once and never retrievable again.

### Auth Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Public | Login, get session token |
| `POST` | `/api/auth/logout` | Auth | Destroy current session |
| `GET` | `/api/auth/session` | Auth | Validate current session |
| `POST` | `/api/auth/change-password` | Auth | Change own password (invalidates all other sessions + API keys) |
| `GET` | `/api/auth/users` | Admin | List all users |
| `POST` | `/api/auth/register` | Admin | Create a new user |
| `PUT` | `/api/auth/users/:id` | Admin | Update user role or team |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Reset user's password |
| `DELETE` | `/api/auth/users/:id` | Admin | Delete a user |
| `GET` | `/api/v1/config/auth` | Public | Check if authentication is enabled (`{ authEnabled: bool }`) |

### Permissions

| Permission | Admin | User |
|-----------|:-----:|:----:|
| Use tools | ✓ | ✓ |
| Own files/pipelines/API keys | ✓ | ✓ |
| See all users' files/pipelines/keys | ✓ | - |
| Write settings | ✓ | - |
| Manage users & teams | ✓ | - |
| Manage branding | ✓ | - |

## Health Check

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Public | Basic health check. Returns `{"status":"healthy","version":"..."}` with 200, or `{"status":"unhealthy"}` with 503 if the database is unreachable. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Detailed diagnostics including uptime, storage mode, database status, queue state, and GPU availability. |

## Using Tools

Every tool follows the same pattern:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

- Upload is `multipart/form-data`.
- `settings` is a JSON string with tool-specific options.
- Response is the processed file directly (or a ZIP for batch).
- Progress is tracked via SSE (see [Progress Tracking](#progress-tracking)).

## Tools Reference

### Essentials

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `resize` | Resize | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, plus 23 social media presets |
| `crop` | Crop | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Rotate & Flip | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Convert | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Compress | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optimization

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `optimize-for-web` | Optimize for Web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Strip Metadata | - |
| `edit-metadata` | Edit Metadata | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Bulk Rename | `pattern` (supports `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Image to PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Favicon Generator | `padding`, `backgroundColor`, `borderRadius` - generates all standard sizes |

### Adjustments

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `adjust-colors` | Adjust Colors | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Sharpening | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Replace Color | `sourceColor`, `targetColor` (replacement), `makeTransparent`, `tolerance` |
| `color-blindness` | Color Blindness Simulation | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, default "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixelate | `blockSize` (2-128), `region` ({left, top, width, height} for partial pixelation) |
| `vignette` | Vignette | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### AI Tools

All AI tools run on your hardware (CPU or NVIDIA GPU). No internet required.

| Tool ID | Name | AI Model | Key settings |
|---------|------|---------|-------------|
| `remove-background` | Remove Background | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Image Upscaling | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Object Eraser | LaMa (ONNX) | Mask sent as second file part (fieldname `mask`), `format`, `quality` |
| `ocr` | OCR / Text Extraction | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Face / PII Blur | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Smart Crop | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Image Enhancement | Analysis-based | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Face Enhancement | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI Colorization | DDColor | `intensity`, `model` |
| `noise-removal` | Noise Removal | Tiered denoising | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Red Eye Removal | Face landmark + color analysis | `sensitivity`, `strength` |
| `restore-photo` | Photo Restoration | Multi-step pipeline | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Passport Photo | MediaPipe landmarks | `country` (37 countries), `printLayout` (4x6/A4/none), `backgroundColor` |
| `content-aware-resize` | Content-Aware Resize | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG Transparency Fixer | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Background Replace | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Blur Background | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |

### Watermark & Overlay

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `watermark-text` | Text Watermark | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Image Watermark | `opacity`, `position`, `scale` - second file is the watermark |
| `text-overlay` | Text Overlay | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Image Composition | `x`, `y`, `opacity`, `blend` - second file is layered on top |
| `meme-generator` | Meme Generator | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Supports template mode (JSON body with `templateId`) or custom image mode (multipart with file). |

### Utilities

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `info` | Image Info | - (returns width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | Image Compare | `mode` (side-by-side/overlay/diff), `diffThreshold` - second file is the comparison target |
| `find-duplicates` | Find Duplicates | `threshold` (perceptual hash distance, default 8) - multi-file |
| `color-palette` | Color Palette | `count` (dominant color count), `format` (hex/rgb) |
| `qr-generate` | QR Code Generator | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (optional file) |
| `barcode-read` | Barcode Reader | - (auto-detects QR, EAN, Code128, DataMatrix, etc.) |
| `image-to-base64` | Image to Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML to Image | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogram | `scale` (linear/log) - returns RGB histogram chart + per-channel stats |
| `lqip-placeholder` | LQIP Placeholder | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Barcode Generator | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). JSON body, no file upload. |

### Layout & Composition

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `collage` | Collage / Grid | `template` (25+ layouts), `gap`, `backgroundColor`, `borderRadius` - multi-file |
| `stitch` | Stitch / Combine | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - multi-file |
| `split` | Image Splitting | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Border & Frame | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Beautify Screenshot | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Circle Crop | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Image Pad | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite Sheet | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - multi-file (2-64 images) |

### Format & Conversion

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `svg-to-raster` | SVG to Raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Image to SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF Tools | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), action-specific params |
| `pdf-to-image` | PDF to Image | `pages` (all/range), `format`, `dpi`, `quality` |
| `gif-webp` | GIF/WebP Converter | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Video Tools

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `convert-video` | Convert Video | `format` (mp4/mov/webm), `quality` (high/balanced/small) |
| `compress-video` | Compress Video | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Trim Video | `startS`, `endS`, `precise` (bool, frame-accurate cut) |
| `mute-video` | Mute Video | - |
| `video-to-gif` | Video to GIF | `fps` (1-30), `width`, `startS`, `durationS` (max 60s) |
| `resize-video` | Resize Video | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Crop Video | `width`, `height`, `x`, `y` |
| `rotate-video` | Rotate Video | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Change FPS | `fps` (1-120) |
| `video-color` | Video Color | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Video Speed | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Reverse Video | - (max 5 minutes) |
| `video-loudnorm` | Normalize Audio | - (EBU R128) |
| `aspect-pad` | Aspect Pad | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Blur Pad | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Watermark Video | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Stabilize Video | `smoothing` (5-60, in frames) |
| `gif-to-video` | GIF to Video | `format` (mp4/webm) |
| `video-to-webp` | Video to WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Video to Frames | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Merge Videos | - (multi-file, normalized to first video's resolution) |
| `replace-audio` | Replace Audio | - (video + audio file, two files) |
| `burn-subtitles` | Burn Subtitles | `fontSize` (8-72) - video + subtitle file |
| `embed-subtitles` | Embed Subtitles | `language` (ISO 639-2/B code) - video + subtitle file |
| `extract-subtitles` | Extract Subtitles | - (outputs SRT) |
| `images-to-video` | Images to Video | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - multi-file |
| `video-metadata` | Clean Video Metadata | - |
| `auto-subtitles` | Auto Subtitles (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Extract Audio | `format` (mp3/wav/m4a) |

### Audio Tools

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `convert-audio` | Convert Audio | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Trim Audio | `startS`, `endS` |
| `volume-adjust` | Volume Adjust | `gainDb` (-30 to 30) |
| `normalize-audio` | Normalize Audio | - (EBU R128, -16 LUFS) |
| `fade-audio` | Fade Audio | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Reverse Audio | - |
| `audio-speed` | Audio Speed | `factor` (0.25-4) |
| `pitch-shift` | Pitch Shift | `semitones` (-12 to 12) |
| `audio-channels` | Audio Channels | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Silence Removal | `thresholdDb` (-80 to -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Noise Reduction | `strength` (light/medium/strong) |
| `merge-audio` | Merge Audio | `format` (mp3/wav/flac/m4a) - multi-file |
| `split-audio` | Split Audio | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Ringtone Maker | `startS`, `durationS` (1-30) |
| `waveform-image` | Waveform Image | `width`, `height`, `color` (hex) |
| `audio-metadata` | Audio Metadata | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Transcribe Audio (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Document Tools

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `merge-pdf` | Merge PDFs | - (multi-file, up to 20 PDFs) |
| `split-pdf` | Split PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Compress PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Rotate PDF | `angle` (90/180/270), `range` (page range) |
| `extract-pages` | Extract Pages | `range` (qpdf syntax, e.g. "1-5,8,10-z") |
| `remove-pages` | Remove Pages | `pages` (qpdf range to remove) |
| `organize-pdf` | Organize PDF | `order` (qpdf page order, e.g. "3,1,2,5-z") |
| `protect-pdf` | Protect PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Unlock PDF | `password` |
| `repair-pdf` | Repair PDF | - |
| `linearize-pdf` | Web-Optimize PDF | - (linearize for fast web viewing) |
| `grayscale-pdf` | Grayscale PDF | - |
| `pdfa-convert` | PDF/A Convert | - (archival PDF/A-2) |
| `crop-pdf` | Crop PDF | `margin` (0-2000 points) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Booklet PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Watermark PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF Page Numbers | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Flatten PDF | - (bakes forms and annotations) |
| `redact-pdf` | Redact PDF | `terms` (string[]), `caseSensitive` (bool) |
| `pdf-to-text` | PDF to Text | - |
| `pdf-to-word` | PDF to Word | - |
| `pdf-metadata` | PDF Metadata | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Convert Document | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Convert Presentation | `format` (pptx/odp) |
| `convert-spreadsheet` | Convert Spreadsheet | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel to PDF | - |
| `word-to-pdf` | Word to PDF | - |
| `powerpoint-to-pdf` | PowerPoint to PDF | - |
| `html-to-pdf` | HTML to PDF | - (remote resources disabled) |
| `markdown-to-docx` | Markdown to Word | - |
| `markdown-to-html` | Markdown to HTML | - |
| `markdown-to-pdf` | Markdown to PDF | - (remote resources disabled) |
| `epub-convert` | Convert EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Convert to EPUB | - (accepts .docx, .md, .html, .txt) |
| `ocr-pdf` | PDF OCR (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |

### Data Tools

| Tool ID | Name | Key settings |
|---------|------|-------------|
| `chart-maker` | Chart Maker | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV to Excel | `sheet` (worksheet number for XLSX input) - bidirectional |
| `csv-json` | CSV to JSON | `pretty` (bool) - bidirectional |
| `json-xml` | JSON to XML | `pretty` (bool) - bidirectional |
| `split-csv` | Split CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Merge CSVs | - (multi-file, matching columns) |
| `yaml-json` | YAML / JSON | - (bidirectional) |
| `xml-to-csv` | XML to CSV | - (auto-finds repeating elements) |
| `create-zip` | Create ZIP | - (multi-file, 2-50 files) |
| `extract-zip` | Extract ZIP | - (bomb-protected) |

### HTML to Image

Capture a webpage as an image. Unlike other tools, this endpoint accepts `application/json` instead of multipart form data (no file upload needed).

**Endpoint:** `POST /api/v1/tools/html-to-image`

**Content-Type:** `application/json`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | (required) | URL to capture (http/https only) |
| `format` | string | `"png"` | Output format: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Quality 1-100 (JPG/WebP only) |
| `fullPage` | boolean | `false` | Capture full scrollable page |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Custom viewport width 320-3840 |
| `viewportHeight` | number | `720` | Custom viewport height 320-2160 |

**Example:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Response:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Tool Sub-Routes

Some tools expose additional endpoints beyond the standard `POST /api/v1/tools/<toolId>`:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/tools/remove-background/effects` | Apply background effects (color/gradient/blur/shadow) without re-running AI. Uses cached mask from initial removal. |
| `POST` | `/api/v1/tools/edit-metadata/inspect` | Read existing EXIF/IPTC/XMP metadata from an image |
| `POST` | `/api/v1/tools/strip-metadata/inspect` | Inspect metadata fields before stripping |
| `POST` | `/api/v1/tools/passport-photo/analyze` | Phase 1: AI face detection + background removal. Returns face landmarks and cached data. |
| `POST` | `/api/v1/tools/passport-photo/generate` | Phase 2: Crop, resize, and tile using cached analysis. No AI re-run. |
| `POST` | `/api/v1/tools/gif-tools/info` | Get GIF metadata (frame count, dimensions, duration) |
| `POST` | `/api/v1/tools/pdf-to-image/info` | Get PDF metadata (page count, dimensions) |
| `POST` | `/api/v1/tools/pdf-to-image/preview` | Generate a preview of a specific PDF page |
| `POST` | `/api/v1/tools/svg-to-raster/batch` | Batch convert multiple SVGs to raster |
| `POST` | `/api/v1/tools/image-enhancement/analyze` | Analyze image quality and return enhancement recommendations |
| `POST` | `/api/v1/tools/optimize-for-web/preview` | Lightweight preview for live parameter tuning. Returns optimized image with size headers. |

## Batch Processing

Apply any tool to multiple files at once. Returns a ZIP archive.

```bash
curl -X POST http://localhost:1349/api/v1/tools/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Concurrency is controlled by `CONCURRENT_JOBS` (default: auto-detected from CPU cores). Set `MAX_BATCH_SIZE` to limit the number of files per batch (default: unlimited).

## Pipelines

### Execute a pipeline

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

Each step's output is the next step's input. Unlimited steps per pipeline by default (configurable via `MAX_PIPELINE_STEPS`).

### Save and manage pipelines

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Save a named pipeline (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | List saved pipelines (admins see all; users see own) |
| `DELETE` | `/api/v1/pipeline/:id` | Delete (owner or admin) |
| `GET` | `/api/v1/pipeline/tools` | List tool IDs valid for pipeline steps |

## Progress Tracking

Long-running jobs (AI tools, batch, pipelines) emit real-time progress via Server-Sent Events:

```bash
# Connect to the SSE stream (jobId returned in X-Job-Id response header)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress \
  -H "Authorization: Bearer <token>"
```

Event format:
```
data: {"progress":42,"status":"processing","message":"Upscaling frame 2/5"}
data: {"progress":100,"status":"completed"}
```

## File Library

Persistent file storage with version history.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Upload files to workspace (temp processing) |
| `POST` | `/api/v1/files/upload` | Upload files to the persistent file library |
| `POST` | `/api/v1/files/save-result` | Save a tool processing result as a new file version |
| `GET` | `/api/v1/files` | List saved files (paginated, with search) |
| `GET` | `/api/v1/files/:id` | Get file metadata + version chain |
| `GET` | `/api/v1/files/:id/download` | Download file |
| `GET` | `/api/v1/files/:id/thumbnail` | Get 300px JPEG thumbnail |
| `DELETE` | `/api/v1/files` | Bulk delete files and their version chains (body: `{ ids: [...] }`) |
| `POST` | `/api/v1/preview` | Generate a browser-compatible WebP preview (for HEIC/HEIF/RAW formats) |
| `GET` | `/api/v1/download/:jobId/:filename` | Download a processed file from a workspace |

To auto-save a tool result to the library, include `fileId` in the settings payload referencing an existing library file. The processed result will be saved as a new version.

## API Key Management

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Generate new key - shown once |
| `GET` | `/api/v1/api-keys` | Auth | List keys (name, id, lastUsedAt - not raw key) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Delete key |

## Teams

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | List teams |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Create team |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Rename team |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Delete team (cannot delete default team or teams with members) |

## Settings

Runtime key-value configuration (read by any authenticated user, write by admin only).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Get all settings |
| `PUT` | `/api/v1/settings` | Bulk update settings (JSON body with key-value pairs) |
| `GET` | `/api/v1/settings/:key` | Get a specific setting by key |

Known keys: `disabledTools` (JSON array of tool IDs), `enableExperimentalTools` (bool string), `loginAttemptLimit` (number).

## Roles

Custom role management with granular permissions.

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | List all roles with user counts |
| `POST` | `/api/v1/roles` | Admin (`users:manage`) | Create a custom role (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`users:manage`) | Update a custom role (cannot modify built-in roles) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`users:manage`) | Delete a custom role (cannot delete built-in roles; affected users revert to `user` role) |

Available permissions: `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`.

## Audit Log

Admin-only endpoint for reviewing security-relevant actions.

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Paginated audit log with optional filters |

Query parameters:

| Parameter | Description |
|-----------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Entries per page (default: 50, max: 100) |
| `action` | Filter by action type (e.g. `ROLE_CREATED`, `ROLE_DELETED`) |
| `from` | Filter entries after this ISO 8601 date |
| `to` | Filter entries before this ISO 8601 date |

## Analytics

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Public | Get analytics configuration (PostHog key, Sentry DSN, sample rate). Returns empty values if `ANALYTICS_ENABLED=false`. |
| `PUT` | `/api/v1/user/analytics` | Auth | Set the current user's analytics consent (`enabled: true/false`) or defer with `remindLater: true`. |

## Features / AI Bundles

Manage AI feature bundles (install/uninstall AI model packages in the Docker environment).

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | List all feature bundles and their install status |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Install a feature bundle (async, returns `jobId` for progress tracking) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Uninstall a feature bundle and clean up model files |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Get total disk usage of AI models |

## Meme Templates

Supporting API for the meme generator tool.

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | List all available meme templates with text box positions |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Serve full-size template image |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Serve template thumbnail |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Serve font file used for meme text rendering |

## Error Responses

All errors return JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid request / validation failed |
| 401 | Not authenticated |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 413 | File too large (see `MAX_UPLOAD_SIZE_MB`) |
| 429 | Rate limited (see `RATE_LIMIT_PER_MIN`) |
| 500 | Internal server error |
