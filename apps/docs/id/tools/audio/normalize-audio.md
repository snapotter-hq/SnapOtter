---
description: "Ratakan kenyaringan ke tingkat standar siaran (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: f78038532996
---

# Normalize Audio {#normalize-audio}

Ratakan kenyaringan audio ke tingkat standar siaran menggunakan normalisasi EBU R128 (-16 LUFS).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Alat ini menerapkan normalisasi kenyaringan EBU R128 secara otomatis.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- Menggunakan standar kenyaringan EBU R128, menargetkan -16 LUFS.
- Ideal untuk podcast, buku audio, dan konten siaran yang membutuhkan kenyaringan konsisten.
- Sample rate sumber dipertahankan pada output.
- Output biasanya mempertahankan kontainer input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung beralih ke MP3.
