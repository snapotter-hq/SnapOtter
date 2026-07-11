---
description: "Konversi berkas Word, Markdown, HTML, atau teks biasa menjadi EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: fa7e6db41fb7
---

# Konversi ke EPUB {#convert-to-epub}

Konversi dokumen Word, Markdown, HTML, atau berkas teks biasa menjadi format e-book EPUB.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Menerima data formulir multipart dengan berkas Word/Markdown/HTML/TXT.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah dokumen dan dokumen tersebut akan dikonversi menjadi EPUB.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
```

## Contoh Respons {#example-response}

Mengembalikan `202 Accepted`. Lacak progres melalui SSE di `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Catatan {#notes}

- Format input yang diterima: `.docx`, `.md`, `.html`, `.txt`.
- Keluaran EPUB mengikuti spesifikasi EPUB 3.
- Judul dalam dokumen sumber digunakan untuk menghasilkan daftar isi.
- Konversi ditangani oleh Pandoc di server.
