# AI engine

The `@stirling-image/ai` package wraps Python ML models in TypeScript functions. A persistent Python dispatcher process pre-imports heavy ML libraries at startup and keeps them warm in memory, eliminating the cold-start latency that would otherwise occur on every request. If the dispatcher is unavailable, the bridge falls back to spawning a fresh subprocess per call.

All model weights are bundled in the Docker image during the build. No downloads happen at runtime.

::: tip GPU acceleration
The Docker image includes CUDA-accelerated ML libraries on amd64. Add `--gpus all` to your Docker run command to enable GPU acceleration. The image auto-detects your GPU and falls back to CPU if none is available.
:::

## Background removal

Removes the background from an image and returns a transparent PNG.

**Model:** BiRefNet models via [rembg](https://github.com/danielgatis/rembg)

| Parameter | Type | Description |
|---|---|---|
| `model` | string | Model name. Default: `birefnet-general`. Available models: `birefnet-general`, `birefnet-general-lite`, `birefnet-matting`, `birefnet-portrait`, `bria-rmbg`, `u2net`. |
| `alphaMatting` | boolean | Use alpha matting for finer edge detail |
| `alphaMattingForegroundThreshold` | number | Foreground threshold for alpha matting (0-255) |
| `alphaMattingBackgroundThreshold` | number | Background threshold for alpha matting (0-255) |

A Phase 2 effects endpoint is also available at `POST /api/v1/tools/remove-background/effects`. After removing the background, you can apply post-processing effects such as replacement backgrounds, blur, and drop shadows.

**Python script:** `packages/ai/python/remove_bg.py`

## Upscaling

Increases image resolution using AI super-resolution.

**Model:** [RealESRGAN](https://github.com/xinntao/Real-ESRGAN) with Lanczos fallback

| Parameter | Type | Description |
|---|---|---|
| `scale` | number | Upscale factor (2-8) |
| `model` | string | Model selection: `auto`, `realesrgan`, or `lanczos`. Default: `auto`. |
| `faceEnhance` | boolean | Enable face enhancement for better facial detail |
| `denoise` | number | Denoise strength (0-1). Higher values remove more noise but may lose detail. |
| `format` | string | Output format (e.g. `png`, `webp`, `jpeg`) |
| `quality` | number | Output quality for lossy formats |

Returns the upscaled image along with the original and new dimensions.

**Python script:** `packages/ai/python/upscale.py`

## OCR (text recognition)

Extracts text from images. Three quality tiers are available, each trading speed for accuracy.

**Models:**
- `fast` - [Tesseract](https://github.com/tesseract-ocr/tesseract) for quick extraction
- `balanced` - [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) PP-OCRv5 for general-purpose use
- `best` - PaddleOCR-VL 1.5 vision-language model for maximum accuracy

| Parameter | Type | Description |
|---|---|---|
| `quality` | string | Quality tier: `fast`, `balanced`, or `best`. Default: `balanced`. |
| `language` | string | Language code: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`. Default: `auto`. |
| `enhance` | boolean | Apply image preprocessing to improve recognition accuracy |

Returns structured results with text content, bounding boxes, and confidence scores for each detected text region.

**Python script:** `packages/ai/python/ocr.py`

## Face detection and blurring

Detects faces in an image and applies a blur to each detected region.

**Model:** [MediaPipe](https://github.com/google/mediapipe) Face Detection

| Parameter | Type | Description |
|---|---|---|
| `blurRadius` | number | Blur radius for detected faces (1-100). Default: `30`. |
| `sensitivity` | number | Detection sensitivity (0-1). Lower values require higher confidence. Default: `0.5`. |

Returns the blurred image along with metadata about each detected face region (bounding box coordinates and confidence score).

**Python script:** `packages/ai/python/detect_faces.py`

## Object erasing (inpainting)

Removes objects from images by filling in the area with generated content that matches the surroundings.

**Model:** [LaMa](https://github.com/advimman/lama) (Large Mask Inpainting) via ONNX Runtime

Takes an image and a mask file (white = area to erase, black = keep). Returns the inpainted image. GPU acceleration is available via ONNX CUDAExecutionProvider when a compatible GPU is detected.

**Python script:** `packages/ai/python/inpaint.py`

## Content-aware resize (seam carving)

Intelligently resizes images by removing or inserting seams - paths of least visual importance. This preserves the main subject and structure of the image while changing its dimensions.

**Engine:** `caire` Go binary

| Parameter | Type | Description |
|---|---|---|
| `width` | number | Target width in pixels |
| `height` | number | Target height in pixels |
| `protectFaces` | boolean | Use face detection to protect facial regions from seam removal |
| `blurRadius` | number | Gaussian blur radius for energy map computation (0-20) |
| `sobelThreshold` | number | Edge detection threshold for energy computation (1-20) |
| `square` | boolean | Force output to a square aspect ratio |

## Smart crop

Automatically crops images to focus on the most important region. Combines Sharp attention/entropy strategies with MediaPipe face detection to find the optimal crop area.

**Models:** Sharp (attention/entropy) + [MediaPipe](https://github.com/google/mediapipe) Face Detection

Three modes are available:

- **subject** - Uses Sharp's attention strategy to find the most visually interesting region.
- **face** - Uses MediaPipe face detection to center the crop on detected faces.
- **trim** - Removes uniform borders and whitespace from the edges of the image.

Parameters vary by mode. See the interactive API reference at `/api/docs` for the full parameter list for each mode.

## How the bridge works

The TypeScript bridge (`packages/ai/src/bridge.ts`) exposes a single function, `runPythonWithProgress`, that does the following for each AI call:

1. Writes the input image to a temp file in the workspace directory.
2. Sends a JSON request to the persistent Python dispatcher via stdin (`packages/ai/python/dispatcher.py`). If the dispatcher isn't running, falls back to spawning a fresh subprocess.
3. Parses JSON progress lines from stderr (e.g. `{"progress": 50, "stage": "Processing..."}`) and forwards them via an `onProgress` callback for real-time SSE streaming.
4. Reads the JSON response from stdout.
5. Reads the output image from the filesystem.
6. Cleans up temp files.

The persistent dispatcher pre-imports rembg, torch, PaddleOCR, MediaPipe, and the LaMa ONNX model at startup. This means the first AI call after container start is fast instead of waiting for library imports. The dispatcher handles requests sequentially (Python's GIL) and reports readiness via a `{"ready": true}` message on stderr.

GPU detection is handled by `packages/ai/python/gpu.py`, which checks for CUDA availability at startup and configures each model to use GPU or CPU accordingly.

If the Python process exits with a non-zero code, the bridge extracts a user-friendly error from stderr/stdout and throws. Timeouts default to 5 minutes.
