---
description: "Potong sebuah bagian dari file audio dengan menentukan waktu mulai dan waktu akhir."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 418a53b28d38
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

Potong sebuah bagian dari file audio. Anda bisa mempertahankan bagian di antara waktu mulai dan waktu akhir, atau memotong sejumlah tetap dari awal dan akhir.

Di aplikasi, kolom waktu menerima detik biasa (`90`), `MM:SS` (`1:30`), atau `HH:MM:SS` (`1:02:03.5`). API menerima detik.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Menerima multipart form data berisi file audio dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` mempertahankan `startS` sampai `endS`. `ends` menghapus `cutStartS` dari awal dan `cutEndS` dari akhir |
| startS | number | No | `0` | Mode range: waktu mulai dalam detik (minimum 0) |
| endS | number | Range mode | - | Mode range: waktu akhir dalam detik (harus setelah waktu mulai) |
| cutStartS | number | No | `0` | Mode ends: detik yang dihapus dari awal |
| cutEndS | number | No | `0` | Mode ends: detik yang dihapus dari akhir |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Potong 2 detik pertama dan 3 detik terakhir, berapa pun panjang file:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Waktu ditentukan dalam detik dan dapat mencakup desimal (mis. `10.5`).
- Dalam mode range, `endS` harus lebih besar dari `startS`. Jika `endS` melebihi durasi audio, file dipangkas hingga akhir.
- Dalam mode ends, setidaknya salah satu dari `cutStartS` dan `cutEndS` harus di atas nol, dan keduanya harus menyisakan audio minimal 0,1 detik. Karena pemotongan diukur dari panjang masing-masing file, satu pengaturan bisa dipakai untuk satu batch file dengan durasi berbeda.
- Output biasanya mempertahankan container input. Input AAC ditulis sebagai M4A, dan input decode-only yang tidak didukung dialihkan ke MP3.
