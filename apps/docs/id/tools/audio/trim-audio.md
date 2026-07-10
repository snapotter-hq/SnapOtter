---
description: "Potong sebuah bagian dari file audio dengan menentukan waktu mulai dan waktu akhir."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: fcfb8ae122c3
---

# Trim Audio {#trim-audio}

Potong sebuah bagian dari file audio dengan menentukan waktu mulai dan waktu akhir dalam detik.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Menerima multipart form data berisi file audio dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Waktu mulai dalam detik (minimum 0) |
| endS | number | Yes | - | Waktu akhir dalam detik (harus setelah waktu mulai) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Waktu ditentukan dalam detik dan dapat mencakup desimal (mis. `10.5`).
- Nilai `endS` harus lebih besar dari `startS`.
- Jika `endS` melebihi durasi audio, file dipangkas hingga akhir.
- Output biasanya mempertahankan container input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung dialihkan ke MP3.
