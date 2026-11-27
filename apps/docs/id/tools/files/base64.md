---
description: "Encode teks ke Base64 atau decode Base64 kembali ke teks."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: ae9586741563
i18n_hash_version: 2
---

# Base64 Encode / Decode {#base64}

Tempel teks untuk mendapatkan Base64, atau tempel Base64 untuk mendapatkan teksnya kembali, lalu salin hasilnya. Teks dikirim ke server SnapOtter Anda sendiri dan tidak ke tempat lain.

Untuk mengubah gambar menjadi Base64, gunakan [Image to Base64](/id/tools/image/image-to-base64).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

Menerima body JSON, bukan multipart form data, dan menjawab dengan teks hasil konversi, bukan file untuk diunduh.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (wajib) | Teks yang akan di-encode, atau Base64 yang akan di-decode. Hingga 1.000.000 karakter. |
| `mode` | string | (wajib) | `encode` atau `decode`. |
| `urlSafe` | boolean | `false` | Saat encode, gunakan alfabet aman URL (`-` dan `_`) dan hilangkan padding `=`. Diabaikan saat decode. |

## Example Request {#example-request}

Encode:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Decode:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- Teks di-encode sebagai UTF-8, jadi huruf beraksen, CJK, dan emoji kembali utuh.
- Decode mengabaikan spasi dan jeda baris, sehingga Base64 yang dibungkus pada 76 kolom (email, isi PEM) bisa di-decode apa adanya saat ditempel.
- Decode menerima input dengan atau tanpa padding `=`, baik dalam alfabet standar (`+`, `/`) maupun aman URL (`-`, `_`), tetapi tidak campuran keduanya.
- Input yang bukan Base64 gagal dengan 400 dan kode `ENCODED_TEXT_INVALID`. Base64 valid yang di-decode menjadi data biner (gambar, ZIP), bukan teks UTF-8, gagal dengan `DECODED_DATA_NOT_TEXT`.
