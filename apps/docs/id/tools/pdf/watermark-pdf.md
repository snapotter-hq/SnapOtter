---
description: "Tambahkan watermark teks ke setiap halaman PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: aa90847c5de7
---

# Watermark PDF {#watermark-pdf}

Cap watermark teks pada setiap halaman PDF dengan posisi, ukuran, opasitas, dan rotasi yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Teks watermark (1-200 karakter) |
| position | string | No | `"c"` | Penempatan pada halaman: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `48` | Ukuran font dalam poin (6-72) |
| opacity | number | No | `0.3` | Opasitas watermark (0.05-1) |
| rotation | number | No | `45` | Sudut rotasi dalam derajat (-180 sampai 180) |

### Position Values {#position-values}

- `tl` kiri-atas, `tc` tengah-atas, `tr` kanan-atas
- `l` tengah-kiri, `c` tengah, `r` tengah-kanan
- `bl` kiri-bawah, `bc` tengah-bawah, `br` kanan-bawah

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Watermark dirender sebagai overlay teks pada setiap halaman.
- Teks watermark, posisi, dan gaya yang sama diterapkan secara seragam ke semua halaman.
- Gunakan nilai opasitas yang lebih rendah (0.1-0.3) untuk watermark halus yang tidak menutupi konten.
