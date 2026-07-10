---
description: "Susun ulang halaman dalam PDF dengan urutan halaman eksplisit."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 8a9ff6eba248
---

# Organize PDF {#organize-pdf}

Susun ulang halaman dalam PDF dengan menentukan urutan halaman yang diinginkan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | Urutan halaman yang diinginkan dalam sintaks qpdf, mis. `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Rentang halaman menggunakan sintaks qpdf: `3,1,2` menyusun ulang tiga halaman pertama, dan `5-z` menambahkan halaman 5 sampai halaman terakhir.
- Halaman dapat diduplikasi dengan menuliskannya lebih dari sekali (mis. `"1,1,2,3"` menduplikasi halaman 1).
- Halaman yang tidak tercantum dalam string urutan diabaikan dari output.
