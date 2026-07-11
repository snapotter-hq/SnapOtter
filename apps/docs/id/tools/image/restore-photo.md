---
description: "Perbaiki goresan, robekan, dan kerusakan pada foto lama dengan pipeline AI untuk restorasi, peningkatan wajah, dan warna."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: f8edc268c513
---

# Photo Restoration {#photo-restoration}

Perbaiki goresan, robekan, dan kerusakan pada foto lama menggunakan pipeline AI multi-langkah. Menggabungkan perbaikan goresan, peningkatan wajah, denoising, dan pewarnaan opsional.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Processing:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status via SSE)

**Model bundle:** `photo-restoration` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Berkas gambar (multipart) |
| scratchRemoval | boolean | No | `true` | Hapus goresan dan kerusakan permukaan |
| faceEnhancement | boolean | No | `true` | Tingkatkan wajah dalam foto yang direstorasi |
| fidelity | number | No | `0.7` | Fidelitas peningkatan wajah (0-1). Nilai lebih tinggi lebih mempertahankan fitur asli |
| denoise | boolean | No | `true` | Terapkan denoising pada hasil yang direstorasi |
| denoiseStrength | number | No | `25` | Kekuatan denoising (0-100) |
| colorize | boolean | No | `false` | Warnai foto yang direstorasi (untuk gambar grayscale) |
| colorizeStrength | number | No | `85` | Intensitas pewarnaan (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notes {#notes}

- Membutuhkan model bundle `photo-restoration` terpasang (4-5 GB).
- Pipeline menjalankan beberapa langkah AI secara berurutan: perbaikan goresan, peningkatan wajah (GFPGAN), denoising, dan opsional pewarnaan.
- Array `steps` dalam hasil menunjukkan langkah pemrosesan mana yang benar-benar dieksekusi.
- `scratchCoverage` adalah estimasi persentase area gambar yang mengalami kerusakan goresan.
- `fidelity` mengontrol seberapa kuat wajah ditingkatkan vs. mempertahankan tampilan asli. Nilai lebih rendah menghasilkan peningkatan lebih agresif; nilai lebih tinggi lebih konservatif.
- Opsi `colorize` secara otomatis mendeteksi apakah gambar berupa grayscale. Flag `isGrayscale` dalam hasil mengonfirmasi deteksi ini.
- Format output mengikuti format input secara otomatis.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, HDR, dan AVIF via dekode otomatis.
