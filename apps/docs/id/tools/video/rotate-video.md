---
description: "Memutar atau membalik sebuah video."
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 1ab72e809197
---

# Rotate Video {#rotate-video}

Memutar video sebesar 90, 180, atau 270 derajat, atau membaliknya secara horizontal maupun vertikal.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | Transformasi yang diterapkan: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - Putar 90 derajat searah jarum jam
- **ccw90** - Putar 90 derajat berlawanan arah jarum jam
- **180** - Putar 180 derajat
- **hflip** - Balik secara horizontal (cermin)
- **vflip** - Balik secara vertikal

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

- Rotasi sebesar 90 atau 270 derajat menukar lebar dan tinggi video.
- Operasi balik (hflip, vflip) tidak mengubah dimensi video.
