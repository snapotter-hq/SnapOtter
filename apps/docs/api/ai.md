# AI engine

The `@stirling-image/ai` package wraps Python ML models in TypeScript functions. Each operation spawns a Python subprocess, processes the image, and returns the result. The bridge layer handles serialization and error propagation.

All model weights are bundled in the Docker image during the build. No downloads happen at runtime.

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

**Model:** [LaMa](https://github.com/advimman/lama) (Large Mask Inpainting)

Takes an image and a mask (white = area to erase, black = keep). Returns the inpainted image.

**Python script:** `packages/ai/python/inpaint.py`

## How the bridge works

The TypeScript bridge (`packages/ai/src/bridge.ts`) exposes a single function, `runPythonWithProgress`, that does the following for each AI call:

1. Writes the input image to a temp file in the workspace directory.
2. Spawns a Python subprocess with the appropriate script and arguments.
3. Parses JSON progress lines from stderr (e.g. `{"progress": 50, "stage": "Processing..."}`) and forwards them via an `onProgress` callback for real-time SSE streaming.
4. Reads stdout for JSON output.
5. Reads the output image from the filesystem.
6. Cleans up temp files.

If the Python process exits with a non-zero code, the bridge extracts a user-friendly error from stderr/stdout and throws. Timeouts default to 5 minutes.
