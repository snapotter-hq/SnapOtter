---
description: "Mengubah sekumpulan gambar menjadi video slideshow."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: c0be97a6ba9d
---

# Images to Video {#images-to-video}

Mengubah sekumpulan gambar menjadi video slideshow dengan durasi per gambar, resolusi, dan frame rate yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Menerima multipart form data dengan dua gambar atau lebih dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Durasi tampil per gambar dalam detik (0.5-10) |
| resolution | string | No | `"720p"` | Resolusi keluaran: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Frame rate keluaran (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Menerima 2-60 file gambar per permintaan. Gambar muncul di video sesuai urutan unggahan.
- Gambar diubah ukurannya dan diberi padding agar pas dengan resolusi target sambil mempertahankan rasio aspek.
- Opsi resolusi `square` menghasilkan video 1080x1080, berguna untuk media sosial.
- Format keluaran selalu MP4 (H.264).
