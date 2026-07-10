---
description: "Mengonversi klip video menjadi gambar WebP animasi."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: a91d22f8854f
---

# Video to WebP {#video-to-webp}

Mengonversi klip video menjadi gambar WebP animasi dengan frame rate, lebar, dan kualitas yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Frame rate keluaran (1-30) |
| width | integer | No | `480` | Lebar keluaran dalam piksel (16-1920). Tinggi diskalakan secara proporsional |
| quality | integer | No | `75` | Kualitas kompresi WebP (1-100) |
| loop | boolean | No | `true` | Mengulang animasi |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- WebP animasi menghasilkan file lebih kecil daripada GIF dengan dukungan warna lebih baik (palet 24-bit vs 8-bit).
- Nilai `quality` yang lebih rendah menghasilkan file lebih kecil dengan mengorbankan ketepatan visual.
- Setel `loop` ke `false` untuk animasi yang seharusnya diputar sekali lalu berhenti.
