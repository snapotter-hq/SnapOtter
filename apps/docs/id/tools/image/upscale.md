---
description: "Memperbesar gambar 2x hingga 4x dengan super-resolusi AI Real-ESRGAN sambil mempertahankan detail halus."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: 0aaaa70e54a8
---

# Image Upscaling {#image-upscaling}

Peningkatan super-resolusi AI menggunakan Real-ESRGAN. Memperbesar gambar 2x-4x sambil mempertahankan detail.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Processing:** Asinkron (mengembalikan 202, poll `/api/v1/jobs/{jobId}/progress` untuk status melalui SSE)

**Model bundle:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File gambar (multipart) |
| scale | number | No | `2` | Faktor pembesaran (mis., 2, 3, 4) |
| model | string | No | `"auto"` | Model yang digunakan (mis., `auto`, nama model tertentu) |
| faceEnhance | boolean | No | `false` | Menerapkan peningkatan wajah selama pembesaran |
| denoise | number | No | `0` | Kekuatan denoising (0 = nonaktif) |
| format | string | No | `"auto"` | Format keluaran: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | No | `95` | Kualitas keluaran (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Notes {#notes}

- Memerlukan model bundle `upscale-enhance` untuk diinstal (5-6 GB).
- Menggunakan Real-ESRGAN jika tersedia; kembali ke interpolasi Lanczos jika model AI tidak tersedia.
- Opsi `faceEnhance` menerapkan pemulihan wajah GFPGAN selama pembesaran untuk kualitas wajah yang lebih baik.
- Untuk format keluaran yang tidak dapat dipratinjau di browser (HEIC, JXL, TIFF), pratinjau WebP dihasilkan bersama keluaran utama.
- Mendukung format masukan HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR melalui pendekodean otomatis.
