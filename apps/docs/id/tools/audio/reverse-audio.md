---
description: "Balikkan file audio sehingga diputar mundur."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: e1a8be8429d5
---

# Reverse Audio {#reverse-audio}

Balikkan file audio sehingga diputar mundur.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Seluruh file audio dibalik.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- Seluruh trek audio dibalik dari akhir ke awal.
- Output biasanya mempertahankan kontainer input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung beralih ke MP3.
