---
description: "Percepat atau perlambat pemutaran audio dengan pengali."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: d1fcb8585155
---

# Audio Speed {#audio-speed}

Percepat atau perlambat pemutaran audio dengan menerapkan pengali kecepatan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| factor | number | Tidak | `1.5` | Pengali kecepatan (0.25 hingga 4). Nilai di bawah 1 memperlambat; di atas 1 mempercepat. |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Catatan {#notes}

- Faktor `0.25` memutar pada seperempat kecepatan (4x lebih panjang). Faktor `4` memutar pada empat kali kecepatan (4x lebih pendek).
- Nada dipertahankan saat kecepatan berubah (time-stretch). Gunakan pitch-shift untuk menyesuaikan nada secara independen.
- Output biasanya mempertahankan kontainer input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung beralih ke MP3.
