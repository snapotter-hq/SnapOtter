---
description: "Ekstrak teks dari dokumen PDF menggunakan OCR bertenaga AI."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: ec3055271630
---

# PDF OCR {#pdf-ocr}

Ekstrak teks dari dokumen PDF menggunakan pengenalan karakter optik bertenaga AI. Mendukung beberapa tingkat kualitas dan bahasa. Membutuhkan feature bundle OCR untuk terpasang.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings` opsional.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Tingkat kualitas OCR: `fast`, `balanced`, `best` |
| language | string | No | `"auto"` | Bahasa dokumen: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Pemilihan halaman, mis. `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
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
- Ini adalah alat AI yang membutuhkan **feature bundle OCR** untuk terpasang. Jika bundle tidak terpasang, API mengembalikan `501 Not Implemented`.
- Tingkat kualitas `fast` menggunakan model yang lebih ringan untuk pemrosesan lebih cepat; `best` menggunakan model yang lebih akurat dengan mengorbankan kecepatan.
- Pengaturan bahasa `auto` mencoba mendeteksi bahasa dokumen secara otomatis.
- Anda dapat menargetkan halaman tertentu menggunakan rentang (`"1-3"`), daftar yang dipisahkan koma (`"1,3,5"`), atau `"all"` untuk setiap halaman.
- Untuk PDF yang sudah berisi teks yang dapat dipilih, pertimbangkan untuk menggunakan alat [PDF to Text](./pdf-to-text) yang lebih cepat.
