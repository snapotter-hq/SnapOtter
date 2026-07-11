---
description: "Hasilkan visualisasi bentuk gelombang sebagai gambar PNG dari file audio."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 2ee074ff47df
---

# Waveform Image {#waveform-image}

Hasilkan visualisasi bentuk gelombang sebagai gambar PNG dari file audio, dengan dimensi dan warna yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Menerima multipart form data berisi file audio dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | Lebar gambar dalam piksel (256 hingga 3840) |
| height | integer | No | `256` | Tinggi gambar dalam piksel (64 hingga 1080) |
| color | string | No | `"#4f46e5"` | Warna heksadesimal bentuk gelombang (mis. `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- Output selalu berupa gambar PNG, terlepas dari format audio input.
- Bentuk gelombang dirender pada latar belakang transparan.
- Berguna untuk thumbnail, pratinjau media sosial, atau penyematan di halaman web.
