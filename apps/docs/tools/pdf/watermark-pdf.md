---
description: Add a text watermark to every page of a PDF.
---

# Watermark PDF

Stamp a text watermark on every page of a PDF with configurable position, size, opacity, and rotation.

## API Endpoint

`POST /api/v1/tools/pdf/watermark-pdf`

Accepts multipart form data with a PDF file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Watermark text (1-200 characters) |
| position | string | No | `"c"` | Placement on the page: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `48` | Font size in points (6-72) |
| opacity | number | No | `0.3` | Watermark opacity (0.05-1) |
| rotation | number | No | `45` | Rotation angle in degrees (-180 to 180) |

### Position Values

- `tl` top-left, `tc` top-center, `tr` top-right
- `l` center-left, `c` center, `r` center-right
- `bl` bottom-left, `bc` bottom-center, `br` bottom-right

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes

- The watermark is rendered as a text overlay on each page.
- The same watermark text, position, and style are applied uniformly to all pages.
- Use lower opacity values (0.1-0.3) for subtle watermarks that do not obscure content.
