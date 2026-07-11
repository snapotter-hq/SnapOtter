---
description: "Deteksi dan koreksi mata merah bertenaga AI yang disebabkan oleh flash kamera."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: ca509f56b766
---

# Red Eye Removal {#red-eye-removal}

Deteksi dan koreksi mata merah bertenaga AI yang disebabkan oleh flash kamera.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Processing:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status via SSE)

**Model bundle:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Berkas gambar (multipart) |
| sensitivity | number | No | `50` | Sensitivitas deteksi mata merah (0-100). Nilai lebih tinggi mendeteksi mata merah yang lebih halus |
| strength | number | No | `70` | Kekuatan koreksi (0-100). Seberapa agresif menetralkan warna merah |
| format | string | No | - | Format output (penimpaan opsional) |
| quality | number | No | `90` | Kualitas output (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Notes {#notes}

- Membutuhkan model bundle `face-detection` terpasang (200-300 MB).
- Pertama mendeteksi wajah, lalu menemukan area mata dalam setiap wajah, dan akhirnya mengidentifikasi serta mengoreksi piksel mata merah.
- Jumlah `facesDetected` menunjukkan berapa banyak wajah yang ditemukan; `eyesCorrected` adalah jumlah total mata individu yang mata merahnya dikoreksi.
- Output selalu PNG untuk pelestarian kualitas maksimum.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR via dekode otomatis.
