---
description: "Naikkan atau turunkan volume audio dengan gain tetap dalam desibel."
i18n_source_hash: b9bc1de2c9ef
i18n_provenance: human
i18n_output_hash: 866044e85428
---

# Volume Adjust {#volume-adjust}

Naikkan atau turunkan volume file audio dengan menerapkan gain tetap dalam desibel.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Menerima multipart form data berisi file audio dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | Penyesuaian volume dalam desibel (-30 hingga 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Nilai positif menaikkan volume; nilai negatif menurunkannya.
- Gain positif yang besar dapat menyebabkan clipping. Gunakan normalize-audio untuk penyetaraan kenyaringan yang aman.
- Output biasanya mempertahankan container input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung dialihkan ke MP3.
