---
description: "Konversi font antara TTF, OTF, WOFF, dan WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 921f8b718cde
i18n_hash_version: 2
---

# Konversi Font {#convert-font}

Mengonversi berkas font antara TrueType (TTF), OpenType CFF (OTF), WOFF, dan WOFF2. Gunakan untuk mengubah font desktop menjadi font web, atau untuk mendapatkan TTF dari OTF bagi aplikasi yang hanya menerima TrueType.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Menerima data formulir multipart dengan berkas `.ttf`, `.otf`, `.woff`, atau `.woff2` dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| format | string | Tidak | `ttf` | Format keluaran: `ttf`, `otf`, `woff`, atau `woff2` |

## Contoh Permintaan {#example-request}

OTF ke TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF ke WOFF2 untuk web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Catatan {#notes}

- WOFF dan WOFF2 adalah pembungkus terkompresi untuk data font yang sama, jadi konversi ke atau dari format tersebut tidak mengubah garis bentuk.
- Konversi OTF ke TTF mengubah kurva kubik (CFF) menjadi kurva kuadratik TrueType. Setiap kurva tetap dalam 1 unit font dari aslinya, yang tidak terlihat pada ukuran normal, tetapi konversinya tidak bisa dibalik secara persis. Konversi TTF ke OTF mempertahankan bentuk kurva dan hanya membulatkan titik kontrol ke unit font bulat.
- Izin penyematan font (bidang OS/2 `fsType`) tetap seperti aslinya.
- Koleksi font (`.ttc`) tidak didukung. Font TrueType variabel tidak bisa dikonversi ke OTF, dan font CFF2 variabel tidak bisa dikonversi ke TTF; konversikan font tersebut ke WOFF atau WOFF2 sebagai gantinya.
- Konversi berjalan di worker dokumen Python dengan batas waktu yang sama seperti alat dokumen lainnya, bukan di dalam proses API.
