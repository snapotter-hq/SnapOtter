---
description: "Deteksi gambar duplikat dan nyaris-duplikat menggunakan perceptual hashing."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: a40dc543bfa4
---

# Find Duplicates {#find-duplicates}

Unggah beberapa gambar untuk mendeteksi duplikat dan nyaris-duplikat menggunakan perceptual hashing (dHash). Mengelompokkan gambar serupa, mengidentifikasi versi berkualitas terbaik di setiap grup, dan menghitung potensi penghematan ruang.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Menerima multipart form data dengan beberapa file gambar dan sebuah field JSON `settings` opsional.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| threshold | number | No | `8` | Jarak Hamming maksimum untuk menganggap gambar sebagai duplikat (0 hingga 20). Lebih rendah = pencocokan lebih ketat |

### File Fields {#file-fields}

Unggah setidaknya 2 file gambar dalam permintaan multipart (semuanya menggunakan nama field `file` atau nama field apa pun untuk bagian file).

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Example Response {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| totalImages | number | Jumlah gambar yang berhasil dianalisis |
| duplicateGroups | array | Grup gambar duplikat |
| uniqueImages | number | Jumlah gambar yang bukan bagian dari grup duplikat mana pun |
| spaceSaveable | number | Total byte yang bisa dihemat dengan menghapus duplikat non-terbaik |
| skippedFiles | array | File yang tidak dapat diproses (dengan nama file dan alasannya) |

### Duplicate Group Object {#duplicate-group-object}

| Field | Type | Description |
|-------|------|-------------|
| groupId | number | Pengenal grup |
| files | array | Gambar dalam grup duplikat ini |

### File Object (within a group) {#file-object-within-a-group}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Nama file asli |
| similarity | number | Persentase kemiripan terhadap gambar referensi (yang pertama dalam grup) |
| width | number | Lebar gambar dalam piksel |
| height | number | Tinggi gambar dalam piksel |
| fileSize | number | Ukuran file dalam byte |
| format | string | Format gambar |
| isBest | boolean | Apakah ini versi berkualitas tertinggi (piksel terbanyak, file terbesar) |
| thumbnail | string or null | Thumbnail JPEG base64 (lebar 200px) untuk pratinjau |

## Notes {#notes}

- Menggunakan dHash 128-bit (baris 64-bit + kolom 64-bit) untuk deteksi kemiripan perseptual. Ini menangkap duplikat bahkan lintas pengubahan ukuran, kompresi ulang, dan penyuntingan kecil.
- Threshold mewakili jarak Hamming maksimum antar hash. Nilai default 8 menangkap nyaris-duplikat sambil menghindari positif palsu. Gunakan 0 untuk yang identik piksel saja, atau 15-20 untuk pencocokan yang sangat longgar.
- Gambar "terbaik" di setiap grup adalah yang memiliki piksel terbanyak (lebar x tinggi), dengan ukuran file sebagai pemecah seri.
- Diperlukan setidaknya 2 gambar. File yang gagal validasi atau decoding dilaporkan di `skippedFiles` alih-alih menyebabkan seluruh permintaan gagal.
- Thumbnail adalah pratinjau JPEG selebar 200px yang dikodekan sebagai data URI.
- Semua format umum didukung (HEIC, RAW, PSD, SVG di-decode otomatis).
