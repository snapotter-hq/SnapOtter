---
description: "Ubah teks menjadi HURUF BESAR, huruf kecil, Title, Sentence case, dan lainnya."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: da217a05848b
i18n_hash_version: 2
---

# Convert Case {#convert-case}

Tempel teks, pilih jenis huruf, lalu salin hasilnya. Teks dikirim ke server SnapOtter Anda sendiri dan tidak ke tempat lain.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Menerima body JSON, bukan multipart form data, dan menjawab dengan teks hasil konversi, bukan file untuk diunduh.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (wajib) | Teks yang akan dikonversi. Hingga 1.000.000 karakter. |
| `mode` | string | (wajib) | Salah satu mode di bawah. |
| `locale` | string | (tidak ada) | Tag bahasa BCP 47, seperti `tr` atau `de`, untuk huruf yang kapitalisasinya bergantung pada bahasa. Tanpa ini, kapitalisasi sama untuk semua bahasa. |

| Mode | Input | Output |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` mempertahankan kata bahasa Inggris pendek (a, an, and, of, the, to, dan sejenisnya) dalam huruf kecil kecuali di awal atau akhir baris. `capitalized` mengkapitalisasi setiap kata.
- `sentence` memulai kalimat baru di awal teks, setelah jeda baris, dan setelah `.`, `!`, `?`, atau `…` yang diikuti spasi, sehingga titik pada `snapotter.com` atau `3.5` tidak dihitung.
- `camel`, `pascal`, `snake`, dan `kebab` memecah pada spasi, tanda baca, dan perubahan huruf yang sudah ada (`XMLHttpRequest` menjadi `xml_http_request`), dan mengonversi setiap baris secara terpisah.
- Dengan `locale` diatur ke `tr`, `i` menjadi huruf besar `İ` dan `I` menjadi huruf kecil `ı`. `ß` dalam bahasa Jerman menjadi `SS` saat dijadikan huruf besar di semua locale.
- Aplikasi web mengirim bahasa antarmuka saat ini sebagai `locale`.
