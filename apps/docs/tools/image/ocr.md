---
description: Extract text from images locally with built-in Tesseract or the optional high-accuracy RapidOCR runtime.
---

# OCR / Text Extraction {#ocr-text-extraction}

Extract text from images without sending the image to an external service. The built-in `fast` tier uses Tesseract. The optional `balanced` and `best` tiers use RapidOCR with pinned PP-OCR ONNX models.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Processing:** OCR is always asynchronous. After validation and enqueueing, the endpoint immediately returns `202 Accepted` with a `jobId`. Follow the job's SSE progress stream to its terminal `complete` or `failed` event; a successful event's `result` contains the OCR fields.

**Accurate OCR pack:** Optional `ocr` runtime (about 208-234 MiB to download and 409-488 MiB installed, depending on the target). `fast` does not require this pack; the installer verifies the exact sizes bound by the signed index.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart), up to 512 MiB encoded and 40 megapixels decoded; a lower operator upload limit still applies |
| quality | string | No | Dynamic | Quality tier: `fast` (Tesseract), `balanced` (RapidOCR with the small PP-OCRv6 models), or `best` (the higher-accuracy medium PP-OCRv6 models with calibrated variant scoring) |
| language | string | No | `"auto"` | Language hint: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`. Fast does not support `ko` |
| enhance | boolean | No | Tier-dependent | Improve local contrast before recognition. Fast applies it directly; Balanced and Best retain the variant only when calibrated scoring improves the result. Defaults to `true` for `best` and `false` for `fast`/`balanced` |
| engine | string | No | - | Deprecated compatibility alias. Use `quality` instead. `tesseract` maps to `fast`; the legacy `paddleocr` value maps to `balanced` but does not load PaddlePaddle |

If `quality` and the deprecated `engine` field are both omitted, SnapOtter selects the highest available tier in this order: `best`, `balanced`, `fast`. Korean never selects `fast`; it uses `best`, then `balanced`, or returns the accurate-runtime install or compatibility error.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Accepted response (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress and result (SSE) {#progress-sse-optional}

Connect to `GET /api/v1/jobs/{jobId}/progress` with the `jobId` returned by the `202` response (or the supplied `clientJobId`). Keep the stream open until the terminal `complete` or `failed` event. A successful terminal frame contains the OCR output in `result`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

Processing failures arrive in the terminal `failed` event's `error` field; they are not returned as an HTTP `422` after enqueueing.

## Notes {#notes}

- `fast` is available in supported SnapOtter images for `auto`, `en`, `de`, `es`, `fr`, `zh`, and `ja`. It does not support Korean (`ko`); Korean requires the optional accurate OCR pack and `balanced` or `best`.
- Built-in Tesseract adds about 25 MiB to the official image. The accurate pack is stored in `/data/ai`, not baked into the image.
- The accurate pack is published for the official Linux amd64 and arm64 containers. It deliberately uses ONNX Runtime's CPU provider, including on NVIDIA hosts, so it does not depend on CUDA libraries or GPU compatibility. Unsupported hosts receive an explicit incompatibility error for Korean instead of silently falling back to Fast.
- The successful terminal `result` includes both the extracted text in `text` and a downloadable `.txt` artifact in `downloadUrl`.
- SnapOtter honors an explicitly requested tier. If `balanced` or `best` is unavailable, the API returns `501` with `FEATURE_NOT_INSTALLED` or `FEATURE_INCOMPATIBLE`; it never silently downgrades the request to another tier. Explicit Fast or legacy `tesseract` with Korean returns `FEATURE_INCOMPATIBLE` and `fast-korean-unsupported` before queueing.
- A successful empty result remains an empty result. Runtime failures return an error instead of retrying with a lower-quality engine.
- The successful terminal `result` reports both `requestedQuality` and `actualQuality`, plus the engine, device, provider, runtime and model versions, and any warnings.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
- Oversized encoded inputs return `413`. Images over 40 megapixels and OCR responses over their bounded output limits are rejected instead of being partially processed.
