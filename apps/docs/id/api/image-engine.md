---
description: "Referensi operasi mesin gambar. Semua operasi pemrosesan gambar berbasis Sharp dan parameternya."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 6e4ab098a101
---

# Mesin gambar {#image-engine}

Paket `@snapotter/image-engine` menangani semua operasi gambar non-AI. Ini membungkus [Sharp](https://sharp.pixelplumbing.com/) dan berjalan sepenuhnya in-process tanpa dependensi eksternal.

## Operasi {#operations}

### resize {#resize}

Skalakan gambar ke dimensi tertentu atau berdasarkan persentase.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `width` | number | Lebar target dalam piksel |
| `height` | number | Tinggi target dalam piksel |
| `fit` | string | `cover`, `contain`, `fill`, `inside`, atau `outside` |
| `withoutEnlargement` | boolean | Jika true, tidak akan memperbesar gambar yang lebih kecil |
| `percentage` | number | Skalakan berdasarkan persentase alih-alih dimensi absolut |

Anda dapat mengatur `width`, `height`, atau keduanya. Jika hanya mengatur salah satu, yang lain dihitung untuk mempertahankan rasio aspek.

### crop {#crop}

Potong area persegi panjang dari gambar.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `left` | number | Offset X dari tepi kiri |
| `top` | number | Offset Y dari tepi atas |
| `width` | number | Lebar area crop |
| `height` | number | Tinggi area crop |
| `unit` | string | `px` (default) atau `percent` |

### rotate {#rotate}

Putar gambar dengan sudut tertentu.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `angle` | number | Sudut rotasi dalam derajat (0-360) |
| `background` | string | Warna isian untuk area yang terekspos (default: `#000000`). Hanya berlaku untuk sudut non-90-derajat. |

### flip {#flip}

Cerminkan gambar secara horizontal, vertikal, atau keduanya. Setidaknya satu harus true.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `horizontal` | boolean | Cerminkan kiri ke kanan |
| `vertical` | boolean | Cerminkan atas ke bawah |

### convert {#convert}

Ubah format gambar.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `format` | string | Format target: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Kualitas kompresi (1-100, berlaku untuk format lossy) |

Tujuh format pertama (`jpg` hingga `jxl`) dikodekan oleh Sharp in-process. Format sisanya menggunakan encoder eksternal di lapisan API: `heic`/`heif` via heif-enc, `bmp`/`ico` via ImageMagick, `jp2` via opj_compress, dan `qoi` via codec TypeScript inline.

### compress {#compress}

Kurangi ukuran berkas sambil mempertahankan format yang sama.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `quality` | number | Kualitas target (1-100) |
| `targetSizeBytes` | number | Ukuran berkas target opsional dalam byte |
| `format` | string | Override format opsional |

### strip-metadata {#strip-metadata}

Hapus metadata EXIF, IPTC, XMP, dan ICC dari gambar. Tanpa parameter (atau `stripAll: true`), menghapus semuanya. Berikan flag individual untuk penghapusan selektif.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `stripAll` | boolean | Hapus semua metadata (default ketika tidak ada flag yang diatur) |
| `stripExif` | boolean | Hapus data EXIF (termasuk GPS jika `stripGps` tidak diatur secara terpisah) |
| `stripGps` | boolean | Hapus data lokasi GPS |
| `stripIcc` | boolean | Hapus profil warna ICC |
| `stripXmp` | boolean | Hapus metadata XMP |

### Penyesuaian warna {#color-adjustments}

Operasi ini mengubah properti warna gambar. Masing-masing menerima satu nilai numerik.

| Operasi | Parameter | Rentang | Deskripsi |
|---|---|---|---|
| `brightness` | `value` | -100 hingga 100 | Sesuaikan kecerahan |
| `contrast` | `value` | -100 hingga 100 | Sesuaikan kontras |
| `saturation` | `value` | -100 hingga 100 | Sesuaikan saturasi warna |

### Filter warna {#color-filters}

Ini menerapkan transformasi warna tetap. Tidak menerima parameter.

| Operasi | Deskripsi |
|---|---|
| `grayscale` | Konversi ke grayscale |
| `sepia` | Terapkan nada sepia |
| `invert` | Balik semua warna |

### Kanal warna {#color-channels}

Sesuaikan kanal warna RGB individual. Nilai adalah pengali di mana 100 = tanpa perubahan.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `red` | number | Pengali kanal merah (0 hingga 200, 100 = tidak berubah) |
| `green` | number | Pengali kanal hijau (0 hingga 200, 100 = tidak berubah) |
| `blue` | number | Pengali kanal biru (0 hingga 200, 100 = tidak berubah) |

### sharpen {#sharpen}

Penajaman sederhana yang dikendalikan oleh satu nilai.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `value` | number | Intensitas penajaman (0 hingga 100). Dipetakan ke sigma Gaussian 0.5-10. |

### sharpen-advanced {#sharpen-advanced}

Penajaman lanjutan dengan tiga metode yang dapat dipilih dan pra-tahap pengurangan noise opsional.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask`, atau `high-pass` |
| `sigma` | number | Radius Gaussian blur, 0.5-10 (adaptif) |
| `m1` | number | Penajaman area datar, 0-10 (adaptif) |
| `m2` | number | Penajaman area bertekstur, 0-20 (adaptif) |
| `x1` | number | Ambang batas datar/bergerigi, 0-10 (adaptif) |
| `y2` | number | Pencerahan maks (halo clamp), 0-50 (adaptif) |
| `y3` | number | Penggelapan maks (halo clamp), 0-50 (adaptif) |
| `amount` | number | Persentase intensitas, 0-500 (unsharp-mask) |
| `radius` | number | Radius blur, 0.1-5.0 (unsharp-mask) |
| `threshold` | number | Kecerahan tepi minimum, 0-255 (unsharp-mask) |
| `strength` | number | Kekuatan blend, 0-100 (high-pass) |
| `kernelSize` | number | `3` atau `5` untuk kernel 3x3 / 5x5 (high-pass) |
| `denoise` | string | Pra-tahap pengurangan noise: `off`, `light`, `medium`, atau `strong` |

Parameter bersifat spesifik per metode. Sediakan hanya yang relevan dengan metode yang dipilih.

### color-blindness {#color-blindness}

Simulasikan defisiensi penglihatan warna menggunakan matriks rekombinasi warna 3x3.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `type` | string | Salah satu dari: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Tulis atau hapus field metadata EXIF/IPTC individual tanpa menghapus seluruh blok.

| Parameter | Tipe | Deskripsi |
|---|---|---|
| `artist` | string | Tag EXIF Artist |
| `copyright` | string | Tag EXIF Copyright |
| `imageDescription` | string | Tag EXIF ImageDescription |
| `software` | string | Tag EXIF Software |
| `dateTime` | string | Tag EXIF DateTime |
| `dateTimeOriginal` | string | Tag EXIF DateTimeOriginal |
| `clearGps` | boolean | Hapus semua tag GPS |
| `fieldsToRemove` | string[] | Daftar nama field EXIF untuk dihapus |

Semua parameter opsional. Field yang tercantum dalam `fieldsToRemove` dihapus dari blok EXIF yang ada. Field yang diatur melalui parameter bernama ditulis (atau ditimpa). Kunci biner/tidak aman seperti MakerNote diabaikan secara diam-diam.

## Deteksi format {#format-detection}

Mesin mendeteksi format input secara otomatis dari header berkas, bukan hanya ekstensi berkas. Ini berarti berkas `.jpg` yang sebenarnya adalah PNG akan ditangani dengan benar. Deteksi menggunakan pendekatan multi-lapis: magic bytes terlebih dahulu, lalu ekstensi berkas sebagai fallback.

SnapOtter mendukung **55+ format input** dan **13 format keluaran**, termasuk 23 format RAW kamera dari 20+ merek, format profesional (PSD, EPS, OpenEXR, HDR), codec modern (JPEG XL, AVIF, HEIC, QOI, JPEG 2000), dan format ilmiah/gaming (FITS, DDS). Decoding ditangani oleh Sharp secara native bila memungkinkan, dengan fallback otomatis ke ImageMagick, LibRaw, dan decoder CLI khusus.

Lihat halaman [Format yang Didukung](/id/guide/supported-formats) untuk daftar lengkap.

## Ekstraksi metadata {#metadata-extraction}

Alat `info` mengembalikan metadata gambar. Lihat [Info Gambar](/id/tools/image/info) untuk referensi field lengkap.

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
