---
description: "Pulihkan dan pertajam wajah buram atau berkualitas rendah dalam gambar dengan model AI GFPGAN dan CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 66445313eca4
---

# Peningkatan Wajah {#face-enhancement}

Pulihkan dan tingkatkan wajah dalam gambar menggunakan model AI (GFPGAN/CodeFormer).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Pemrosesan:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status via SSE)

**Model bundle:** `upscale-enhance` (5-6 GB) dan `face-detection` (200-300 MB)

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| file | file | Ya | - | File gambar (multipart) |
| model | string | Tidak | `"auto"` | Model yang digunakan: `auto`, `gfpgan`, `codeformer` |
| strength | number | Tidak | `0.8` | Kekuatan peningkatan (0-1). Nilai lebih tinggi menghasilkan peningkatan lebih kuat |
| onlyCenterFace | boolean | Tidak | `false` | Hanya tingkatkan wajah yang paling sentral/menonjol |
| sensitivity | number | Tidak | `0.5` | Sensitivitas deteksi wajah (0-1) |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
```

## Respons {#response}

### Respons Awal (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progres (SSE di `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Hasil Akhir (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Catatan {#notes}

- Memerlukan model bundle `upscale-enhance` (5-6 GB) dan model bundle `face-detection` (200-300 MB).
- GFPGAN menghasilkan peningkatan yang lebih agresif; CodeFormer lebih baik mempertahankan identitas. `auto` memilih model terbaik untuk input.
- Output selalu berformat PNG untuk kualitas maksimal.
- Pratinjau WebP dihasilkan bersama output resolusi penuh untuk tampilan frontend yang lebih cepat.
- Parameter `strength` memadukan wajah yang ditingkatkan dengan aslinya. Gunakan nilai lebih rendah (0.3-0.5) untuk perbaikan halus, nilai lebih tinggi (0.7-1.0) untuk restorasi lebih kuat.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR melalui dekode otomatis.
