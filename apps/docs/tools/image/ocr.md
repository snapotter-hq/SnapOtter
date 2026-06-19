---
description: Extract text from images using AI-powered optical character recognition.
---

# OCR / Text Extraction

Extract text from images using AI-powered optical character recognition. Supports multiple languages and quality tiers.

## API Endpoint

`POST /api/v1/tools/ocr`

**Processing:** Synchronous (returns extracted text directly, though progress is reported via SSE if a `clientJobId` is provided)

**Model bundle:** `ocr` (3-4 GB)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Image file (multipart) |
| quality | string | No | `"balanced"` | Quality tier: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | No | `"auto"` | Language hint: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | Pre-process image for better OCR accuracy |
| engine | string | No | - | Deprecated. Use `quality` instead. Maps `tesseract` to `fast`, `paddleocr` to `balanced` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Response (200 OK)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progress (SSE, optional)

If a `clientJobId` is provided, progress events are streamed:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes

- Requires the `ocr` model bundle to be installed (3-4 GB).
- Unlike most AI tools, OCR returns a synchronous JSON response with extracted text (not an image download URL).
- Uses a fallback chain: if a higher-quality tier crashes (e.g., PaddleOCR segfault), it automatically retries with the next lower tier.
- If a tier returns empty text without crashing, it also falls back to the next tier.
- Quality tiers map to engines: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Supports HEIC/HEIF, RAW, TGA, PSD, EXR, and HDR input formats via automatic decoding.
