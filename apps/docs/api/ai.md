# AI engine

The `@stirling-image/ai` package wraps Python ML models in TypeScript functions. A persistent Python dispatcher process pre-imports heavy ML libraries at startup and keeps them warm in memory, eliminating the cold-start latency that would otherwise occur on every request. If the dispatcher is unavailable, the bridge falls back to spawning a fresh subprocess per call.

All model weights are bundled in the Docker image during the build. No downloads happen at runtime.

::: tip GPU acceleration
The Docker image includes CUDA-accelerated ML libraries on amd64. Add `--gpus all` to your Docker run command to enable GPU acceleration. The image auto-detects your GPU and falls back to CPU if none is available.
:::

## Background removal

Removes the background from an image and returns a transparent PNG.

**Model:** BiRefNet-Lite via [rembg](https://github.com/danielgatis/rembg)

| Parameter | Type | Description |
|---|---|---|
| `model` | string | Model name. Default: `birefnet-lite`. Options include `u2net`, `isnet-general-use`, and others supported by rembg. |
| `alphaMatting` | boolean | Use alpha matting for finer edge detail |
| `alphaMattingForegroundThreshold` | number | Foreground threshold for alpha matting (0-255) |
| `alphaMattingBackgroundThreshold` | number | Background threshold for alpha matting (0-255) |

**Python script:** `packages/ai/python/remove_bg.py`

## Upscaling

Increases image resolution using AI super-resolution.

**Model:** [RealESRGAN](https://github.com/xinntao/Real-ESRGAN)

| Parameter | Type | Description |
|---|---|---|
| `scale` | number | Upscale factor: `2` or `4` |

Returns the upscaled image along with the original and new dimensions.

**Python script:** `packages/ai/python/upscale.py`

## OCR (text recognition)

Extracts text from images.

**Model:** [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)

| Parameter | Type | Description |
|---|---|---|
| `language` | string | Language code (e.g. `en`, `ch`, `fr`, `de`) |

Returns structured results with text content, bounding boxes, and confidence scores for each detected text region.

**Python script:** `packages/ai/python/ocr.py`

## Face detection and blurring

Detects faces in an image and applies a blur to each detected region.

**Model:** [MediaPipe](https://github.com/google/mediapipe) Face Detection

| Parameter | Type | Description |
|---|---|---|
| `blurStrength` | number | How strongly to blur detected faces |

Returns the blurred image along with metadata about each detected face region (bounding box coordinates and confidence score).

**Python script:** `packages/ai/python/detect_faces.py`

## Object erasing (inpainting)

Removes objects from images by filling in the area with generated content that matches the surroundings.

**Model:** OpenCV TELEA algorithm

Takes an image and a mask (white = area to erase, black = keep). Returns the inpainted image.

**Python script:** `packages/ai/python/inpaint.py`

## How the bridge works

The TypeScript bridge (`packages/ai/src/bridge.ts`) exposes a single function, `runPythonWithProgress`, that does the following for each AI call:

1. Writes the input image to a temp file in the workspace directory.
2. Sends a JSON request to the persistent Python dispatcher via stdin (`packages/ai/python/dispatcher.py`). If the dispatcher isn't running, falls back to spawning a fresh subprocess.
3. Parses JSON progress lines from stderr (e.g. `{"progress": 50, "stage": "Processing..."}`) and forwards them via an `onProgress` callback for real-time SSE streaming.
4. Reads the JSON response from stdout.
5. Reads the output image from the filesystem.
6. Cleans up temp files.

The persistent dispatcher pre-imports rembg, OpenCV, NumPy, and Pillow at startup. This means the first AI call after container start is fast instead of waiting for library imports. The dispatcher handles requests sequentially (Python's GIL) and reports readiness via a `{"ready": true}` message on stderr.

If the Python process exits with a non-zero code, the bridge extracts a user-friendly error from stderr/stdout and throws. Timeouts default to 5 minutes.
