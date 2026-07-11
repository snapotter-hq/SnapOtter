---
description: "Pindai gambar untuk kode QR, barcode, dan kode 2D dengan keluaran beranotasi."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 2bab3a516dd4
---

# Pembaca Barcode {#barcode-reader}

Pindai gambar yang diunggah untuk semua jenis barcode dan kode QR. Mengembalikan teks yang didekode, jenis barcode, dan data posisi untuk setiap kode yang terdeteksi. Juga menghasilkan gambar beranotasi dengan kotak pembatas berwarna di sekitar kode yang terdeteksi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Menerima data formulir multipart dengan berkas gambar dan bidang JSON `settings` opsional.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | Tidak | `true` | Aktifkan mode pemindaian agresif untuk barcode yang lebih sulit dibaca (lebih lambat tetapi lebih menyeluruh) |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Contoh Respons {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Bidang Respons {#response-fields}

| Bidang | Tipe | Deskripsi |
|-------|------|-------------|
| filename | string | Nama berkas asli |
| barcodes | array | Larik objek barcode yang terdeteksi |
| annotatedUrl | string atau null | URL untuk mengunduh gambar beranotasi (null jika tidak ada barcode ditemukan) |
| previewUrl | string atau null | Sama seperti annotatedUrl (untuk kompatibilitas pratinjau frontend) |

### Objek Barcode {#barcode-object}

| Bidang | Tipe | Deskripsi |
|-------|------|-------------|
| type | string | Format barcode (QRCode, EAN-13, Code128, DataMatrix, PDF417, dll.) |
| text | string | Konten barcode yang didekode |
| position | object | Kotak pembatas dengan koordinat topLeft, topRight, bottomLeft, bottomRight |

## Jenis Barcode yang Didukung {#supported-barcode-types}

Barcode 1D: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

Barcode 2D: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Catatan {#notes}

- Menggunakan pustaka zxing-wasm untuk deteksi barcode.
- Gambar beranotasi menampilkan kotak pembatas poligon berwarna dan label bernomor pada setiap barcode yang terdeteksi.
- Hingga 255 barcode dapat dideteksi dalam satu gambar.
- Jika tidak ada barcode ditemukan, `barcodes` adalah larik kosong dan `annotatedUrl` adalah null.
- Mode `tryHarder` melakukan pemindaian yang lebih menyeluruh dengan mengorbankan waktu pemrosesan. Nonaktifkan untuk pemrosesan yang lebih cepat pada barcode yang bersih dan sejajar dengan baik.
- Keluaran beranotasi selalu berformat PNG.
- Input HEIC, RAW, PSD, dan SVG didekode secara otomatis sebelum pemindaian.
- Orientasi EXIF diterapkan secara otomatis sebelum pemrosesan.
