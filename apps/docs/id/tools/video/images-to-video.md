---
description: "Ubah sekumpulan gambar menjadi video slideshow, GIF animasi, atau WebP animasi."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: c33ac1414f74
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Ubah sekumpulan gambar menjadi video slideshow dengan durasi per gambar, resolusi, dan frame rate yang dapat dikonfigurasi, atau menjadi GIF atau WebP animasi dengan waktu per frame dan jumlah pengulangan yang ditetapkan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Menerima multipart form data dengan dua gambar atau lebih dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Format keluaran: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | Hanya MP4. Durasi tampil per gambar dalam detik (0.5-10) |
| resolution | string | No | `"720p"` | Hanya MP4. Resolusi keluaran: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Hanya MP4. Frame rate keluaran (10-60) |
| frameDelayMs | integer | No | `500` | Hanya GIF dan WebP. Lama tiap gambar ditampilkan, dalam milidetik (20-10000) |
| loop | integer | No | `0` | Hanya GIF dan WebP. Berapa kali animasi diputar; `0` berulang tanpa henti (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

Untuk membuat GIF animasi yang menampilkan tiap gambar selama 200 ms:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Menerima 2-60 file gambar per permintaan. Gambar muncul di video sesuai urutan unggahan.
- Untuk MP4, gambar diubah ukurannya dan diberi padding agar pas dengan resolusi target sambil mempertahankan rasio aspek.
- Opsi resolusi `square` menghasilkan video 1080x1080, berguna untuk media sosial.
- Keluaran MP4 berformat H.264, bernama `slideshow.mp4`.
- Keluaran GIF dan WebP memakai ukuran gambar pertama. Gambar berukuran lain diskalakan agar muat di dalamnya, dan area sisanya transparan. File diberi nama `slideshow.gif` atau `slideshow.webp`.
- GIF menyimpan waktu frame dalam seperseratus detik, jadi `frameDelayMs` dibulatkan ke 10 ms terdekat di GIF. WebP menyimpan nilai persisnya.
- Animasi besar ditolak, bukan dibuat: ukuran frame dikali jumlah gambar harus tetap di bawah batas piksel yang sama dengan yang dipakai alat GIF.
