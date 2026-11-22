---
description: "Hitung lebar atau tinggi yang hilang agar rasio aspek tetap sama, dan sederhanakan rasionya."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 2ad53a2cd99a
i18n_hash_version: 2
---

# Kalkulator rasio aspek {#aspect-ratio-calculator}

Masukkan lebar dan tinggi asli, lalu lebar baru atau tinggi baru, dan sisi lainnya akan dihitung agar proporsinya tetap sama. Rasio ditampilkan dalam bentuk paling sederhana, jadi 1920 × 1080 menjadi 16:9. Di aplikasi web, Anda bisa mulai dari rasio umum (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) dan beralih antara lanskap dan potret.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Menerima body JSON (bukan data formulir multipart) dan mengembalikan angka, bukan berkas untuk diunduh.

## Parameter {#parameters}

| Parameter | Tipe | Bawaan | Deskripsi |
|-----------|------|--------|-----------|
| `width` | number | (wajib) | Lebar asli. |
| `height` | number | (wajib) | Tinggi asli. |
| `newWidth` | number | - | Lebar target. Respons menghitung `newHeight` dari nilai ini. |
| `newHeight` | number | - | Tinggi target. Respons menghitung `newWidth` dari nilai ini. |
| `round` | boolean | `true` | Bulatkan sisi yang dihitung menjadi bilangan bulat. Saat `false`, hasilnya mempertahankan dua angka desimal. |

Setiap dimensi harus berada di antara `0.0001` dan `1000000`. Kirim `newWidth` atau `newHeight`, jangan keduanya. Kosongkan keduanya untuk mendapatkan rasio yang disederhanakan saja.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Contoh Respons {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` dan `newHeight` bernilai `null` jika permintaan tidak mengirim keduanya.

## Catatan {#notes}

- Ukuran pecahan dikurangi menjadi rasio bilangan bulat dengan hingga empat angka desimal, sehingga `8.5` × `11` menjadi `17:22`.
- `ratioDecimal` adalah lebar dibagi tinggi, dibulatkan ke empat angka desimal.
- Sisi yang dihitung tidak pernah bernilai `0`. Dengan pembulatan aktif nilainya minimal `1`, dan tanpa pembulatan nilainya minimal `0.01`.
- Mengirim `newWidth` dan `newHeight` sekaligus, atau dimensi di luar rentang yang diizinkan, mengembalikan 400.
- Kalkulator ini tidak pernah membaca atau menulis berkas. Untuk menerapkan angkanya, gunakan [Ubah Ukuran Gambar](/id/tools/image/resize) atau [Potong Gambar](/id/tools/image/crop).
