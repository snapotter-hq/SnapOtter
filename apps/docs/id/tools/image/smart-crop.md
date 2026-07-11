---
description: "Pemangkasan yang sadar-subjek, sadar-wajah, dan sadar-entropi yang membingkai gambar secara cerdas menggunakan Sharp dan deteksi wajah AI."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 3ad43a9300be
---

# Smart Crop {#smart-crop}

Pemangkasan cerdas yang sadar-subjek, sadar-wajah, atau berbasis trim. Menggunakan strategi attention/entropy dari Sharp dan deteksi wajah AI untuk pembingkaian yang cerdas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Processing:** Asinkron (mengembalikan 202, poll `/api/v1/jobs/{jobId}/progress` untuk status melalui SSE)

**Model bundle:** `face-detection` (200-300 MB) - hanya diperlukan untuk mode `face`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File gambar (multipart) |
| mode | string | No | `"subject"` | Mode pemangkasan: `subject`, `face`, `trim`. (Nilai lama `attention` dan `content` dipetakan ke `subject` dan `trim`) |
| strategy | string | No | `"attention"` | Strategi untuk mode subject: `attention` atau `entropy` |
| width | integer | No | - | Lebar target dalam piksel |
| height | integer | No | - | Tinggi target dalam piksel |
| padding | integer | No | `0` | Persentase padding di sekitar subjek (0-50) |
| facePreset | string | No | `"head-shoulders"` | Preset pembingkaian wajah: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | No | `0.5` | Sensitivitas deteksi wajah (0-1) |
| threshold | integer | No | `30` | Ambang mode trim untuk deteksi latar belakang (0-255) |
| padToSquare | boolean | No | `false` | Melapisi hasil yang di-trim menjadi persegi |
| padColor | string | No | `"#ffffff"` | Warna latar belakang untuk padding |
| targetSize | integer | No | - | Ukuran target untuk keluaran yang dipadding (piksel) |
| quality | integer | No | - | Kualitas keluaran (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modes {#modes}

### Subject Mode {#subject-mode}
Menggunakan strategi attention atau entropy dari Sharp untuk menemukan area yang paling menarik secara visual dan memangkas di sekitarnya.

### Face Mode {#face-mode}
Mendeteksi wajah menggunakan AI, lalu membingkai pemangkasan di sekitar wajah yang terdeteksi menggunakan `facePreset` yang ditentukan. Kembali ke mode subject (strategi attention) jika tidak ada wajah yang terdeteksi.

### Trim Mode {#trim-mode}
Menghapus tepi/latar belakang yang seragam dari gambar. Secara opsional melapisi hasil menjadi persegi dengan warna latar belakang dan ukuran target yang ditentukan.

## Notes {#notes}

- Alat ini menggunakan factory `createToolRoute` dengan `executionHint: "long"`, sehingga mengembalikan 202 dengan progres SSE.
- Mode face memerlukan model bundle `face-detection` (200-300 MB).
- Mode subject dan trim bekerja tanpa model bundle AI apa pun.
- `facePreset` menentukan seberapa ketat pemangkasan membingkai wajah yang terdeteksi: `closeup` adalah yang paling ketat, `half-body` adalah yang paling luas.
- Jika tidak ada width/height yang ditentukan, default ke 1080x1080.
