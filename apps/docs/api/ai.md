# AI Engine Reference

The `@ashim/ai` package bridges Node.js to a **persistent Python sidecar** for all ML operations. The dispatcher process stays alive between requests for fast warm-start performance. GPU is auto-detected at startup and used when available.

14 AI tool routes. All models run locally - no internet required after initial model download.

## Architecture

```
Node.js Tool Route
      │
      ▼
 @ashim/ai bridge.ts
      │ (stdin/stdout JSON + stderr progress events)
      ▼
 Python dispatcher (persistent process)
      │
      ├─ remove_bg.py        (rembg / BiRefNet)
      ├─ upscale.py          (RealESRGAN)
      ├─ inpaint.py          (LaMa ONNX)
      ├─ ocr.py              (PaddleOCR / Tesseract)
      ├─ detect_faces.py     (MediaPipe)
      ├─ face_landmarks.py   (MediaPipe landmarks)
      ├─ enhance_faces.py    (GFPGAN / CodeFormer)
      ├─ colorize.py         (DDColor)
      ├─ noise_removal.py    (tiered denoising)
      ├─ red_eye_removal.py  (landmark + color analysis)
      ├─ restore.py          (scratch repair + enhancement + denoising)
      └─ seam_carving        (Go caire binary - not Python)
```

**Timeouts:** 300 s default; OCR and BiRefNet background removal get 600 s.

## Background Removal

**Function:** `removeBackground`  
**Tool route:** `remove-background`  
**Model:** rembg with BiRefNet (default) or U2-Net variants

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | `birefnet-general` | Model variant - see table below |
| `alphaMattingForeground` | number (1–255) | 240 | Foreground threshold for alpha matting |
| `alphaMattingBackground` | number (1–255) | 10 | Background threshold for alpha matting |
| `returnMask` | boolean | false | Return the mask instead of the cutout |
| `backgroundColor` | string | - | Fill removed area (hex color or "transparent") |

**Available models:**

| Model ID | Best for |
|----------|---------|
| `birefnet-general` | General purpose (default) |
| `birefnet-portrait` | People / portraits |
| `birefnet-dis` | Dichotomous Image Segmentation |
| `birefnet-hrsod` | High-resolution salient objects |
| `birefnet-cod` | Camouflaged objects |
| `u2net` | Fast general purpose |
| `u2net_human_seg` | Human segmentation |
| `isnet-general-use` | High quality general |

## Image Upscaling

**Function:** `upscale`  
**Tool route:** `upscale`  
**Model:** RealESRGAN (with Lanczos fallback on CPU-constrained systems)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `scale` | 2 \| 4 | 4 | Upscale factor |
| `model` | string | `realesrgan-x4plus` | Model variant |
| `faceEnhance` | boolean | false | Apply GFPGAN face enhancement pass |
| `denoise` | number (0–1) | 0.5 | Denoising strength |
| `format` | string | - | Output format override |
| `quality` | number | 95 | Output quality (for JPEG/WebP) |

## OCR / Text Extraction

**Function:** `extractText`  
**Tool route:** `ocr`  
**Models:** Tesseract (fast), PaddleOCR PP-OCRv5 (balanced), PaddleOCR-VL 1.5 (best)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `quality` | `fast` \| `balanced` \| `best` | `balanced` | Processing tier |
| `language` | string | `en` | Language code (ISO 639-1) |
| `enhance` | boolean | false | Pre-process image to improve OCR accuracy |

Returns structured results with bounding boxes, confidence scores, and extracted text blocks.

## Face / PII Blur

**Function:** `blurFaces`  
**Tool route:** `blur-faces`  
**Model:** MediaPipe face detection

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `blurRadius` | number | 30 | Gaussian blur radius |
| `sensitivity` | number (0–1) | 0.5 | Detection confidence threshold |

## Face Enhancement

**Function:** `enhanceFaces`  
**Tool route:** `enhance-faces`  
**Models:** GFPGAN, CodeFormer

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | `gfpgan` \| `codeformer` | `gfpgan` | Enhancement model |
| `strength` | number (0–1) | 0.7 | Enhancement strength |
| `sensitivity` | number (0–1) | 0.5 | Face detection threshold |
| `centerFace` | boolean | false | Focus enhancement on center face only |

## AI Colorization

**Function:** `colorize`  
**Tool route:** `colorize`  
**Model:** DDColor (with OpenCV DNN fallback)

Converts black-and-white or grayscale photos to full color.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `intensity` | number (0–1) | 0.85 | Color saturation strength |
| `model` | string | `ddcolor` | Model variant |

## Noise Removal

**Function:** `noiseRemoval`  
**Tool route:** `noise-removal`

Three-tier denoising pipeline (fast: OpenCV bilateral filter; balanced: frequency-domain; best: deep learning model).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `quality` | `fast` \| `balanced` \| `best` | `balanced` | Processing tier |
| `strength` | number (0–1) | 0.5 | Denoising strength |
| `preserveDetail` | boolean | true | Edge-preserving mode |
| `colorNoise` | boolean | false | Target color noise specifically |

## Red Eye Removal

**Function:** `removeRedEye`  
**Tool route:** `red-eye-removal`

Detects face landmarks, locates eye regions, and corrects red-channel oversaturation.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sensitivity` | number (0–1) | 0.5 | Red pixel detection threshold |
| `strength` | number (0–1) | 0.9 | Correction strength |

## Photo Restoration

**Function:** `restorePhoto`  
**Tool route:** `restore-photo`

Multi-step pipeline for old or damaged photos: scratch/tear detection and repair → face enhancement → denoising → optional colorization.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `auto` \| `light` \| `heavy` | `auto` | Restoration intensity |
| `scratchRemoval` | boolean | true | Detect and repair scratches, tears |
| `faceEnhancement` | boolean | true | Apply face enhancement pass |
| `fidelity` | number (0–1) | 0.7 | Face enhancement strength |
| `denoise` | boolean | true | Apply denoising pass |
| `denoiseStrength` | number (0–100) | 40 | Denoising strength |
| `colorize` | boolean | false | Colorize after restoration |

## Passport Photo

**Function:** Uses `detectFaceLandmarks` + `removeBackground`  
**Tool route:** `passport-photo`  
**Model:** MediaPipe face landmarks

Generates government-compliant ID photos. Supports **37 countries** across 6 regions (Americas, Europe, Asia, Africa, Oceania, Middle East). Each spec includes physical dimensions, DPI, head-height ratio, eye-line position, and background color requirements.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `country` | string | `us` | ISO country code (see list in UI) |
| `printLayout` | `4x6` \| `A4` \| `none` | `none` | Output as print sheet or standalone |
| `backgroundColor` | string | country default | Background fill color |

## Object Erasing (Inpainting)

**Function:** `inpaint`  
**Tool route:** `erase-object`  
**Model:** LaMa via ONNX Runtime

| Parameter | Type | Required | Description |
|-----------|------|---------|-------------|
| `maskData` | string | Yes | Base64-encoded PNG mask (white = erase) |
| `maskThreshold` | number (0–255) | No | Threshold for mask binarization |

GPU-accelerated when an NVIDIA GPU is available.

## Smart Crop

**Function:** Uses MediaPipe + Sharp attention/entropy  
**Tool route:** `smart-crop`  
**Model:** MediaPipe face detection

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `subject` \| `face` \| `trim` | `subject` | Crop strategy |
| `width` | number | - | Output width |
| `height` | number | - | Output height |
| `facePreset` | string | - | Preset framing when `mode=face` |

**Face presets:**

| Preset | Head ratio | Best for |
|--------|-----------|---------|
| `close-up` | 1.8× face | Headshots |
| `head-and-shoulders` | 2.8× face | Profile photos |
| `upper-body` | 4.5× face | LinkedIn / formal |
| `half-body` | 7.0× face | Full upper body |

## Image Enhancement

**Function:** `analyzeImage` + `applyCorrections`  
**Tool route:** `image-enhancement`  
**Engine:** Analysis-based (Sharp histogram and statistics)

Analyzes the image and applies automatic corrections for exposure, contrast, white balance, saturation, sharpness, and noise. Supports scene-specific modes.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `auto` \| `portrait` \| `landscape` \| `low-light` \| `food` \| `document` | `auto` | Scene mode for tuning corrections |
| `intensity` | number (0-100) | 50 | Overall correction strength |
| `corrections.exposure` | boolean | true | Apply exposure correction |
| `corrections.contrast` | boolean | true | Apply contrast correction |
| `corrections.whiteBalance` | boolean | true | Apply white balance correction |
| `corrections.saturation` | boolean | true | Apply saturation correction |
| `corrections.sharpness` | boolean | true | Apply sharpness correction |
| `corrections.denoise` | boolean | true | Apply denoising |

An additional analysis endpoint is available at `POST /api/v1/tools/image-enhancement/analyze` which returns the detected corrections without applying them.

## Content-Aware Resize (Seam Carving)

**Function:** `seamCarve`  
**Tool route:** `content-aware-resize`  
**Engine:** Go `caire` binary (not Python - no GPU benefit)

Intelligently resizes images by removing or adding low-energy seams, preserving important content.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `width` | number | - | Target width |
| `height` | number | - | Target height |
| `protectFaces` | boolean | true | Protect detected face regions from seam removal |
| `blurRadius` | number | 0 | Pre-blur to reduce noise sensitivity |
| `sobelThreshold` | number | 10 | Edge sensitivity threshold |
| `square` | boolean | false | Force square output |

Max input edge before auto-downscaling: **1200 px**.
