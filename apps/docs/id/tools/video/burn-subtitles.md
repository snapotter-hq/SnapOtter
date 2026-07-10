---
description: "Merender subtitle secara permanen ke dalam frame video."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 22d4ab26b1cb
---

# Burn Subtitles {#burn-subtitles}

Merender secara permanen (hard-code) subtitle dari file SRT, VTT, atau ASS ke setiap frame video.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Menerima multipart form data dengan file video dan file subtitle. Ini adalah endpoint asinkron - ia langsung mengembalikan `202 Accepted` dan progres dialirkan melalui SSE di `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Ukuran font subtitle dalam piksel (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Unggah dua file: yang pertama harus berupa video, yang kedua harus berupa file subtitle (.srt, .vtt, atau .ass).
- Subtitle yang di-burn menjadi bagian permanen dari video dan tidak dapat dimatikan oleh penonton. Untuk subtitle yang bisa dialihkan, gunakan alat Embed Subtitles sebagai gantinya.
- Pembaruan progres tersedia melalui SSE di `GET /api/v1/jobs/{jobId}/progress` hingga job selesai.
