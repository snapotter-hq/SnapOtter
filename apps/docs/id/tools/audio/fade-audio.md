---
description: "Tambahkan efek fade-in dan fade-out ke audio."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: 9aea5805437b
---

# Fade Audio {#fade-audio}

Tambahkan efek fade-in dan fade-out ke awal dan akhir file audio.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Tidak | `1` | Durasi fade-in dalam detik (0 hingga 30) |
| fadeOutS | number | Tidak | `1` | Durasi fade-out dalam detik (0 hingga 30) |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- Setel salah satu nilai ke `0` untuk melewati arah fade tersebut. Setidaknya satu harus lebih besar dari 0.
- Durasi fade dibatasi ke panjang audio jika melebihinya.
- Output biasanya mempertahankan kontainer input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung beralih ke MP3.
