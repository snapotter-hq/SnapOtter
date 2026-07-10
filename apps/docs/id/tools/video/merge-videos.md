---
description: "Menggabungkan beberapa klip video menjadi satu file."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 286a874d50e2
---

# Merge Videos {#merge-videos}

Menggabungkan beberapa klip video menjadi satu file MP4. Semua masukan dinormalisasi ke resolusi video pertama dan 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Menerima multipart form data dengan dua file video atau lebih. Ini adalah endpoint asinkron - ia langsung mengembalikan `202 Accepted` dan progres dialirkan melalui SSE di `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

Alat ini tidak memiliki parameter pengaturan. Unggah 2-10 file video sebagai beberapa bagian `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Klip digabungkan sesuai urutan unggahannya.
- Semua klip dienkode ulang agar sesuai dengan resolusi, frame rate (30 fps), dan codec (H.264) klip pertama. Masukan yang tidak cocok dinormalisasi secara otomatis.
- Menerima 2-10 file video per permintaan.
- Pembaruan progres tersedia melalui SSE di `GET /api/v1/jobs/{jobId}/progress` hingga job selesai.
