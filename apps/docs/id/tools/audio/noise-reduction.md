---
description: "Kurangi kebisingan latar dari audio dengan denoising berbasis FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 367959b9e163
---

# Noise Reduction {#noise-reduction}

Kurangi kebisingan latar dalam file audio menggunakan denoising berbasis FFT dengan kekuatan yang dapat dipilih.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| strength | string | Tidak | `"medium"` | Kekuatan denoising: `light`, `medium`, `strong` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Catatan {#notes}

- `light` mempertahankan lebih banyak detail tetapi menghilangkan lebih sedikit kebisingan. `strong` menghilangkan lebih banyak kebisingan tetapi dapat memunculkan artefak halus.
- Hasil terbaik pada rekaman dengan kebisingan latar yang konsisten (dengung kipas, AC, statis).
- Output biasanya mempertahankan kontainer input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung beralih ke MP3.
