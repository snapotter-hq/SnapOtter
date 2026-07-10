---
description: "Memperbaiki PNG transparan palsu dengan matting AI (BiRefNet) untuk menghasilkan alfa sejati, plus pembersihan tepi defringe."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 5881232fabdc
---

# PNG Transparency Fixer {#png-transparency-fixer}

Memperbaiki PNG transparan palsu dengan satu klik. Menggunakan matting AI (model BiRefNet HR Matting) untuk menghasilkan transparansi alfa sejati, dengan pemrosesan pascanya defringe untuk membersihkan tepi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Processing:** Asinkron (mengembalikan 202, poll `/api/v1/jobs/{jobId}/progress` untuk status melalui SSE)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File gambar (multipart) |
| defringe | number | No | `30` | Intensitas defringe (0-100). Menghapus piksel fringe semi-transparan di sekitar tepi |
| outputFormat | string | No | `"png"` | Format keluaran: `png` atau `webp` |
| removeWatermark | boolean | No | `false` | Menerapkan pemrosesan awal penghapusan watermark (median filter) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Notes {#notes}

- Memerlukan model bundle `background-removal` untuk diinstal (4-5 GB).
- Menggunakan `birefnet-hr-matting` sebagai model utama untuk alpha matting berkualitas tinggi. Kembali ke `birefnet-general` jika model HR kehabisan memori.
- Opsi `defringe` menghapus piksel fringe semi-transparan yang terkadang ditinggalkan matting AI di sekitar rambut, bulu, dan tepi halus. Ini bekerja dengan mem-blur kanal alfa dan menolkan piksel berkeyakinan rendah.
- Opsi `removeWatermark` menerapkan langkah pemrosesan awal median filter. Ini adalah pengurangan watermark dasar, bukan alat penghapusan watermark khusus.
- Hanya menghasilkan PNG atau WebP lossless (keduanya mendukung transparansi alfa).
- Mendukung format masukan HEIC/HEIF, RAW, TGA, PSD, EXR, dan HDR melalui pendekodean otomatis.
