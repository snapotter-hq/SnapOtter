---
description: "Menempelkan watermark teks ke frame video."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 27e0b794e5ec
---

# Watermark Video {#watermark-video}

Menempelkan watermark teks ke setiap frame video dengan posisi, ukuran, opasitas, dan warna yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Teks watermark (1-200 karakter) |
| position | string | No | `"br"` | Posisi pada frame: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Ukuran font dalam piksel (8-120) |
| opacity | number | No | `0.5` | Opasitas watermark (0.05-1) |
| color | string | No | `"#ffffff"` | Warna heksadesimal untuk teks (mis. `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Kiri atas, **tc** - Tengah atas, **tr** - Kanan atas
- **l** - Kiri tengah, **c** - Tengah, **r** - Kanan tengah
- **bl** - Kiri bawah, **bc** - Tengah bawah, **br** - Kanan bawah

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
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

- Watermark dirender secara permanen ke dalam frame video dan tidak dapat dihapus setelah pemrosesan.
- Watermark menggunakan font sans-serif bawaan FFmpeg.
- Untuk watermark gambar, gunakan alat Watermark gambar sebagai gantinya.
