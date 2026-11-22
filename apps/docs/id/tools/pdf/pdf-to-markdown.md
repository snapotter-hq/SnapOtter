---
description: "Konversi PDF menjadi Markdown, dengan judul, daftar, dan tabel dipertahankan jika ada di PDF."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 46fce930f456
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

Ubah PDF menjadi file Markdown yang bisa Anda masukkan ke wiki, situs statis, atau pipeline LLM.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Menerima data form multipart berisi file PDF.

## Parameters {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah PDF dan Anda akan mendapatkan file `.md`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

PDF besar bisa memakan waktu lebih lama daripada jendela sinkron. API lalu menjawab dengan `202` beserta `jobId`, dan Anda melacak progres di `/api/v1/jobs/{jobId}/progress`.

## Apa yang dipertahankan {#what-gets-kept}

PDF menyimpan teks yang sudah diposisikan, bukan struktur, sehingga konverter menyimpulkan strukturnya sendiri:

- **Judul.** Baris pendek dengan ukuran yang jelas lebih besar daripada teks isi menjadi judul `#` sampai `######`, diurutkan menurut ukuran di seluruh dokumen.
- **Daftar.** Baris yang diawali butir atau angka menjadi item daftar.
- **Tebal, miring, dan tautan.** Dipertahankan di dalam teks. Hanya tautan `http`, `https` dan `mailto` yang bertahan.
- **Tabel.** Tabel yang digambar dengan garis keluar sebagai tabel Markdown. Tabel yang ditata hanya dengan spasi biasanya keluar sebagai paragraf biasa.

Gambar dibuang. Tata letak multi-kolom dan desain halaman yang tidak lazim diproses semampunya, jadi periksa hasilnya sebelum Anda mengandalkannya.

## Notes {#notes}

- Format input yang diterima: `.pdf`.
- Kolom `chars` pada respons adalah panjang output Markdown.
- PDF hasil pindai tidak memiliki lapisan teks untuk dikonversi. Alat ini menolaknya dengan `422` dan kode `NO_TEXT_LAYER` alih-alih mengembalikan file kosong. Gunakan alat [PDF OCR](./ocr-pdf) untuk file semacam itu.
- Untuk konversi bolak-balik, [Markdown to PDF](../files/markdown-to-pdf), [Markdown to DOCX](../files/markdown-to-docx) dan [Markdown to HTML](../files/markdown-to-html) membaca file `.md`.
