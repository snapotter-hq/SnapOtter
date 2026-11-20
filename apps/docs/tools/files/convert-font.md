---
description: Convert fonts between TTF, OTF, WOFF, and WOFF2.
---

# Convert Font {#convert-font}

Convert a font file between TrueType (TTF), OpenType CFF (OTF), WOFF, and WOFF2. Use it to turn a desktop font into a web font, or to get a TTF out of an OTF for an app that only takes TrueType.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Accepts multipart form data with a `.ttf`, `.otf`, `.woff`, or `.woff2` file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `ttf` | Output format: `ttf`, `otf`, `woff`, or `woff2` |

## Example Request {#example-request}

OTF to TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF to WOFF2 for the web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Notes {#notes}

- WOFF and WOFF2 are compressed wrappers around the same font data, so converting to or from them keeps the outlines unchanged.
- OTF to TTF converts cubic (CFF) curves to quadratic TrueType curves. Each curve stays within 1 font unit of the original, which is invisible at normal sizes, but the conversion is not exactly reversible. TTF to OTF keeps the curve shapes and only rounds control points to whole font units.
- The font's embedding permissions (the OS/2 `fsType` field) are kept as they are.
- Font collections (`.ttc`) aren't supported. Variable TrueType fonts can't be converted to OTF, and variable CFF2 fonts can't be converted to TTF; convert those to WOFF or WOFF2 instead.
- Conversion runs in the Python document worker with the same timeout as the other document tools, not inside the API process.
