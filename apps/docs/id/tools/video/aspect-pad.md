---
description: "Tambahkan bilah berwarna solid agar pas dengan rasio aspek target."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: f4eb09a4ca68
---

# Aspect Pad {#aspect-pad}

Tambahkan bilah letterbox atau pillarbox berwarna solid agar video pas dengan rasio aspek target tanpa memotong.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

Menerima data form multipart berisi file video dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | Rasio aspek target: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | No | `"#000000"` | Warna hex untuk bilah padding (mis. `"#000000"` untuk hitam) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- Jika video sudah cocok dengan rasio aspek target, file dikembalikan tanpa perubahan.
- Gunakan `9:16` untuk format media sosial vertikal/potret (TikTok, Reels, Shorts).
- Untuk padding buram alih-alih warna solid, gunakan alat Blur Pad.
