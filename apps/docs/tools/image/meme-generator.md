---
description: Create memes with templates or custom images, styled text boxes, and font options.
---

# Meme Generator

Create memes using built-in templates or custom images. Add text with classic meme styling (bold, outlined text), multiple layout presets, and font choices.

## API Endpoint

`POST /api/v1/tools/meme-generator`

Accepts either:
- **Multipart form data** with an image file and a JSON `settings` field (custom image mode)
- **JSON body** with a `templateId` (template mode, no file upload needed)

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | No | - | Built-in meme template ID. If provided, no image upload is needed |
| textLayout | string | No | `"top-bottom"` | Text box layout: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | No | `[]` | Array of text box objects with `id` and `text` fields |
| fontFamily | string | No | `"anton"` | Font: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | No | auto | Font size in pixels (8 to 200). Auto-calculated if omitted |
| textColor | string | No | `"#ffffff"` | Text fill color |
| strokeColor | string | No | `"#000000"` | Text stroke/outline color |
| textAlign | string | No | `"center"` | Text alignment: `left`, `center`, `right` |
| allCaps | boolean | No | `true` | Convert text to uppercase |

### Text Boxes

Each entry in the `textBoxes` array should have:

| Field | Type | Description |
|-------|------|-------------|
| id | string | Box identifier matching the layout (e.g., `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | The meme text to display |

### Text Layout Box IDs

| Layout | Available Box IDs |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Example Request

Custom image with top and bottom text:

```bash
curl -X POST http://localhost:1349/api/v1/tools/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Using a built-in template (JSON body, no file upload):

```bash
curl -X POST http://localhost:1349/api/v1/tools/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notes

- Either `templateId` or an uploaded image file is required. Providing both uses the template.
- Templates define their own text box positions; the `textLayout` parameter is ignored when using templates.
- Text is rendered as SVG with stroke outlines for the classic meme look.
- Font size is auto-calculated to fit the text box if not explicitly set.
- Empty text boxes are skipped (no rendering occurs if all boxes are empty).
- The output filename includes the template ID when using templates (e.g., `meme-drake.png`).
- HEIC, RAW, PSD, and SVG inputs are automatically decoded before processing.
