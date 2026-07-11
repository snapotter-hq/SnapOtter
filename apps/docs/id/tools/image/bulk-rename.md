---
description: "Ganti nama beberapa berkas menggunakan templat pola dan unduh sebagai ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 76f871222bea
---

# Ganti Nama Massal {#bulk-rename}

Ganti nama beberapa berkas menggunakan templat pola dengan placeholder untuk indeks, indeks berpad, dan nama berkas asli. Mengembalikan arsip ZIP yang berisi semua berkas yang telah diganti namanya.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Menerima data formulir multipart dengan beberapa berkas dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| pattern | string | Tidak | `"image-{{index}}"` | Pola penamaan dengan placeholder (maks 1000 karakter) |
| startIndex | number | Tidak | `1` | Nomor indeks awal |

### Placeholder Pola {#pattern-placeholders}

| Placeholder | Deskripsi | Contoh |
|-------------|-------------|---------|
| `{{index}}` | Nomor berurutan mulai dari `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Nomor berurutan berpad nol | `01`, `02`, `03` |
| `{{original}}` | Nama berkas asli tanpa ekstensi | `photo`, `IMG_001` |

Ekstensi berkas asli selalu dipertahankan.

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Ini menghasilkan: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Menggunakan nama berkas asli:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Ini menghasilkan: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Contoh Respons {#example-response}

Respons berupa berkas ZIP yang dialirkan langsung (bukan respons JSON). Header respons adalah:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Catatan {#notes}

- Alat ini tidak memproses gambar. Alat ini hanya mengganti nama berkas dan mengemasnya ke dalam arsip ZIP.
- Lebar pad-nol untuk `{{padded}}` ditentukan secara otomatis berdasarkan jumlah total berkas (mis. 100 berkas akan menggunakan pad 3 digit: `001`, `002`, dll.).
- Ekstensi berkas dipertahankan dari nama berkas asli.
- Nama berkas dibersihkan untuk menghapus karakter yang tidak aman.
- Setidaknya satu berkas harus disediakan.
