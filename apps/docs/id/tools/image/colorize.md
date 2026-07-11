---
description: "Warnai foto hitam-putih atau grayscale secara otomatis dengan model AI DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: ed945fdf25f4
---

# Pewarnaan AI {#ai-colorization}

Ubah foto hitam-putih atau grayscale menjadi berwarna penuh menggunakan AI (model DDColor dengan fallback OpenCV DNN).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Pemrosesan:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status via SSE)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| file | file | Ya | - | File gambar (multipart) |
| intensity | number | Tidak | `1.0` | Intensitas warna (0-1). Nilai lebih rendah menghasilkan pewarnaan yang lebih halus |
| model | string | Tidak | `"auto"` | Model yang digunakan: `auto`, `ddcolor`, `opencv` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Hasil Akhir (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Catatan {#notes}

- Memerlukan model bundle `object-eraser-colorize` terpasang (1-2 GB).
- DDColor menghasilkan hasil berkualitas lebih tinggi tetapi lebih lambat; OpenCV DNN lebih cepat dengan kualitas sedikit lebih rendah. `auto` menggunakan DDColor jika tersedia dengan fallback OpenCV.
- Parameter `intensity` memadukan antara grayscale asli dan hasil pewarnaan AI. Gunakan 1.0 untuk warna penuh, nilai lebih rendah untuk tampilan vintage yang sebagian tersaturasi.
- Format output otomatis sesuai dengan format input.
- Untuk format output yang tidak dapat dipratinjau di browser, pratinjau WebP dihasilkan bersama output utama.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR melalui dekode otomatis.
