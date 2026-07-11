---
description: "Konversi gambar menjadi data URI base64 untuk disematkan di HTML, CSS, dan lainnya."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 227c40249375
---

# Image to Base64 {#image-to-base64}

Konversi satu atau lebih gambar menjadi string dan data URI berenkode base64. Mendukung konversi format opsional, kontrol kualitas, dan pengubahan ukuran. Berguna untuk menyematkan gambar langsung di HTML, CSS, JSON, atau template email.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Menerima multipart form data dengan satu atau lebih file gambar dan sebuah field JSON `settings` opsional.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"original"` | Konversi sebelum encoding: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | No | `80` | Kualitas output untuk format lossy (1 hingga 100) |
| maxWidth | number | No | `0` | Lebar maksimum dalam piksel (0 = tanpa pengubahan ukuran, tidak akan memperbesar) |
| maxHeight | number | No | `0` | Tinggi maksimum dalam piksel (0 = tanpa pengubahan ukuran, tidak akan memperbesar) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Beberapa file:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Example Response {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| results | array | Gambar yang berhasil dikonversi |
| errors | array | Gambar yang gagal diproses (dengan nama file dan pesan error) |

### Result Object {#result-object}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Nama file asli |
| mimeType | string | Tipe MIME dari output yang dikodekan |
| width | number | Lebar akhir dalam piksel (setelah pengubahan ukuran, jika ada) |
| height | number | Tinggi akhir dalam piksel (setelah pengubahan ukuran, jika ada) |
| originalSize | number | Ukuran file asli dalam byte |
| encodedSize | number | Ukuran string base64 dalam byte |
| overheadPercent | number | Persentase perbedaan ukuran vs asli (positif = lebih besar, negatif = lebih kecil) |
| base64 | string | Data gambar berenkode base64 mentah |
| dataUri | string | Data URI lengkap siap digunakan pada atribut `src` |

## Notes {#notes}

- Encoding base64 umumnya menaikkan ukuran sekitar 33% dibandingkan file biner. Field `overheadPercent` menunjukkan perbedaan yang sebenarnya.
- Ketika `outputFormat` adalah `"original"`, file HEIC/HEIF dikonversi ke JPEG (karena browser tidak dapat menampilkan HEIC dalam data URI).
- Opsi `maxWidth` dan `maxHeight` mengubah ukuran menggunakan `fit: inside` dengan `withoutEnlargement`, sehingga gambar yang lebih kecil dari dimensi yang ditentukan tidak diperbesar.
- Beberapa file dapat diproses dalam satu permintaan. Setiap file diproses secara independen, dan kegagalan tidak menghalangi file lain untuk berhasil.
- File SVG diteruskan sebagai `image/svg+xml` tanpa encoding ulang (kecuali konversi format diminta).
- Ini adalah endpoint read-only. Ia tidak menghasilkan file yang dapat diunduh atau sebuah `jobId`. Data base64 dikembalikan langsung di body respons.
