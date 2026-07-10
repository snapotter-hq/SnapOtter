---
description: "Konversi PDF menjadi dokumen Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: ad10c3ef1d5f
---

# PDF to Word {#pdf-to-word}

Konversi PDF berbasis teks menjadi dokumen Word (DOCX). Paling cocok untuk PDF dengan teks yang dapat dipilih; halaman hasil pindai perlu OCR terlebih dahulu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Menerima data form multipart berisi file PDF.

## Parameters {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah PDF dan akan dikonversi menjadi DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
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
- Bekerja paling baik dengan PDF berbasis teks. Halaman hasil pindai atau khusus gambar akan menghasilkan output kosong atau minimal; gunakan [PDF OCR](./ocr-pdf) untuk menambahkan lapisan teks terlebih dahulu.
- Konversi ditangani oleh LibreOffice yang berjalan headless di server.
- Tata letak yang kompleks (multi-kolom, elemen yang tumpang-tindih) mungkin tidak terkonversi dengan sempurna.
