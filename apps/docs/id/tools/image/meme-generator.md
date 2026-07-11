---
description: "Buat meme dengan template atau gambar kustom, kotak teks bergaya, dan opsi font."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: d7f0e92faa8c
---

# Meme Generator {#meme-generator}

Buat meme menggunakan template bawaan atau gambar kustom. Tambahkan teks dengan gaya meme klasik (teks tebal dengan garis tepi), beberapa preset tata letak, dan pilihan font.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Menerima salah satu dari:
- **Multipart form data** dengan berkas gambar dan field JSON `settings` (mode gambar kustom)
- **JSON body** dengan `templateId` (mode template, tanpa perlu unggah berkas)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | No | - | ID template meme bawaan. Jika disediakan, tidak perlu mengunggah gambar |
| textLayout | string | No | `"top-bottom"` | Tata letak kotak teks: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | No | `[]` | Array objek kotak teks dengan field `id` dan `text` |
| fontFamily | string | No | `"anton"` | Font: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | No | auto | Ukuran font dalam piksel (8 hingga 200). Dihitung otomatis jika dihilangkan |
| textColor | string | No | `"#ffffff"` | Warna isi teks |
| strokeColor | string | No | `"#000000"` | Warna garis tepi/outline teks |
| textAlign | string | No | `"center"` | Perataan teks: `left`, `center`, `right` |
| allCaps | boolean | No | `true` | Ubah teks menjadi huruf besar |

### Text Boxes {#text-boxes}

Setiap entri dalam array `textBoxes` harus memiliki:

| Field | Type | Description |
|-------|------|-------------|
| id | string | Pengenal kotak yang cocok dengan tata letak (mis., `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Teks meme yang akan ditampilkan |

### Text Layout Box IDs {#text-layout-box-ids}

| Layout | Available Box IDs |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Example Request {#example-request}

Gambar kustom dengan teks atas dan bawah:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Menggunakan template bawaan (JSON body, tanpa unggah berkas):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notes {#notes}

- Salah satu dari `templateId` atau berkas gambar yang diunggah wajib disediakan. Menyediakan keduanya akan menggunakan template.
- Template menentukan posisi kotak teksnya sendiri; parameter `textLayout` diabaikan saat menggunakan template.
- Teks dirender sebagai SVG dengan outline garis tepi untuk tampilan meme klasik.
- Ukuran font dihitung otomatis agar pas dengan kotak teks jika tidak diatur secara eksplisit.
- Kotak teks kosong dilewati (tidak ada rendering yang terjadi jika semua kotak kosong).
- Nama berkas output menyertakan ID template saat menggunakan template (mis., `meme-drake.png`).
- Input HEIC, RAW, PSD, dan SVG didekode secara otomatis sebelum diproses.
