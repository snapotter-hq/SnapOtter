---
description: "Penghapusan latar belakang bertenaga AI dengan efek opsional (blur, bayangan, gradien, latar belakang kustom)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: f546e405fee9
---

# Remove Background {#remove-background}

Penghapusan latar belakang bertenaga AI dengan efek opsional (blur, bayangan, gradien, latar belakang kustom).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processing:** Asinkron (mengembalikan 202, polling `/api/v1/jobs/{jobId}/progress` untuk status via SSE)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Berkas gambar (multipart) |
| model | string | No | - | Varian model AI yang digunakan |
| backgroundType | string | No | `"transparent"` | Salah satu dari: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | - | Warna hex untuk latar belakang solid |
| gradientColor1 | string | No | - | Warna gradien pertama |
| gradientColor2 | string | No | - | Warna gradien kedua |
| gradientAngle | number | No | - | Sudut gradien dalam derajat |
| blurEnabled | boolean | No | - | Aktifkan efek blur latar belakang |
| blurIntensity | number | No | - | Intensitas blur (0-100) |
| shadowEnabled | boolean | No | - | Aktifkan drop shadow pada subjek |
| shadowOpacity | number | No | - | Opasitas bayangan (0-100) |
| outputFormat | string | No | - | Format output: `png`, `webp`, atau `avif` |
| edgeRefine | integer | No | - | Tingkat penghalusan tepi (0-3) |
| decontaminate | boolean | No | - | Hapus rembesan warna dari tepi |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Effects Endpoint (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Menerapkan ulang efek latar belakang tanpa menjalankan ulang model AI. Menggunakan mask dan gambar asli yang di-cache dari Fase 1.

### Parameters {#parameters-1}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| settings | JSON | Yes | - | JSON dengan pengaturan efek (lihat di bawah) |
| backgroundImage | file | No | - | Gambar latar belakang kustom (saat backgroundType adalah `image`) |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jobId | string | Yes | ID job dari Fase 1 |
| filename | string | Yes | Nama berkas asli dari Fase 1 |
| backgroundType | string | No | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | Warna hex untuk latar belakang solid |
| gradientColor1 | string | No | Warna gradien pertama |
| gradientColor2 | string | No | Warna gradien kedua |
| gradientAngle | number | No | Sudut gradien dalam derajat |
| blurEnabled | boolean | No | Aktifkan blur latar belakang |
| blurIntensity | number | No | Intensitas blur (0-100) |
| shadowEnabled | boolean | No | Aktifkan drop shadow |
| shadowOpacity | number | No | Opasitas bayangan (0-100) |
| outputFormat | string | No | `png`, `webp`, atau `avif` |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Notes {#notes}

- Membutuhkan model bundle `background-removal` terpasang (4-5 GB).
- Fase 1 meng-cache mask transparan dan gambar asli sehingga Fase 2 (efek) dapat menerapkan ulang latar belakang berbeda secara instan tanpa menjalankan ulang model AI.
- Mendukung format input HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR via dekode otomatis.
- Rotasi EXIF dikoreksi otomatis sebelum diproses.
