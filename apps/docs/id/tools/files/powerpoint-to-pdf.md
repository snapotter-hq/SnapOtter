---
description: "Konversi presentasi menjadi PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 4bf864dbebcf
---

# PowerPoint ke PDF {#powerpoint-to-pdf}

Konversi presentasi PowerPoint atau OpenDocument menjadi PDF, dengan satu slide per halaman.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Menerima data formulir multipart dengan berkas PowerPoint/ODP.

## Parameter {#parameters}

Alat ini tidak memiliki parameter yang dapat dikonfigurasi. Unggah presentasi dan presentasi tersebut akan dikonversi menjadi PDF.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
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

- Format input yang diterima: `.pptx`, `.ppt`, `.odp`.
- Setiap slide menjadi satu halaman dalam PDF.
- Konversi ditangani oleh LibreOffice yang berjalan headless di server.
- Animasi dan transisi tidak disertakan dalam keluaran PDF.
