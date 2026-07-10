---
description: "Konversi audio antara format MP3, WAV, OGG, FLAC, dan M4A."
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 06454316167e
---

# Convert Audio {#convert-audio}

Konversi file audio antara format umum termasuk MP3, WAV, OGG, FLAC, dan M4A, dengan bitrate output yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| format | string | Tidak | `"mp3"` | Format output: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Tidak | `192` | Bitrate output dalam kbps (32 hingga 320) |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Catatan {#notes}

- Format input yang didukung meliputi MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF, dan OPUS.
- Bitrate hanya berlaku untuk format lossy (MP3, OGG, M4A). Format lossless seperti WAV dan FLAC mengabaikan pengaturan ini.
- Nama file output mempertahankan nama asli dengan ekstensi baru.
