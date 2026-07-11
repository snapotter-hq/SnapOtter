---
description: "Hasilkan placeholder gambar berkualitas rendah berukuran mungil dengan data URI base64."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: b64493b73d7c
---

# LQIP Placeholder {#lqip-placeholder}

Hasilkan placeholder gambar berkualitas rendah (LQIP) berukuran mungil dari gambar sumber. Mengembalikan file placeholder kecil beserta data URI base64, tag `<img>` HTML siap pakai, dan cuplikan `background-image` CSS untuk penyematan langsung.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Menerima multipart form data dengan file gambar dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `16` | Lebar target dalam piksel (4-64) |
| blur | number | No | `2` | Radius blur untuk strategi blur (0-20) |
| strategy | string | No | `"blur"` | Strategi placeholder: `blur`, `pixelate`, atau `solid` |
| format | string | No | `"webp"` | Format output: `webp`, `png`, atau `jpeg` |
| quality | integer | No | `50` | Kualitas output (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Notes {#notes}

- Field `dataUri` berisi data URI lengkap, siap digunakan pada atribut `src` atau CSS tanpa permintaan tambahan.
- Field `html` dan `css` menyediakan cuplikan salin-tempel untuk kasus penggunaan umum.
- Strategi `blur` menghasilkan thumbnail lembut yang buram. Strategi `pixelate` membuat mosaik berkotak-kotak. Strategi `solid` mengembalikan satu warna rata-rata.
- Ukuran placeholder tipikal adalah 200-500 byte, sehingga cocok untuk disisipkan langsung di HTML.
- Tinggi dihitung secara otomatis untuk mempertahankan rasio aspek gambar sumber.
- Input HEIC, RAW, PSD, dan SVG di-decode otomatis sebelum pemrosesan.
