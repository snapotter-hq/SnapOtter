---
description: "Buat klip nada dering dari file audio apa pun."
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 25ba233eff25
---

# Ringtone Maker {#ringtone-maker}

Buat klip nada dering (.m4r) dari file audio apa pun dengan memilih waktu mulai dan durasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| startS | number | Tidak | `0` | Waktu mulai dalam detik (minimum 0) |
| durationS | number | Tidak | `30` | Durasi klip dalam detik (1 hingga 30) |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## Catatan {#notes}

- Output selalu berformat M4R, kompatibel dengan nada dering iPhone.
- Durasi nada dering maksimum adalah 30 detik (batas Apple).
- Format audio apa pun dapat digunakan sebagai input.
