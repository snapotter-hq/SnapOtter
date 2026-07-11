---
description: "Isi bilah dengan salinan video yang diburamkan."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 8e02d63b8195
---

# Blur Pad {#blur-pad}

Sesuaikan video ke rasio aspek target dengan mengisi area padding menggunakan salinan video yang diburamkan dan diskalakan alih-alih bilah berwarna solid.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Menerima data form multipart berisi file video dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | Rasio aspek target: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | No | `20` | Sigma blur Gaussian untuk latar belakang (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- Nilai blur yang lebih tinggi menghasilkan latar belakang yang lebih lembut dan abstrak. Nilai yang lebih rendah mempertahankan lebih banyak detail yang terlihat.
- Jika video sudah cocok dengan rasio aspek target, file dikembalikan tanpa perubahan.
- Untuk padding berwarna solid, gunakan alat Aspect Pad.
