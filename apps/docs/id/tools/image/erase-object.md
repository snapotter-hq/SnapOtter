---
description: "Hapus objek yang tidak diinginkan dari gambar dengan inpainting AI (LaMa), dipandu oleh masker area yang akan dihapus."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 30170741c99e
---

# Penghapus Objek {#object-eraser}

Hapus objek yang tidak diinginkan dari gambar menggunakan inpainting AI (model LaMa). Menerima gambar dan masker yang menunjukkan area yang akan dihapus.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Pemrosesan:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status via SSE)

**Model bundle:** `object-eraser-colorize` (1-2 GB)

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| file | file | Ya | - | File gambar sumber (multipart) |
| mask | file | Ya | - | Gambar masker (putih = area yang dihapus, hitam = dipertahankan). Harus diunggah dengan fieldname `mask` |
| format | string | Tidak | `"auto"` | Format output: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Tidak | `95` | Kualitas output (1-100) |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Hasil Akhir (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Catatan {#notes}

- Memerlukan model bundle `object-eraser-colorize` terpasang (1-2 GB).
- Masker harus berdimensi sama dengan gambar sumber. Piksel putih menunjukkan area yang dihapus; AI mengisinya dengan konten yang masuk akal.
- Menggunakan LaMa (Large Mask Inpainting) untuk penghapusan objek berkualitas tinggi.
- Untuk format output yang tidak dapat dipratinjau di browser, pratinjau WebP dihasilkan bersama output utama.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR melalui dekode otomatis.
