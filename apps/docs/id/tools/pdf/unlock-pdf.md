---
description: "Hapus perlindungan kata sandi dari PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 0a16b0475670
---

# Unlock PDF {#unlock-pdf}

Hapus perlindungan kata sandi dari PDF terenkripsi dengan memberikan kata sandi yang benar.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | Kata sandi untuk mendekripsi PDF (1-256 karakter) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Kata sandi yang benar harus diberikan; kata sandi yang salah mengembalikan error 400.
- Baik kata sandi pengguna maupun kata sandi pemilik dapat digunakan untuk dekripsi.
- Kata sandi disunting dari log audit.
