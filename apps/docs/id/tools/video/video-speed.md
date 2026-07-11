---
description: "Mempercepat atau memperlambat sebuah video."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: b42ef4592619
---

# Video Speed {#video-speed}

Mempercepat atau memperlambat sebuah video dengan opsi untuk mempertahankan pitch audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Pengali kecepatan (0.25-4). Nilai di atas 1 mempercepat, di bawah 1 memperlambat |
| keepPitch | boolean | No | `true` | Mempertahankan pitch audio saat mengubah kecepatan |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- Faktor `2` menggandakan kecepatan pemutaran (memangkas durasi setengahnya). Faktor `0.5` memangkas kecepatan pemutaran setengahnya (menggandakan durasi).
- Ketika `keepPitch` adalah `true`, audio direntangkan-waktu agar suara terdengar alami. Ketika `false`, pitch bergeser secara proporsional dengan kecepatan.
- Rentang yang valid adalah 0.25x hingga 4x.
