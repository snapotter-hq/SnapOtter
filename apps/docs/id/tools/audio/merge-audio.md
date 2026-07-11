---
description: "Gabungkan beberapa file audio menjadi satu trek sekuensial."
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: f63e6228a426
---

# Merge Audio {#merge-audio}

Gabungkan dua atau lebih file audio menjadi satu trek sekuensial, digabungkan sesuai urutan pengunggahan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

Menerima data formulir multipart dengan beberapa file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| format | string | Tidak | `"mp3"` | Format output: `mp3`, `wav`, `flac`, `m4a` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## Catatan {#notes}

- Menerima 2 hingga 10 file audio per permintaan.
- File digabungkan sesuai urutan pengunggahan.
- Semua file input dienkode ulang ke format output dan sample rate yang dipilih untuk penggabungan yang mulus.
- Format input campuran didukung (mis. satu WAV dan satu MP3).
