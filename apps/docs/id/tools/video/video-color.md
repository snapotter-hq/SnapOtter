---
description: "Menyesuaikan kecerahan, kontras, saturasi, dan gamma sebuah video."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 3fd38383e25f
---

# Video Color {#video-color}

Menyesuaikan kecerahan, kontras, saturasi, dan koreksi gamma pada sebuah video.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Penyesuaian kecerahan (-1 hingga 1) |
| contrast | number | No | `1` | Pengali kontras (0-4) |
| saturation | number | No | `1` | Pengali saturasi (0-3). Setel ke 0 untuk grayscale |
| gamma | number | No | `1` | Koreksi gamma (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Semua nilai pada nilai bawaannya (brightness 0, contrast 1, saturation 1, gamma 1) tidak menghasilkan perubahan.
- Menyetel saturation ke `0` mengonversi video menjadi grayscale.
- Nilai gamma di bawah 1 mencerahkan bayangan, sementara nilai di atas 1 menggelapkannya.
