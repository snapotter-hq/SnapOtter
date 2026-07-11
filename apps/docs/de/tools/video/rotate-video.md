---
description: "Ein Video drehen oder spiegeln."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: e2166bb11365
---

# Rotate Video {#rotate-video}

Ein Video um 90, 180 oder 270 Grad drehen oder es horizontal oder vertikal spiegeln.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Nimmt Multipart-Formulardaten mit einer Videodatei und einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Anzuwendende Transformation: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Um 90 Grad im Uhrzeigersinn drehen
- **ccw90** - Um 90 Grad gegen den Uhrzeigersinn drehen
- **180** - Um 180 Grad drehen
- **hflip** - Horizontal spiegeln (Spiegelbild)
- **vflip** - Vertikal spiegeln

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Drehungen um 90 oder 270 Grad vertauschen Breite und Höhe des Videos.
- Spiegeloperationen (hflip, vflip) ändern die Videoabmessungen nicht.
