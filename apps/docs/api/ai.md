---
description: AI engine reference with all local ML tools. Background removal, upscaling, OCR, face detection, photo restoration, and more.
---

# AI Engine Reference {#ai-engine-reference}

The `@snapotter/ai` package coordinates native tools and Python runtimes for local ML operations. Most ML tools use a persistent Python sidecar for fast warm starts. OCR is intentionally separate: `fast` invokes the native Tesseract binary, while `balanced` and `best` use a dedicated persistent JSONL dispatcher pinned to the active immutable RapidOCR generation under `/data/ai/v3`. Each request holds a generation lease. During an upgrade, SnapOtter runs a smoke test on the candidate before activation, atomically switches to the new dispatcher, then drains the old generation before garbage collection.

NVIDIA CUDA is auto-detected and used by runtimes that support it. OCR uses CPU on every host, including systems with NVIDIA GPUs, avoiding CUDA and driver coupling for this tool.

Intel/AMD iGPU acceleration through VA-API, Quick Sync, or OpenCL is not supported for AI inference today. Mapping `/dev/dri` into a container does not accelerate these Python sidecar tools unless a CUDA-capable NVIDIA GPU is available.

19 Python sidecar AI tools across four modalities (image, audio, video, document), plus 2 tools with optional AI capabilities. All models run locally - no internet required after initial model download.

## Architecture {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 +-- Native Tesseract + Ghostscript (fast image/PDF OCR)
 |
 +-- Isolated OCR runtime (persistent JSONL dispatcher)
 |     `-- RapidOCR + ONNX Runtime CPU + pinned PP-OCR models
 |
 `-- Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

A separate "docs" dispatcher profile replaces the AI allowlist with document-processing scripts (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) and skips heavy ML imports.

**Timeouts:** 300 s default; OCR and BiRefNet background removal get 600 s.

## Feature Bundles {#feature-bundles}

AI models are packaged by shared dependency stack, not one archive per tool. A feature bundle can enable several tools when they use the same model family, Python wheels, or native libraries. This keeps the release Docker image smaller and avoids storing duplicate copies of the same background matting, face detection, OCR, restoration, and speech models.

The Docker image ships the application plus the common runtime. Large model archives are downloaded on demand into the persistent `/data/ai` volume, then reused by every tool that needs them. If a bundle is already installed because another tool needed it, enabling a new dependent tool does not download that bundle again.

Most AI tools require one or more feature bundles before they can run. The admin UI installs those by tool through `POST /api/v1/admin/tools/:toolId/features/install`, which resolves the full bundle list, skips bundles that are already installed, and queues only the missing downloads. For example, enabling Passport Photo on a fresh instance queues `background-removal` and `face-detection`; enabling it after Background Removal is already installed queues only `face-detection`. OCR is the exception because `fast` needs no pack; install its optional accurate runtime through the UI or `POST /api/v1/admin/features/ocr/install`.

| Bundle | Size | Shared dependency group | Tools that use it |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet background matting | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | MediaPipe face detection and landmarks | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa inpainting/outpainting and DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, denoising | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | scratch repair and restoration pipeline | restore-photo |
| `ocr` | ~208-234 MiB download / ~409-488 MiB installed | Optional RapidOCR 3.9.1, ONNX Runtime 1.20.1, and pinned PP-OCR models | ocr, ocr-pdf (`balanced` and `best` only) |
| `transcription` | ~600 MB | faster-whisper speech-to-text models | transcribe-audio, auto-subtitles |

Tools with cross-bundle dependencies:

| Tool | Required bundles | Why |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Removes the background, then uses face landmarks to frame the crop to passport and ID photo rules. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Detects faces before running GFPGAN or CodeFormer enhancement on the selected face regions. |

A tool is available only when all of its required bundles are installed, except OCR: its built-in `fast` tier remains available without the optional OCR pack. Partial installs are valid and are handled incrementally: installed bundles are reused, missing bundles are shown as downloads, and queued installs run one at a time so the shared Python environment is not modified concurrently.

### Accurate OCR runtime installation {#accurate-ocr-runtime-installation}

The accurate OCR pack is a platform-specific runtime for the official Linux amd64 or Linux arm64 container. The amd64 build uses Python 3.12; the arm64 build uses Python 3.11. Both builds run RapidOCR through ONNX Runtime's `CPUExecutionProvider`, so the same pack works on CPU-only and NVIDIA Docker hosts. The accurate runtime requires at least 4 GiB of effective memory: the configured container cgroup limit, otherwise host memory. A system below that signed compatibility minimum is rejected before download. This requirement does not apply to built-in Fast OCR. Bare-metal builds are rejected because their libc and Python ABI cannot be inferred safely; Fast OCR remains available when the host provides Tesseract and Ghostscript. Fast supports `auto`, `en`, `de`, `es`, `fr`, `zh`, and `ja`, but not Korean (`ko`). Korean therefore requires a supported accurate runtime and a `balanced` or `best` tier; unsupported hosts receive an explicit incompatibility response rather than a silent Fast fallback.

The optional artifact is about 208-234 MiB compressed and 409-488 MiB extracted, depending on architecture. The signed index binds the exact compressed and extracted byte counts enforced by the installer. Built-in Tesseract adds about 25 MiB to the official image and needs no files in `/data/ai`.

Online installation fetches a signed release index and the exact content-addressed artifact for the current platform. SnapOtter verifies the Ed25519 index signature, artifact size, SHA-256 digest, model digests, paths, file modes, and staged smoke test before atomically activating the new generation. A failed install leaves the prior healthy generation active.

For air-gapped installation, upload both the release's `ocr-runtime-index.json` and matching OCR runtime archive to `POST /api/v1/admin/features/import` using multipart fields named `index` and `archive`. Offline import applies the same signature, hash, extraction, compatibility, and smoke-test checks as online installation; an archive without its trusted signed index is rejected.

---

## Background Removal {#background-removal}

**Tool route:** `remove-background`
**Model:** rembg with BiRefNet (default) or U2-Net variants

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | - | Model variant (optional override) |
| `backgroundType` | string | `"transparent"` | One of: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Hex color for solid background |
| `gradientColor1` | string | - | First gradient color |
| `gradientColor2` | string | - | Second gradient color |
| `gradientAngle` | number | - | Gradient angle in degrees |
| `blurEnabled` | boolean | - | Enable background blur effect |
| `blurIntensity` | number (0-100) | - | Blur intensity |
| `shadowEnabled` | boolean | - | Enable drop shadow on subject |
| `shadowOpacity` | number (0-100) | - | Shadow opacity |
| `outputFormat` | string | - | Output format: `png`, `webp`, or `avif` |
| `edgeRefine` | integer (0-3) | - | Edge refinement level |
| `decontaminate` | boolean | - | Remove color bleed from edges |

## Background Replace {#background-replace}

**Tool route:** `background-replace`
**Model:** rembg / BiRefNet (shared with remove-background)

Removes the background and replaces it with a solid color or gradient.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Background mode |
| `color` | string | `"#ffffff"` | Background hex color (when `backgroundType` is `color`) |
| `gradientColor1` | string | - | First gradient hex color |
| `gradientColor2` | string | - | Second gradient hex color |
| `gradientAngle` | integer (0-360) | `180` | Gradient angle in degrees |
| `feather` | integer (0-20) | `0` | Edge feathering radius |
| `format` | `"png"` \| `"webp"` | `"png"` | Output format |

## Blur Background {#blur-background}

**Tool route:** `blur-background`
**Model:** rembg / BiRefNet (shared with remove-background)

Blurs the background while keeping the subject sharp.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Blur intensity |
| `feather` | integer (0-20) | `0` | Edge feathering radius |
| `format` | `"png"` \| `"webp"` | `"png"` | Output format |

## Image Upscaling {#image-upscaling}

**Tool route:** `upscale`
**Model:** RealESRGAN (with Lanczos fallback when unavailable)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Upscale factor |
| `model` | string | `"auto"` | Model variant |
| `faceEnhance` | boolean | `false` | Apply GFPGAN face enhancement pass |
| `denoise` | number | `0` | Denoising strength |
| `format` | string | `"auto"` | Output format override |
| `quality` | number | `95` | Output quality (1-100) |

## OCR / Text Extraction {#ocr-text-extraction}

**Tool route:** `ocr`
**Models:** Tesseract (`fast`); RapidOCR with PP-OCRv6 small models (`balanced`); PP-OCRv6 medium models with calibrated variant scoring (`best`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dynamic | Processing tier. Omitted quality selects the highest available tier in this order: `best`, `balanced`, `fast`. Korean never selects `fast`; without an accurate tier it returns the accurate-runtime install or compatibility error |
| `language` | string | `"auto"` | Language: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`. Fast does not support `ko` |
| `enhance` | boolean | Tier-dependent | Improve local contrast. Fast applies it directly; accurate tiers keep the variant only when calibrated scoring improves OCR. Defaults on for Best |
| `engine` | string | - | Deprecated compatibility alias. Maps `tesseract` to `fast` and the legacy `paddleocr` value to `balanced`; it does not load PaddlePaddle |

Returns extracted text plus provenance metadata: engine, requested and actual quality, device, provider, degradation state, warnings, and accurate-runtime/model versions when applicable. Explicit quality requests never fall back to another tier. If `balanced` or `best` is unavailable, the API returns `FEATURE_NOT_INSTALLED` or `FEATURE_INCOMPATIBLE` instead of silently running `fast`. Explicit Fast or legacy `tesseract` with Korean returns `FEATURE_INCOMPATIBLE`, `compatibilityReason: "fast-korean-unsupported"`, and accurate-pack guidance before a job is queued.

## PDF OCR {#pdf-ocr}

**Tool route:** `ocr-pdf`
**Models:** Same tier system as image OCR

Extracts text from scanned PDF documents using AI-powered OCR, page by page.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dynamic | Processing tier. Omitted quality selects the highest available tier in this order: `best`, `balanced`, `fast`. Korean never selects `fast`; without an accurate tier it returns the accurate-runtime install or compatibility error |
| `language` | string | `"auto"` | Language: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`. Fast does not support `ko` |
| `pages` | string | `"all"` | Page selection: `"all"`, `"1-3"`, `"1,3,5"` |
| `enhance` | boolean | Tier-dependent | Improve local contrast. Fast applies it directly; accurate tiers keep the variant only when calibrated scoring improves OCR. Defaults on for Best |
| `engine` | string | - | Deprecated compatibility alias. Maps `tesseract` to `fast` and the legacy `paddleocr` value to `balanced`; it does not load PaddlePaddle |

The same no-downgrade and Korean compatibility rules apply to PDF OCR. PDF pages are rasterized before recognition, and one request can select at most 50 pages.

## Face / PII Blur {#face-pii-blur}

**Tool route:** `blur-faces`
**Model:** MediaPipe face detection

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Gaussian blur radius |
| `sensitivity` | number (0-1) | `0.5` | Detection confidence threshold |

## Face Enhancement {#face-enhancement}

**Tool route:** `enhance-faces`
**Models:** GFPGAN, CodeFormer

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Enhancement model |
| `strength` | number (0-1) | `0.8` | Enhancement strength |
| `sensitivity` | number (0-1) | `0.5` | Face detection threshold |
| `onlyCenterFace` | boolean | `false` | Enhance only the most central face |

## AI Colorization {#ai-colorization}

**Tool route:** `colorize`
**Model:** DDColor (with OpenCV DNN fallback)

Converts black-and-white or grayscale photos to full color.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Color saturation strength |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Model variant |

## Noise Removal {#noise-removal}

**Tool route:** `noise-removal`
**Model:** SCUNet (tiered denoising pipeline)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Processing tier |
| `strength` | number (0-100) | `50` | Denoising strength |
| `detailPreservation` | number (0-100) | `50` | How much detail to preserve; higher keeps more texture |
| `colorNoise` | number (0-100) | `30` | Color noise reduction strength |
| `format` | string | `"original"` | Output format: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Output encoding quality |

## Red Eye Removal {#red-eye-removal}

**Tool route:** `red-eye-removal`

Detects face landmarks, locates eye regions, and corrects red-channel oversaturation.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Red pixel detection threshold |
| `strength` | number (0-100) | `70` | Correction strength |
| `format` | string | - | Output format override (optional) |
| `quality` | number (1-100) | `90` | Output quality |

## Photo Restoration {#photo-restoration}

**Tool route:** `restore-photo`

Multi-step pipeline for old or damaged photos: scratch/tear detection and repair, face enhancement, denoising, and optional colorization.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Detect and repair scratches, tears |
| `faceEnhancement` | boolean | `true` | Apply face enhancement pass |
| `fidelity` | number (0-1) | `0.7` | Face enhancement strength (higher = more conservative) |
| `denoise` | boolean | `true` | Apply denoising pass |
| `denoiseStrength` | number (0-100) | `25` | Denoising strength |
| `colorize` | boolean | `false` | Colorize after restoration |
| `colorizeStrength` | number (0-100) | `85` | Colorization intensity |

## Passport Photo {#passport-photo}

**Tool route:** `passport-photo`
**Models:** MediaPipe face landmarks + BiRefNet background removal

Two-phase workflow: analyze (detect face + remove background) then generate (crop, resize, tile). Supports 37+ countries across 6 regions.

### Phase 1: Analyze {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Accepts an image file (multipart). Returns face landmark data, a base64 preview, and image dimensions.

### Phase 2: Generate {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Accepts a JSON body with the Phase 1 results plus generation settings:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `jobId` | string | (required) | Job ID from Phase 1 |
| `filename` | string | (required) | Original filename from Phase 1 |
| `countryCode` | string | (required) | ISO country code (e.g., `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Document type |
| `bgColor` | string | `"#FFFFFF"` | Background color hex |
| `printLayout` | string | `"none"` | Print layout: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Max file size in KB (0 = no limit) |
| `dpi` | number (72-1200) | `300` | Output DPI |
| `customWidthMm` | number | - | Custom width in mm (overrides country spec) |
| `customHeightMm` | number | - | Custom height in mm (overrides country spec) |
| `zoom` | number (0.5-3) | `1` | Zoom factor |
| `adjustX` | number | `0` | Horizontal position adjustment |
| `adjustY` | number | `0` | Vertical position adjustment |
| `landmarks` | object | (required) | Landmarks from Phase 1 |
| `imageWidth` | number | (required) | Image width from Phase 1 |
| `imageHeight` | number | (required) | Image height from Phase 1 |

## Object Erasing (Inpainting) {#object-erasing-inpainting}

**Tool route:** `erase-object`
**Model:** LaMa via ONNX Runtime

The mask is sent as a **second file part** (fieldname `mask`), not as base64. White pixels in the mask indicate areas to erase. The `format` and `quality` settings are sent as top-level form fields.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `file` | file | (required) | Source image (multipart) |
| `mask` | file | (required) | Mask image (multipart, fieldname `mask`, white = erase) |
| `format` | string | `"auto"` | Output format: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Output quality |

CUDA-accelerated when an NVIDIA GPU is available.

## AI Canvas Expand {#ai-canvas-expand}

**Tool route:** `ai-canvas-expand`
**Model:** LaMa-based outpainting

Expands the canvas of an image in any direction and fills new areas with AI-generated content that matches the existing image.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Pixels to extend at the top |
| `extendRight` | integer | `0` | Pixels to extend at the right |
| `extendBottom` | integer | `0` | Pixels to extend at the bottom |
| `extendLeft` | integer | `0` | Pixels to extend at the left |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Quality tier |
| `format` | string | `"auto"` | Output format: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Output quality |

At least one extend direction must be greater than 0.

## Smart Crop {#smart-crop}

**Tool route:** `smart-crop`
**Model:** MediaPipe face detection (face mode only)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Crop strategy: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategy for subject mode |
| `width` | integer | - | Output width |
| `height` | integer | - | Output height |
| `padding` | integer (0-50) | `0` | Padding percentage around subject |
| `facePreset` | string | `"head-shoulders"` | Preset framing when `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Face detection threshold |
| `threshold` | integer (0-255) | `30` | Background detection threshold (trim mode) |
| `padToSquare` | boolean | `false` | Pad trimmed result to a square |
| `padColor` | string | `"#ffffff"` | Background color for square padding |
| `targetSize` | integer | - | Target size for padded output (pixels) |
| `quality` | integer (1-100) | - | Output quality |

Legacy `mode` values `attention` and `content` are accepted and mapped to `subject` and `trim` respectively.

**Face presets:**

| Preset | Best for |
|--------|---------|
| `closeup` | Headshots |
| `head-shoulders` | Profile photos |
| `upper-body` | LinkedIn / formal |
| `half-body` | Full upper body |

## Transcribe Audio {#transcribe-audio}

**Tool route:** `transcribe-audio`
**Model:** faster-whisper

Converts speech to text. Supports plain text, SRT, and VTT output formats.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Language: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Output format |

## Auto Subtitles {#auto-subtitles}

**Tool route:** `auto-subtitles`
**Model:** faster-whisper (extracts audio from video, then transcribes)

Generates subtitle files from a video's audio track.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Language: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Output subtitle format |

## PNG Transparency Fixer {#png-transparency-fixer}

**Tool route:** `transparency-fixer`
**Model:** BiRefNet HR-matting (2048x2048 resolution)

Fixes "fake transparent" PNGs where the background was removed but left behind fringing, halos, or semi-transparent artifacts. Uses BiRefNet's high-resolution matting model to produce a clean alpha channel, then applies configurable defringe processing to remove color contamination along edges.

**OOM fallback chain:** If BiRefNet HR-matting exceeds available memory, the tool automatically falls back to `birefnet-general`, then to `u2net`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Edge defringe strength to remove color contamination |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Output image format |
| `removeWatermark` | boolean | `false` | Apply watermark removal pre-processing (median filter) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Tools with Optional AI Capabilities {#tools-with-optional-ai-capabilities}

The following tools are not Python sidecar tools but use AI features when certain options are enabled.

### Image Enhancement {#image-enhancement}

**Tool route:** `image-enhancement`
**Engine:** Analysis-based (Sharp histogram and statistics)

Analyzes the image and applies automatic corrections for exposure, contrast, white balance, saturation, sharpness, and noise. Supports scene-specific modes.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Scene mode for tuning corrections |
| `intensity` | number (0-100) | `50` | Overall correction strength |
| `corrections.exposure` | boolean | `true` | Apply exposure correction |
| `corrections.contrast` | boolean | `true` | Apply contrast correction |
| `corrections.whiteBalance` | boolean | `true` | Apply white balance correction |
| `corrections.saturation` | boolean | `true` | Apply saturation correction |
| `corrections.sharpness` | boolean | `true` | Apply sharpness correction |
| `corrections.denoise` | boolean | `true` | Apply denoising |
| `deepEnhance` | boolean | `false` | Enable AI noise removal via SCUNet (requires `upscale-enhance` bundle) |

An additional analysis endpoint is available at `POST /api/v1/tools/image/image-enhancement/analyze` which returns the detected corrections without applying them.

### Content-Aware Resize (Seam Carving) {#content-aware-resize-seam-carving}

**Tool route:** `content-aware-resize`
**Engine:** Go `caire` binary (not Python - no GPU benefit)

Intelligently resizes images by removing low-energy seams, preserving important content.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `width` | number | - | Target width |
| `height` | number | - | Target height |
| `protectFaces` | boolean | `false` | Protect detected face regions (requires `face-detection` bundle) |
| `blurRadius` | number (0-20) | `4` | Pre-blur for energy calculation |
| `sobelThreshold` | number (1-20) | `2` | Edge sensitivity threshold |
| `square` | boolean | `false` | Force square output |
