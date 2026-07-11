---
description: "Naikkan atau turunkan nada audio dalam semiton tanpa mengubah kecepatan."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: eba91a099043
---

# Pitch Shift {#pitch-shift}

Naikkan atau turunkan nada file audio sebanyak sejumlah semiton tanpa mengubah kecepatan pemutarannya.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| semitones | integer | Tidak | `3` | Semiton untuk digeser (-12 hingga 12). Harus bukan nol. |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- Nilai positif menaikkan nada; nilai negatif menurunkannya.
- Pergeseran 12 semiton sama dengan satu oktaf ke atas; -12 sama dengan satu oktaf ke bawah.
- Durasi pemutaran tetap sama terlepas dari jumlah pergeseran.
- Output biasanya mempertahankan kontainer input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung beralih ke MP3.
