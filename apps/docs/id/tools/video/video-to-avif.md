---
description: "Mengonversi klip video menjadi gambar AVIF animasi."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 2f809489711a
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

Mengonversi klip video menjadi gambar AVIF animasi dengan frame rate, lebar, kualitas, dan rentang klip yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Frame rate keluaran (1-30) |
| width | integer | No | `480` | Lebar keluaran dalam piksel (64-1280). Tinggi diskalakan secara proporsional |
| startS | number | No | `0` | Titik awal klip, dalam detik |
| durationS | number | No | `5` | Panjang klip dalam detik (hingga 60) |
| quality | integer | No | `50` | Kualitas AVIF (1-100) |
| loop | boolean | No | `true` | Mengulang animasi |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

Encoding AV1 lebih lambat daripada GIF atau WebP, jadi tool ini biasanya menjawab `202` dengan job yang bisa dipantau melalui SSE di `/api/v1/jobs/{jobId}/progress`. Klip pendek bisa selesai dalam jendela sinkron dan langsung mengembalikan hasilnya:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- AVIF animasi bebas royalti dan biasanya lebih kecil daripada WebP atau GIF animasi pada kualitas visual yang sama.
- Browser saat ini dapat memutar AVIF animasi. Beberapa penampil gambar desktop hanya menampilkan frame pertama.
- Trek audio dibuang.
