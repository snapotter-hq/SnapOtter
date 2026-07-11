---
description: "Konversi antara mono dan stereo atau tukar saluran kiri dan kanan."
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 4ecd476154c8
---

# Audio Channels {#audio-channels}

Konversi audio antara tata letak mono dan stereo, atau tukar saluran kiri dan kanan dari file stereo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| mode | string | Ya | - | Operasi saluran: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Catatan {#notes}

- `stereo-to-mono` mencampur kedua saluran menjadi satu trek mono.
- `mono-to-stereo` menduplikasi saluran mono ke kiri dan kanan.
- `swap` menukar saluran kiri dan kanan dari file stereo.
- Output biasanya mempertahankan kontainer input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung beralih ke MP3.
