---
description: "Konversi dokumen Word menjadi PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 1289f9ccc0c1
---

# Word ke PDF {#word-to-pdf}

Konversi dokumen Word, teks OpenDocument, RTF, atau berkas teks biasa menjadi PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Menerima data formulir multipart dengan berkas Word/ODT/RTF/TXT.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah dokumen dan dokumen tersebut akan dikonversi menjadi PDF.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Format input yang diterima: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Konversi ditangani oleh LibreOffice yang berjalan headless di server.
- Font yang tertanam dalam dokumen digunakan jika tersedia; jika tidak, font sistem menjadi penggantinya.
- Header, footer, tabel, dan gambar dipertahankan dalam keluaran PDF.
