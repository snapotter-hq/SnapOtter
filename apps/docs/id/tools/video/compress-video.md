---
description: "Memperkecil ukuran file video dengan kontrol kualitas."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: 211aa4a824b9
---

# Compress Video {#compress-video}

Memperkecil ukuran file video menggunakan kekuatan kompresi yang dapat dikonfigurasi dan penurunan resolusi opsional.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Menerima multipart form data dengan file video dan field JSON `settings`. Ini adalah endpoint asinkron - ia langsung mengembalikan `202 Accepted` dan progres dialirkan melalui SSE di `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Kekuatan kompresi: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Resolusi keluaran: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Preset `light` mempertahankan kualitas mendekati aslinya. Preset `strong` mengurangi ukuran file secara agresif dengan mengorbankan ketepatan visual.
- Menurunkan resolusi (mis. dari 4K ke 720p) berkombinasi dengan kompresi untuk pengurangan ukuran yang signifikan.
- Pembaruan progres tersedia melalui SSE di `GET /api/v1/jobs/{jobId}/progress` hingga job selesai.
