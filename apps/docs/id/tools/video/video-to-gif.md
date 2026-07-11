---
description: "Mengubah klip video menjadi GIF animasi."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 2c3a08842c3e
---

# Video to GIF {#video-to-gif}

Mengubah klip video menjadi GIF animasi dengan frame rate, lebar, waktu mulai, dan durasi yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Menerima multipart form data dengan file video dan field JSON `settings`. Ini adalah endpoint asinkron - ia langsung mengembalikan `202 Accepted` dan progres dialirkan melalui SSE di `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Frame rate keluaran (1-30) |
| width | integer | No | `480` | Lebar keluaran dalam piksel (64-1280). Tinggi diskalakan secara proporsional |
| startS | number | No | `0` | Waktu mulai dalam detik (harus >= 0) |
| durationS | number | No | `5` | Durasi dalam detik (di atas 0, maks 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Nilai `fps` dan `width` yang lebih rendah menghasilkan file GIF lebih kecil. GIF selebar 480px pada 12 fps biasanya merupakan keseimbangan yang baik.
- Durasi maksimum adalah 60 detik. Klip yang lebih panjang menghasilkan file yang sangat besar.
- Pembaruan progres tersedia melalui SSE di `GET /api/v1/jobs/{jobId}/progress` hingga job selesai.
