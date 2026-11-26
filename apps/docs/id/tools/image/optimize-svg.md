---
description: "Minifikasi file SVG dengan svgo dan pertahankan hasilnya sebagai SVG vektor, dengan kontrol presisi, multipass, metadata, dan format."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 55de65d841b2
i18n_hash_version: 2
---

# Optimasi SVG {#optimize-svg}

Perkecil file SVG dengan menghapus sisa editor, atribut berlebih, dan angka desimal yang tidak perlu, lalu unduh hasilnya sebagai SVG. Berbeda dengan “Optimalkan untuk Web”, keluarannya tidak pernah dirasterisasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Menerima data formulir multipart dengan file `.svg` atau `.svgz` dan kolom JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| precision | number | No | `3` | Jumlah angka desimal yang dipertahankan pada data path dan angka (0 sampai 8). Nilai lebih rendah menghasilkan file lebih kecil dan kurva sedikit lebih kasar. |
| multipass | boolean | No | `true` | Jalankan pengoptimal berulang kali sampai keluaran tidak mengecil lagi |
| removeMetadata | boolean | No | `true` | Hapus komentar, `<metadata>`, `<desc>`, dan data khusus editor. Matikan untuk mempertahankannya. |
| pretty | boolean | No | `false` | Beri indentasi pada keluaran agar mudah dibaca, bukan meminifikasinya menjadi beberapa baris |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notes {#notes}

- Masukan harus berupa file SVG atau SVGZ. Gambar raster ditolak dengan `400` dan kode `IMAGE_UNDECODABLE`.
- Masukan `.svgz` diekstrak lebih dulu, dan keluarannya selalu berupa `.svg` biasa.
- SVG dibatasi 10 MB setelah diekstrak. File yang lebih besar ditolak dengan `400` dan kode `SVG_TOO_LARGE`.
- `viewBox` dan `<title>` selalu dipertahankan, sehingga grafik tetap dapat diskalakan dan mempertahankan nama aksesibelnya.
- Masukan dan keluaran sama-sama melewati sanitizer SVG, yang menghapus skrip dan konten aktif lainnya.
- Menurunkan `precision` memberi penghematan ukuran terbesar untuk karya dengan banyak path. Periksa hasilnya secara visual pada nilai 0 sampai 2.
