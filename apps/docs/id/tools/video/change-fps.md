---
description: "Mengubah frame rate sebuah video."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: e94b80dc805d
---

# Change FPS {#change-fps}

Mengubah frame rate sebuah video ke nilai target antara 1 dan 120 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | Frame rate target (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- Menurunkan frame rate akan membuang frame dan mengurangi ukuran file. Menaikkannya akan menduplikasi frame untuk mengisi celah tetapi tidak menambahkan detail gerak yang sebenarnya.
- Nilai target umum: 24 (sinema), 30 (web/siaran), 60 (pemutaran mulus).
- Trek audio dipertahankan pada sample rate aslinya.
