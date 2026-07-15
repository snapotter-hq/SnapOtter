---
description: "Deteksi dan buramkan wajah dalam gambar secara otomatis dengan deteksi wajah AI untuk privasi dan anonimisasi yang patuh GDPR."
i18n_source_hash: 314e3e16a422
i18n_provenance: human
i18n_output_hash: a2d660c6993d
---

# Blur Wajah & Info Pribadi {#face-pii-blur}

Deteksi dan buramkan wajah dalam gambar secara otomatis menggunakan deteksi wajah bertenaga AI (MediaPipe).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Pemrosesan:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status melalui SSE)

**Bundel model:** `face-detection` (200-300 MB)

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| file | file | Ya | - | Berkas gambar (multipart) |
| blurRadius | number | Tidak | `30` | Radius blur yang diterapkan pada wajah yang terdeteksi (1-100) |
| sensitivity | number | Tidak | `0.5` | Sensitivitas deteksi wajah (0-1). Nilai lebih rendah mendeteksi lebih sedikit wajah dengan keyakinan lebih tinggi |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Hasil Akhir (melalui SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### Tidak Ada Wajah Terdeteksi {#no-faces-detected}

Jika tidak ada wajah ditemukan, hasil menyertakan peringatan:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Catatan {#notes}

- Memerlukan bundel model `face-detection` untuk dipasang (200-300 MB).
- Format keluaran mengikuti format input secara otomatis.
- Larik `faces` berisi koordinat kotak pembatas (x, y, width, height) untuk setiap wajah yang terdeteksi.
- Naikkan `sensitivity` (lebih dekat ke 1,0) untuk mendeteksi lebih banyak wajah, termasuk yang sebagian terhalang.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR melalui dekode otomatis.
