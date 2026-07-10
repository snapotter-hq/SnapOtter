---
description: Extract text from images using AI-powered optical character recognition.
---

# OCR / Text Extraction {#ocr-text-extraction}

Extract text from images using AI-powered optical character recognition. Supports multiple languages and quality tiers.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Processing:** Synchronous JSON response. If `clientJobId` is provided, progress is also reported through SSE.

**Model bundle:** `ocr` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| quality | string | No | `"balanced"` | Quality tier: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | No | `"auto"` | Language hint: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | Pre-process image for better OCR accuracy |
| engine | string | No | - | Deprecated. Use `quality` instead. Maps `tesseract` to `fast`, `paddleocr` to `balanced` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

If a `clientJobId` form field is provided, progress events are streamed:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- Requires the `ocr` model bundle to be installed (5-6 GB).
- OCR returns extracted text directly rather than an image download URL.
- Uses a fallback chain: if a higher-quality tier crashes (e.g., PaddleOCR segfault), it automatically retries with the next lower tier.
- If a tier returns empty text without crashing, it also falls back to the next tier.
- Quality tiers map to engines: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
