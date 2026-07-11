---
description: "Konversi berkas Markdown menjadi PDF bergaya."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: f7abdf1cddf6
---

# Markdown ke PDF {#markdown-to-pdf}

Konversi berkas Markdown menjadi dokumen PDF bergaya. Sumber daya jarak jauh dinonaktifkan demi privasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Menerima data formulir multipart dengan berkas Markdown.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah berkas Markdown dan berkas tersebut akan dikonversi menjadi PDF.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- Format input yang diterima: `.md`, `.markdown`.
- Sumber daya jarak jauh (gambar, lembar gaya yang dirujuk melalui URL) tidak diambil demi privasi dan keamanan.
- Markdown pertama-tama dirender ke HTML, lalu dikonversi menjadi PDF melalui WeasyPrint.
- Blok kode, tabel, dan elemen Markdown lainnya diberi gaya dalam keluaran PDF.
