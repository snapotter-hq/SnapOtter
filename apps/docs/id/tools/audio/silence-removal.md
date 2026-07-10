---
description: "Hapus bagian hening dari file audio."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 28bb8bd4b45a
---

# Silence Removal {#silence-removal}

Deteksi dan hapus bagian hening dari file audio berdasarkan ambang batas dan durasi minimum yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Menerima multipart form data berisi file audio dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | Ambang batas hening dalam dB (-80 hingga -20). Audio di bawah level ini dianggap hening. |
| minSilenceS | number | No | `0.5` | Durasi hening minimum dalam detik untuk dihapus (0.1 hingga 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Ambang batas yang lebih tinggi (kurang negatif) lebih agresif dan menghapus bagian yang lebih pelan serta hening sesungguhnya.
- Naikkan `minSilenceS` agar hanya jeda yang lebih panjang yang dihapus sementara jeda alami yang singkat tetap dipertahankan.
- Berguna untuk membersihkan rekaman podcast, kuliah, dan memo suara.
- Output biasanya mempertahankan container input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung dialihkan ke MP3.
