---
description: "Mengekstrak frame dari video sebagai ZIP berisi gambar."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 9c215f505e55
---

# Video to Frames {#video-to-frames}

Mengekstrak frame individual dari sebuah video dan mengunduhnya sebagai arsip ZIP berisi gambar PNG atau JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Mode ekstraksi: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Ekstrak setiap frame ke-N (2-1000). Hanya digunakan ketika mode adalah `"nth"` |
| timestamps | string | No | `""` | Stempel waktu dalam detik yang dipisahkan koma. Diperlukan ketika mode adalah `"timestamps"` |
| format | string | No | `"png"` | Format gambar untuk frame yang diekstrak: `png`, `jpg` |

## Example Request {#example-request}

Ekstrak setiap frame ke-30 sebagai JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Ekstrak frame pada stempel waktu tertentu:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- Mode `all` mengekstrak setiap frame dan dapat menghasilkan file ZIP yang sangat besar untuk video panjang. Gunakan mode `nth` atau `timestamps` untuk ekstraksi selektif.
- PNG mempertahankan kualitas penuh tetapi menghasilkan file lebih besar. JPG lebih kecil tetapi lossy.
- Respons diunduh sebagai arsip ZIP yang berisi file gambar bernomor urut.
