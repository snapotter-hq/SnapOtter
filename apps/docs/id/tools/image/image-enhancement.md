---
description: "Auto-enhance sekali klik yang menganalisis gambar dan mengoreksi eksposur, kontras, white balance, saturasi, dan ketajaman."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 166ad1e1880f
---

# Image Enhancement {#image-enhancement}

Peningkatan otomatis sekali klik dengan analisis cerdas. Menganalisis gambar dan menerapkan koreksi eksposur, kontras, white balance, saturasi, ketajaman, dan denoising.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Processing:** Sinkron (menggunakan factory `createToolRoute`, mengembalikan hasil secara langsung)

**Model bundle:** Tidak diperlukan untuk peningkatan dasar. Bundle `upscale-enhance` (5-6 GB) hanya digunakan ketika `deepEnhance` diaktifkan (untuk penghilangan noise AI melalui SCUNet).

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File gambar (multipart) |
| mode | string | No | `"auto"` | Mode peningkatan: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | No | `50` | Intensitas peningkatan keseluruhan (0-100) |
| corrections | object | No | semua `true` | Koreksi selektif yang akan diterapkan (lihat di bawah) |
| deepEnhance | boolean | No | `false` | Aktifkan penghilangan noise bertenaga AI (membutuhkan alat `noise-removal` terpasang) |

### Corrections Object {#corrections-object}

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Koreksi eksposur otomatis |
| contrast | boolean | `true` | Koreksi kontras otomatis |
| whiteBalance | boolean | `true` | Koreksi white balance otomatis |
| saturation | boolean | `true` | Koreksi saturasi otomatis |
| sharpness | boolean | `true` | Penajaman otomatis |
| denoise | boolean | `true` | Denoising ringan |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analyze Endpoint {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Menganalisis gambar dan mengembalikan rekomendasi koreksi tanpa menerapkannya.

### Parameters {#parameters-1}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file | file | Yes | File gambar (multipart) |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Response (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Notes {#notes}

- Alat ini menggunakan factory sinkron `createToolRoute`, jadi ia mengembalikan respons standar (bukan 202 async).
- Parameter `mode` menyesuaikan bagaimana koreksi dibobotkan (mis., mode portrait lebih lembut pada rona kulit, mode landscape meningkatkan saturasi).
- Ketika `deepEnhance` diaktifkan dan alat `noise-removal` (SCUNet) terpasang, satu tahap denoising AI tambahan diterapkan setelah koreksi standar.
- Endpoint analyze berguna untuk melihat pratinjau koreksi apa yang akan diterapkan sebelum menetapkannya.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR melalui decoding otomatis.
