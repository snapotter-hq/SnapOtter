---
description: "Tambahkan perlindungan kata sandi dengan enkripsi AES-256 ke PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 583b8082e980
---

# Protect PDF {#protect-pdf}

Tambahkan perlindungan kata sandi ke PDF menggunakan enkripsi AES-256.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | Kata sandi yang diperlukan untuk membuka PDF (1-256 karakter) |
| ownerPassword | string | No | Sama dengan `userPassword` | Kata sandi pemilik untuk izin (1-256 karakter) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Enkripsi menggunakan AES-256.
- Jika `ownerPassword` dihilangkan, ia default ke nilai yang sama dengan `userPassword`.
- Kata sandi disunting dari log audit.
- PDF terenkripsi membutuhkan kata sandi pengguna untuk membuka dan kata sandi pemilik (jika berbeda) untuk izin penuh.
