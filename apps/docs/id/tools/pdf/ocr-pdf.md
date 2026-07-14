---
description: "Ekstrak teks dari PDF yang dipindai secara lokal dengan Tesseract bawaan atau runtime RapidOCR opsional dengan akurasi tinggi."
i18n_output_hash: 773cab1835b3
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

Ekstrak teks dari dokumen PDF yang dipindai halaman demi halaman tanpa mengirim PDF ke layanan eksternal. Tingkat `fast` bawaan menggunakan Tesseract. Tingkat opsional `balanced` dan `best` menggunakan RapidOCR dengan model PP-OCR ONNX yang disematkan.


<!-- korean-ocr-contract:start -->
::: info Kompatibilitas OCR bahasa Korea
OCR Cepat mendukung `auto`, `en`, `de`, `es`, `fr`, `zh`, dan `ja`, tetapi tidak mendukung bahasa Korea (`ko`). Bahasa Korea memerlukan paket OCR Akurat dan `balanced` atau `best`. Paket berjalan pada kontainer resmi Linux amd64 dan arm64, termasuk host NVIDIA dengan OCR tetap memakai CPU. Sistem yang tidak didukung menerima kesalahan kompatibilitas yang jelas dan tidak pernah diam-diam kembali ke `fast`. Bahasa Korea dengan `fast` atau alias lama `tesseract` ditolak sebelum antre dengan `FEATURE_INCOMPATIBLE` dan `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings` opsional.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Ya | - | File PDF (multibagian), hingga 512 MiB dikodekan; batas unggah operator yang lebih rendah masih berlaku |
| quality | string | TIDAK | Dinamis | Tingkat kualitas OCR: `fast`, `balanced`, atau `best` |
| language | string | No | `"auto"` | Bahasa dokumen: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Pemilihan halaman, mis. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | TIDAK | Bergantung pada tingkatan | Tingkatkan kontras lokal sebelum pengenalan. Fast menerapkannya secara langsung; Seimbang dan Terbaik mempertahankan varian hanya jika penilaian yang dikalibrasi meningkatkan hasilnya. Defaultnya adalah `true` untuk `best` dan `false` untuk `fast`/`balanced` |
| engine | string | TIDAK | - | Alias ​​​​kompatibilitas yang tidak digunakan lagi. Gunakan `quality` sebagai gantinya. `tesseract` dipetakan ke `fast`; nilai `paddleocr` lama dipetakan ke `balanced` tetapi tidak memuat PaddlePaddle |

Jika `quality` dan `engine` tidak diberikan, SnapOtter memilih tingkat terbaik yang tersedia dengan urutan `best`, `balanced`, lalu `fast`. Untuk bahasa Korea, `fast` tidak pernah dipilih; sistem memakai `best`, lalu `balanced`, atau mengembalikan kesalahan instalasi maupun kompatibilitas runtime akurat.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

Mengembalikan `202 Accepted`. Lacak progres melalui SSE di `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Format input yang diterima: `.pdf`.
- `fast` sudah terpasang dan menambahkan sekitar 25 MiB ke gambar resmi. `balanced` dan `best` memerlukan paket OCR opsional yang akurat (sekitar 208-234 MiB untuk diunduh dan 409-488 MiB diinstal, tergantung pada targetnya).
- Paket akurat mendukung Linux amd64 dan arm64 dan menggunakan ONNX Runtime di CPU, termasuk pada host NVIDIA.
- Tingkat yang diminta secara eksplisit tidak pernah diturunkan secara diam-diam. Jika `balanced` atau `best` tidak tersedia, API mengembalikan `501` dengan `FEATURE_NOT_INSTALLED` atau `FEATURE_INCOMPATIBLE`.
- Halaman PDF diraster pada resolusi tinggi sebelum OCR. `best` menjalankan model PP-OCRv6 medium dengan akurasi lebih tinggi dan menilai varian orientasi dan peningkatan, meningkatkan pengenalan dengan mengorbankan kecepatan.
- Pengaturan bahasa `auto` memungkinkan pengenalan di seluruh kumpulan skrip yang didukung; petunjuk eksplisit dapat meningkatkan hasil untuk bahasa dokumen yang dikenal.
- Anda dapat menargetkan halaman tertentu menggunakan rentang (`"1-3"`), daftar yang dipisahkan koma (`"1,3,5"`), atau `"all"` untuk setiap halaman.
- Permintaan dapat memproses paling banyak 50 halaman. Data awal yang diraster dibatasi pada 512 MiB dan respons agregat UTF-8 OCR dibatasi pada 1.000.000 byte; pekerjaan yang melebihi batas gagal daripada mengembalikan sebagian teks.
- Untuk PDF yang sudah berisi teks yang dapat dipilih, pertimbangkan untuk menggunakan alat [PDF to Text](./pdf-to-text) yang lebih cepat.
