---
description: "Lihat, edit, atau hapus tag metadata audio (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 4421b188dcfe
---

# Audio Metadata {#audio-metadata}

Lihat, edit, atau hapus tag metadata audio seperti judul, artis, dan album (ID3 dan format tag serupa).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Menerima data formulir multipart dengan file audio dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| strip | boolean | Tidak | `false` | Menghapus semua tag metadata yang ada |
| title | string | Tidak | - | Setel tag judul (maks 500 karakter) |
| artist | string | Tidak | - | Setel tag artis (maks 500 karakter) |
| album | string | Tidak | - | Setel tag album (maks 500 karakter) |

## Contoh Permintaan {#example-request}

Edit tag metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Hapus semua metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Catatan {#notes}

- Respons menyertakan objek `metadata` dengan format kontainer, durasi, bitrate, dan tag saat ini.
- Saat `strip` bernilai `true`, semua bidang tag diabaikan dan setiap tag yang ada dihapus.
- Hanya tag yang Anda berikan yang diperbarui; tag yang tidak ditentukan tetap tidak berubah.
- Format output cocok dengan format input.
