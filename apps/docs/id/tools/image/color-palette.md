---
description: "Ekstrak warna dominan dari gambar sebagai palet warna."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: f5e6cff88bc4
---

# Palet Warna {#color-palette}

Ekstrak warna dominan dari gambar dan kembalikan sebagai nilai warna hex. Menggunakan analisis frekuensi terkuantisasi untuk mengidentifikasi warna yang paling menonjol dan berbeda secara visual.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Menerima data formulir multipart dengan file gambar dan field JSON `settings` opsional.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Default | Deskripsi |
|-----------|------|----------|---------|-------------|
| count | integer | Tidak | `8` | Jumlah warna yang diekstrak (2-16) |
| format | string | Tidak | `"hex"` | Format warna: `hex`, `rgb`, `hsl` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Contoh Respons {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Field Respons {#response-fields}

| Field | Tipe | Deskripsi |
|-------|------|-------------|
| filename | string | Nama file yang disanitasi |
| colors | array | Array string warna dalam format yang diminta, diurutkan berdasarkan dominasi (paling sering muncul lebih dulu) |
| hex | array | Array string warna hex (selalu hex, terlepas dari pengaturan `format`) |
| count | number | Jumlah warna yang diekstrak |

## Catatan {#notes}

- Mengembalikan hingga `count` warna dominan (default 8, rentang 2-16), diurutkan berdasarkan frekuensi (paling umum lebih dulu).
- Gambar diubah ukurannya secara internal menjadi 100x100 piksel untuk analisis, sehingga palet merepresentasikan distribusi warna keseluruhan alih-alih detail kecil.
- Warna diekstrak menggunakan kuantisasi median-cut, yang secara rekursif membagi populasi piksel di sepanjang kanal dengan rentang terlebar.
- Kanal alfa dihapus sebelum analisis, sehingga area transparan tidak diperhitungkan.
- Ini adalah endpoint hanya-baca. Ia tidak menghasilkan file output yang dapat diunduh atau `jobId`.
- Input HEIC, RAW, PSD, dan SVG didekode otomatis sebelum analisis.
