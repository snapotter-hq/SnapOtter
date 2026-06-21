---
description: Extract text from PDF documents using AI-powered OCR.
---

# PDF OCR

Extract text from PDF documents using AI-powered optical character recognition. Supports multiple quality tiers and languages. Requires the OCR feature bundle to be installed.

## API Endpoint

`POST /api/v1/tools/pdf/ocr-pdf`

Accepts multipart form data with a PDF file and an optional JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | OCR quality tier: `fast`, `balanced`, `best` |
| language | string | No | `"auto"` | Document language: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Page selection, e.g. `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response

Returns `202 Accepted`. Track progress via SSE at `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes

- Accepted input format: `.pdf`.
- This is an AI tool that requires the **OCR feature bundle** to be installed. If the bundle is not installed, the API returns `501 Not Implemented`.
- The `fast` quality tier uses a lighter model for quicker processing; `best` uses a more accurate model at the cost of speed.
- The `auto` language setting attempts to detect the document language automatically.
- You can target specific pages using ranges (`"1-3"`), comma-separated lists (`"1,3,5"`), or `"all"` for every page.
- For PDFs that already contain selectable text, consider using the faster [PDF to Text](./pdf-to-text) tool instead.
