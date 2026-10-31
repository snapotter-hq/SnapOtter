---
description: "Susun ulang, putar, hapus, dan tarik halaman dari PDF lain dalam satu editor atau melalui API."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 31993e0e775d
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Susun PDF dari rencana halaman yang eksplisit: susun ulang, duplikat, putar, atau hapus halaman, dan tarik halaman dari PDF tambahan, semuanya dalam satu permintaan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Menerima data formulir multipart dengan satu atau lebih file PDF dan field JSON `settings`.
Hingga 20 dokumen input dan 1.200 halaman output didukung per permintaan.

## Parameters {#parameters}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| items | array | Yes | Rencana halaman output, dalam urutan output. Setiap item adalah `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` mengindeks file yang diunggah dalam urutan unggah (berbasis 0); `page` adalah nomor halaman berbasis 1 dalam dokumen tersebut. |
| pageCounts | array | Yes | Jumlah halaman sebenarnya dari setiap dokumen yang diunggah, dalam urutan yang sama. Halaman rencana yang melebihi jumlah halaman dokumennya ditolak dengan 400. |

## Example Request {#example-request}

Ambil halaman 3 dan 1 dari dokumen pertama, lalu halaman 1 dan 2 dari dokumen kedua, putar halaman output pertama sebesar 90° searah jarum jam:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Halaman yang sama dapat muncul beberapa kali di `items` untuk menduplikasinya.
- Halaman yang tidak ada di `items` dihilangkan dari output.
- `rot` mencatat orientasi tampilan baru pada halaman yang disalin (digabungkan dengan rotasi yang ada); konten halaman tidak diubah.
- Rotasi diterapkan per salinan output, sehingga duplikat dapat memiliki rotasi berbeda.
- Output adalah dokumen baru yang datar; bookmark sumber dan metadata tingkat dokumen tidak dipertahankan.
- Pemrosesan memerlukan biner qpdf, yang disertakan dalam image Docker resmi.
