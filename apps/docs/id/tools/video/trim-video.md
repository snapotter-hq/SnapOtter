---
description: "Memotong klip dari video dengan menentukan waktu mulai dan selesai."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: 214f68e76a50
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Memotong klip dari video. Pertahankan bagian di antara waktu mulai dan selesai, atau potong sejumlah tetap dari awal dan akhir. Tersedia opsi untuk potongan yang akurat per frame.

Di aplikasi, kolom waktu menerima detik biasa (`90`), `MM:SS` (`1:30`) atau `HH:MM:SS` (`1:02:03.5`). API menerima detik.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Menerima multipart form data dengan file video dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` mempertahankan `startS` hingga `endS`. `ends` menghapus `cutStartS` dari awal dan `cutEndS` dari akhir |
| startS | number | No | `0` | Range mode: waktu mulai dalam detik (harus >= 0) |
| endS | number | Range mode | - | Range mode: waktu selesai dalam detik (harus setelah startS) |
| cutStartS | number | No | `0` | Ends mode: detik yang dihapus dari awal |
| cutEndS | number | No | `0` | Ends mode: detik yang dihapus dari akhir |
| precise | boolean | No | `false` | Enkode ulang seluruh rentang agar frame awal dan akhir tepat, alih-alih menyalin dari keyframe berikutnya |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Potong 5 detik pertama dan 10 detik terakhir, berapa pun panjang videonya:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Ketika `precise` bernilai `false` (nilai bawaan), klip dimulai tepat pada frame yang diminta. Hanya frame antara titik mulai itu dan keyframe berikutnya yang dienkode ulang, sisanya disalin, sehingga tetap cepat. Bagian akhir bisa berlebih satu frame atau lebih, karena stream yang disalin mempertahankan frame yang menjadi acuan frame sebelumnya. Sumber yang tidak dapat disambung dengan aman (H.264 10-bit atau interlaced, codec lain yang memerlukan awal yang dienkode ulang, atau file AVI, FLV, MPEG dan TS) dienkode ulang sepenuhnya.
- Menyetel `precise` ke `true` selalu mengenkode ulang seluruh rentang, sehingga kedua ujung tepat, tetapi memakan waktu lebih lama.
- Pada range mode, `endS` harus lebih besar dari `startS`. Jika `endS` melewati akhir video, klip berjalan sampai akhir.
- Pada ends mode, setidaknya salah satu dari `cutStartS` dan `cutEndS` harus di atas nol, dan keduanya bersama harus menyisakan sebagian video. Karena pemotongan diukur dari panjang masing-masing file, satu pengaturan berlaku untuk sekumpulan video dengan durasi berbeda.
