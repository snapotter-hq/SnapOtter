---
description: "Perluas kanvas gambar dengan outpainting AI, memperluasnya ke segala arah dan mengisi area baru agar cocok dengan aslinya."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: a15b402dd0a2
---

# Perluas Kanvas AI {#ai-canvas-expand}

Perluas kanvas gambar dengan pengisian bertenaga AI (outpainting). Memperluas gambar ke segala arah dan mengisi area baru dengan konten yang dihasilkan AI yang cocok dengan gambar yang ada.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Pemrosesan:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status melalui SSE)

**Bundel model:** `object-eraser-colorize` (1-2 GB)

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| file | file | Ya | - | Berkas gambar (multipart) |
| extendTop | integer | Tidak | `0` | Piksel untuk memperluas di bagian atas |
| extendRight | integer | Tidak | `0` | Piksel untuk memperluas di bagian kanan |
| extendBottom | integer | Tidak | `0` | Piksel untuk memperluas di bagian bawah |
| extendLeft | integer | Tidak | `0` | Piksel untuk memperluas di bagian kiri |
| tier | string | Tidak | `"balanced"` | Tingkat kualitas: `fast`, `balanced`, `high` |
| format | string | Tidak | `"auto"` | Format keluaran: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Tidak | `95` | Kualitas keluaran (1-100) |

Setidaknya satu arah perluasan harus lebih besar dari 0.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
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
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Hasil Akhir (melalui SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Catatan {#notes}

- Memerlukan bundel model `object-eraser-colorize` untuk dipasang (1-2 GB).
- Menggunakan outpainting berbasis LaMa untuk menghasilkan konten bagi wilayah yang diperluas.
- Parameter `tier` menukar kecepatan dengan kualitas: `fast` menghasilkan hasil dengan cepat dengan kemungkinan artefak, `high` membutuhkan waktu lebih lama tetapi menghasilkan pengisian yang lebih halus dan koheren.
- Nilai perluasan dalam piksel. Dimensi gambar akhir akan menjadi: lebar asli + extendLeft + extendRight kali tinggi asli + extendTop + extendBottom.
- Untuk format keluaran yang tidak dapat dipratinjau di peramban (HEIC, JXL, TIFF), pratinjau WebP dihasilkan bersama keluaran utama.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR melalui dekode otomatis.
