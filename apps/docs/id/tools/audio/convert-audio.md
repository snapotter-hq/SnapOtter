---
description: "Konversi audio antara format MP3, WAV, OGG, FLAC, dan M4A."
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 06454316167e
---

# Convert Audio {#convert-audio}

Konversi file audio antara format umum termasuk MP3, WAV, OGG, FLAC, dan M4A, dengan bitrate output dan laju sampel yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| format | string | Tidak | `"mp3"` | Format output: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | Tidak | `192` | Bitrate output dalam kbps (32 hingga 320) |
| sampleRate | integer | Tidak | laju sumber | Laju sampel output dalam Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000`, atau `96000`. Kosongkan untuk mempertahankan laju sumber |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Catatan {#notes}

- Format input yang didukung meliputi MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF, dan OPUS.
- Bitrate hanya berlaku untuk format lossy (MP3, OGG, M4A). Format lossless seperti WAV dan FLAC mengabaikan pengaturan ini.
- Output MP3 mendukung laju sampel hingga 48000 Hz. Opsi 96000 Hz hanya berlaku untuk WAV, OGG, FLAC, dan M4A.
- Bitrate MP3 dibatasi oleh laju sampel: maksimal 64 kbps pada 8000 Hz dan 160 kbps pada 16000 atau 22050 Hz. Permintaan di atas batas tersebut ditolak, bukan diturunkan secara diam-diam.
- Nama file output mempertahankan nama asli dengan ekstensi baru.
