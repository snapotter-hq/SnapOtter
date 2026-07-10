---
description: "Penghilangan noise dan grain bertenaga AI dengan opsi kualitas multi-tingkat."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 0d5fc72e4c42
---

# Noise Removal {#noise-removal}

Penghilangan noise dan grain bertenaga AI dengan opsi kualitas multi-tingkat, menggunakan sidecar Python (model SCUNet).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Processing:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status via SSE)

**Model bundle:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Berkas gambar (multipart) |
| tier | string | No | `"balanced"` | Tingkat kualitas: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | No | `50` | Kekuatan denoising (0-100) |
| detailPreservation | number | No | `50` | Seberapa banyak detail yang dipertahankan (0-100). Nilai lebih tinggi menyimpan lebih banyak tekstur |
| colorNoise | number | No | `30` | Kekuatan pengurangan noise warna (0-100) |
| format | string | No | `"original"` | Format output: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | `90` | Kualitas enkode output (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notes {#notes}

- Membutuhkan model bundle `upscale-enhance` terpasang (5-6 GB).
- Tingkat kualitas menukar kecepatan dengan kualitas: `quick` paling cepat dengan denoising dasar, `maximum` menggunakan pendekatan multi-pass paling menyeluruh.
- Parameter `detailPreservation` krusial untuk subjek bertekstur (kain, rambut, dedaunan). Nilai lebih tinggi mencegah denoiser menghaluskan detail halus.
- Saat `format` diatur ke `"original"`, format output mengikuti format berkas input.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR via dekode otomatis.
