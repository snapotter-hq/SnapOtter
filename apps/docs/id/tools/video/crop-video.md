---
description: "Memotong sebuah region dari video."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: d39bff80ab88
---

# Crop Video {#crop-video}

Memotong sebuah region persegi panjang dari video dengan menentukan ukuran dan posisi region tersebut.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | Lebar region potong dalam piksel (minimum 16) |
| height | integer | Yes | - | Tinggi region potong dalam piksel (minimum 16) |
| x | integer | No | `0` | Offset horizontal dari sudut kiri atas |
| y | integer | No | `0` | Offset vertikal dari sudut kiri atas |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- Region potong harus muat di dalam dimensi video. Jika `x + width` atau `y + height` melebihi ukuran sumber, permintaan akan mengembalikan galat 400.
- Ukuran potong minimum adalah 16x16 piksel.
- Dimensi dibulatkan ke angka genap sebagaimana disyaratkan oleh sebagian besar codec video.
