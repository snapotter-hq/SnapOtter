---
description: Extract text from scanned PDFs locally with built-in Tesseract or the optional high-accuracy RapidOCR runtime.
---

# PDF OCR {#pdf-ocr}

Extract text from scanned PDF documents page by page without sending the PDF to an external service. The built-in `fast` tier uses Tesseract. The optional `balanced` and `best` tiers use RapidOCR with pinned PP-OCR ONNX models.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Accepts multipart form data with a PDF file and an optional JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | PDF file (multipart), up to 512 MiB encoded; a lower operator upload limit still applies |
| quality | string | No | Dynamic | OCR quality tier: `fast`, `balanced`, or `best` |
| language | string | No | `"auto"` | Document language: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`. Fast does not support `ko` |
| pages | string | No | `"all"` | Page selection, e.g. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | No | Tier-dependent | Improve local contrast before recognition. Fast applies it directly; Balanced and Best retain the variant only when calibrated scoring improves the result. Defaults to `true` for `best` and `false` for `fast`/`balanced` |
| engine | string | No | - | Deprecated compatibility alias. Use `quality` instead. `tesseract` maps to `fast`; the legacy `paddleocr` value maps to `balanced` but does not load PaddlePaddle |

If `quality` and the deprecated `engine` field are both omitted, SnapOtter selects the highest available tier in this order: `best`, `balanced`, `fast`. Korean never selects `fast`; it uses `best`, then `balanced`, or returns the accurate-runtime install or compatibility error.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

Returns `202 Accepted`. Track progress via SSE at `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Accepted input format: `.pdf`.
- `fast` is built in and adds about 25 MiB to the official image. `balanced` and `best` require the optional accurate OCR pack (about 208-234 MiB to download and 409-488 MiB installed, depending on the target).
- Fast supports `auto`, `en`, `de`, `es`, `fr`, `zh`, and `ja`, but not Korean (`ko`). Korean requires the accurate pack and `balanced` or `best`.
- The accurate pack supports official Linux amd64 and arm64 containers and uses ONNX Runtime on CPU, including on NVIDIA hosts. Unsupported hosts receive an explicit incompatibility error for Korean rather than a Fast fallback.
- An explicitly requested tier is never silently downgraded. If `balanced` or `best` is unavailable, the API returns `501` with `FEATURE_NOT_INSTALLED` or `FEATURE_INCOMPATIBLE`. Explicit Fast or legacy `tesseract` with Korean returns `FEATURE_INCOMPATIBLE` and `fast-korean-unsupported` before queueing.
- PDF pages are rasterized at high resolution before OCR. `best` runs the higher-accuracy medium PP-OCRv6 models and scores orientation and enhancement variants, improving recognition at the cost of speed.
- The `auto` language setting enables recognition across the supported script set; an explicit hint can improve results for a known document language.
- You can target specific pages using ranges (`"1-3"`), comma-separated lists (`"1,3,5"`), or `"all"` for every page.
- A request can process at most 50 pages. Rasterized scratch data is capped at 512 MiB and the aggregate UTF-8 OCR response is capped at 1,000,000 bytes; over-limit jobs fail rather than returning partial text.
- For PDFs that already contain selectable text, consider using the faster [PDF to Text](./pdf-to-text) tool instead.
