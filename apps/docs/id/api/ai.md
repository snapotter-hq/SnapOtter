---
description: "Referensi mesin AI dengan semua alat ML lokal. Penghapusan latar belakang, upscaling, OCR, deteksi wajah, restorasi foto, dan lainnya."
i18n_output_hash: 96e0e07b8c81
i18n_source_hash: aa9a56cdddc7
i18n_provenance: human
---

# Referensi Mesin AI {#ai-engine-reference}

Paket `@snapotter/ai` mengoordinasikan alat asli dan waktu proses Python untuk operasi ML lokal. Kebanyakan alat ML menggunakan Python sidecar yang persisten untuk pemanasan cepat. OCR sengaja dipisahkan: `fast` memanggil biner Tesseract asli, sedangkan `balanced` dan `best` menggunakan JSONL dispatcher persisten khusus yang disematkan pada generasi RapidOCR aktif yang tidak dapat diubah di bawah `/data/ai/v3`. Setiap permintaan memiliki generation lease. Selama peningkatan, SnapOtter menjalankan smoke test pada kandidat sebelum aktivasi, secara atom beralih ke dispatcher baru, lalu menguras generasi lama sebelum garbage collection.

NVIDIA CUDA terdeteksi secara otomatis dan digunakan oleh runtime yang mendukungnya. OCR menggunakan CPU di setiap host, termasuk sistem dengan GPU NVIDIA, menghindari CUDA dan kopling driver untuk alat ini.

Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini tidak didukung untuk inferensi AI. Memetakan `/dev/dri` ke dalam sebuah kontainer tidak mempercepat alat sidecar Python ini kecuali tersedia GPU NVIDIA yang mendukung CUDA.

19 alat AI sidecar Python di empat modalitas (gambar, audio, video, dokumen), plus 2 alat dengan kemampuan AI opsional. Semua model berjalan secara lokal - tidak diperlukan internet setelah unduhan model awal.


<!-- korean-ocr-contract:start -->
::: info Kompatibilitas OCR bahasa Korea
OCR Cepat mendukung `auto`, `en`, `de`, `es`, `fr`, `zh`, dan `ja`, tetapi tidak mendukung bahasa Korea (`ko`). Bahasa Korea memerlukan paket OCR Akurat dan `balanced` atau `best`. Paket berjalan pada kontainer resmi Linux amd64 dan arm64, termasuk host NVIDIA dengan OCR tetap memakai CPU. Sistem yang tidak didukung menerima kesalahan kompatibilitas yang jelas dan tidak pernah diam-diam kembali ke `fast`. Bahasa Korea dengan `fast` atau alias lama `tesseract` ditolak sebelum antre dengan `FEATURE_INCOMPATIBLE` dan `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## Arsitektur {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 +-- Native Tesseract + Ghostscript (fast image/PDF OCR)
 |
 +-- Isolated OCR runtime (persistent JSONL dispatcher)
 |     `-- RapidOCR + ONNX Runtime CPU + pinned PP-OCR models
 |
 `-- Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

Profil dispatcher "docs" yang terpisah menggantikan allowlist AI dengan skrip pemrosesan dokumen (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) dan melewati impor ML yang berat.

**Timeout:** 300 d default; OCR dan penghapusan latar belakang BiRefNet mendapat 600 d.

## Bundel Fitur {#feature-bundles}

Model AI dikemas berdasarkan tumpukan dependensi bersama, bukan satu arsip per alat. Sebuah bundel fitur dapat mengaktifkan beberapa alat saat mereka memakai keluarga model, wheel Python, atau pustaka native yang sama. Ini menjaga image Docker rilis tetap lebih kecil dan menghindari penyimpanan salinan duplikat dari model matting latar belakang, deteksi wajah, OCR, restorasi, dan model bicara yang sama.

Image Docker mengirimkan aplikasi ditambah runtime umum. Arsip model besar diunduh sesuai permintaan ke dalam volume `/data/ai` persisten, lalu dipakai ulang oleh setiap alat yang membutuhkannya. Jika sebuah bundel sudah terpasang karena alat lain memerlukannya, mengaktifkan alat dependen baru tidak mengunduh bundel itu lagi.

Sebagian besar alat AI memerlukan satu atau lebih paket fitur sebelum dapat dijalankan. UI admin menginstalnya dengan alat melalui `POST /api/v1/admin/tools/:toolId/features/install`, yang menyelesaikan daftar bundel lengkap, melewati bundel yang sudah diinstal, dan hanya mengantri unduhan yang hilang. Misalnya, mengaktifkan Foto Paspor pada antrian instans baru `background-removal` dan `face-detection`; mengaktifkannya setelah Penghapusan Latar Belakang sudah diinstal antrian hanya `face-detection`. OCR adalah pengecualian karena `fast` tidak memerlukan paket; instal runtime akurat opsionalnya melalui UI atau `POST /api/v1/admin/features/ocr/install`.

| Bundel | Ukuran | Grup dependensi bersama | Alat yang memakainya |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | matting latar belakang rembg / BiRefNet | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | deteksi wajah dan landmark MediaPipe | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | inpainting/outpainting LaMa dan DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, denoising | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | pipeline perbaikan goresan dan restorasi | restore-photo |
| `ocr` | ~208-234 unduhan MiB / ~409-488 MiB terpasang | Opsional RapidOCR 3.9.1, ONNX Runtime 1.20.1, dan model PP-OCR yang disematkan | ocr, ocr-pdf (hanya `balanced` dan `best`) |
| `transcription` | ~600 MB | model speech-to-text faster-whisper | transcribe-audio, auto-subtitles |

Alat dengan dependensi lintas bundel:

| Alat | Bundel yang diperlukan | Alasan |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Menghapus latar belakang, lalu memakai landmark wajah untuk membingkai crop sesuai aturan foto paspor dan KTP. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Mendeteksi wajah sebelum menjalankan peningkatan GFPGAN atau CodeFormer pada wilayah wajah yang dipilih. |

Alat hanya tersedia ketika semua bundel yang diperlukan telah diinstal, kecuali OCR: tingkat `fast` bawaannya tetap tersedia tanpa paket OCR opsional. Penginstalan sebagian valid dan ditangani secara bertahap: bundel yang terinstal digunakan kembali, bundel yang hilang ditampilkan sebagai unduhan, dan antrean penginstalan dijalankan satu per satu sehingga lingkungan Python yang dibagikan tidak diubah secara bersamaan.

### Instalasi runtime OCR {#accurate-ocr-runtime-installation} yang akurat

Paket OCR yang akurat adalah runtime khusus platform untuk kontainer resmi Linux amd64 atau Linux arm64. Versi amd64 menggunakan Python 3.12; build arm64 menggunakan Python 3.11. Kedua build menjalankan RapidOCR melalui `CPUExecutionProvider` ONNX Runtime, sehingga paket yang sama hanya berfungsi pada CPU dan host NVIDIA Docker. Runtime yang akurat memerlukan setidaknya 4 GiB memori efektif: batas cgroup kontainer yang dikonfigurasi, jika tidak, memori host. Sistem di bawah minimum kompatibilitas yang ditandatangani akan ditolak sebelum diunduh. Persyaratan ini tidak berlaku untuk Fast OCR bawaan. Build Bare-metal ditolak karena libc dan Python ABI tidak dapat disimpulkan dengan aman; OCR cepat tetap tersedia ketika host menyediakan Tesseract dan Ghostscript.

Artefak opsional adalah sekitar 208-234 MiB yang dikompresi dan 409-488 MiB yang diekstraksi, bergantung pada arsitektur. Indeks yang ditandatangani mengikat jumlah byte yang dikompresi dan diekstraksi secara tepat yang diterapkan oleh penginstal. Tesseract bawaan menambahkan sekitar 25 MiB ke gambar resmi dan tidak memerlukan file di `/data/ai`.

Instalasi online mengambil indeks rilis yang ditandatangani dan artefak alamat konten yang tepat untuk platform saat ini. SnapOtter memverifikasi tanda tangan indeks Ed25519, ukuran artefak, intisari SHA-256, intisari model, jalur, mode file, dan smoke test yang dipentaskan sebelum mengaktifkan generasi baru secara atom. Penginstalan yang gagal membuat generasi sehat sebelumnya tetap aktif.

Untuk instalasi dengan celah udara, unggah `ocr-runtime-index.json` rilis dan arsip runtime OCR yang cocok ke `POST /api/v1/admin/features/import` menggunakan bidang multibagian bernama `index` dan `archive`. Impor offline menerapkan pemeriksaan tanda tangan, hash, ekstraksi, kompatibilitas, dan uji asap yang sama seperti instalasi online; arsip tanpa indeks bertanda tangan tepercaya ditolak.

---

## Penghapusan Latar Belakang {#background-removal}

**Rute alat:** `remove-background`  
**Model:** rembg dengan BiRefNet (default) atau varian U2-Net

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `model` | string | - | Varian model (override opsional) |
| `backgroundType` | string | `"transparent"` | Salah satu dari: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Warna hex untuk latar belakang solid |
| `gradientColor1` | string | - | Warna gradien pertama |
| `gradientColor2` | string | - | Warna gradien kedua |
| `gradientAngle` | number | - | Sudut gradien dalam derajat |
| `blurEnabled` | boolean | - | Aktifkan efek blur latar belakang |
| `blurIntensity` | number (0-100) | - | Intensitas blur |
| `shadowEnabled` | boolean | - | Aktifkan drop shadow pada subjek |
| `shadowOpacity` | number (0-100) | - | Opasitas bayangan |
| `outputFormat` | string | - | Format keluaran: `png`, `webp`, atau `avif` |
| `edgeRefine` | integer (0-3) | - | Tingkat penyempurnaan tepi |
| `decontaminate` | boolean | - | Hilangkan rembesan warna dari tepi |

## Penggantian Latar Belakang {#background-replace}

**Rute alat:** `background-replace`  
**Model:** rembg / BiRefNet (dibagikan dengan remove-background)

Menghapus latar belakang dan menggantinya dengan warna solid atau gradien.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Mode latar belakang |
| `color` | string | `"#ffffff"` | Warna hex latar belakang (saat `backgroundType` adalah `color`) |
| `gradientColor1` | string | - | Warna hex gradien pertama |
| `gradientColor2` | string | - | Warna hex gradien kedua |
| `gradientAngle` | integer (0-360) | `180` | Sudut gradien dalam derajat |
| `feather` | integer (0-20) | `0` | Radius feathering tepi |
| `format` | `"png"` \| `"webp"` | `"png"` | Format keluaran |

## Blur Latar Belakang {#blur-background}

**Rute alat:** `blur-background`  
**Model:** rembg / BiRefNet (dibagikan dengan remove-background)

Memburamkan latar belakang sambil menjaga subjek tetap tajam.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Intensitas blur |
| `feather` | integer (0-20) | `0` | Radius feathering tepi |
| `format` | `"png"` \| `"webp"` | `"png"` | Format keluaran |

## Upscaling Gambar {#image-upscaling}

**Rute alat:** `upscale`  
**Model:** RealESRGAN (dengan fallback Lanczos saat tidak tersedia)

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Faktor upscale |
| `model` | string | `"auto"` | Varian model |
| `faceEnhance` | boolean | `false` | Terapkan tahap peningkatan wajah GFPGAN |
| `denoise` | number | `0` | Kekuatan denoising |
| `format` | string | `"auto"` | Override format keluaran |
| `quality` | number | `95` | Kualitas keluaran (1-100) |

## OCR / Ekstraksi Teks {#ocr-text-extraction}

**Rute alat:** `ocr`  
**Model:** Tesseract (`fast`); RapidOCR dengan model kecil PP-OCRv6 (`balanced`); Model medium PP-OCRv6 dengan penilaian varian terkalibrasi (`best`)

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dinamis | Jika `quality` dan `engine` tidak diberikan, SnapOtter memilih tingkat terbaik yang tersedia dengan urutan `best`, `balanced`, lalu `fast`. Untuk bahasa Korea, `fast` tidak pernah dipilih; sistem memakai `best`, lalu `balanced`, atau mengembalikan kesalahan instalasi maupun kompatibilitas runtime akurat. |
| `language` | string | `"auto"` | Bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | Bergantung pada tingkatan | Tingkatkan kontras lokal. Fast menerapkannya secara langsung; tingkatan akurat mempertahankan varian hanya ketika skor yang dikalibrasi meningkatkan OCR. Defaultnya aktif untuk yang Terbaik |
| `engine` | rangkaian | - | Alias ​​​​kompatibilitas yang tidak digunakan lagi. Memetakan `tesseract` ke `fast` dan nilai `paddleocr` lama ke `balanced`; itu tidak memuat PaddlePaddle |

Mengembalikan teks yang diekstraksi ditambah metadata asal: mesin, kualitas yang diminta dan aktual, perangkat, penyedia, status degradasi, peringatan, dan versi runtime/model yang akurat bila berlaku. Permintaan kualitas eksplisit tidak pernah kembali ke tingkat lain. Jika `balanced` atau `best` tidak tersedia, API mengembalikan `FEATURE_NOT_INSTALLED` atau `FEATURE_INCOMPATIBLE` alih-alih menjalankan `fast` secara diam-diam.

## OCR PDF {#pdf-ocr}

**Rute alat:** `ocr-pdf`  
**Model:** Sistem tingkat yang sama seperti OCR gambar

Mengekstrak teks dari dokumen PDF hasil pindaian menggunakan OCR bertenaga AI, halaman per halaman.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dinamis | Jika `quality` dan `engine` tidak diberikan, SnapOtter memilih tingkat terbaik yang tersedia dengan urutan `best`, `balanced`, lalu `fast`. Untuk bahasa Korea, `fast` tidak pernah dipilih; sistem memakai `best`, lalu `balanced`, atau mengembalikan kesalahan instalasi maupun kompatibilitas runtime akurat. |
| `language` | string | `"auto"` | Bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Pemilihan halaman: `"all"`, `"1-3"`, `"1,3,5"` |
| `enhance` | boolean | Bergantung pada tingkatan | Tingkatkan kontras lokal. Fast menerapkannya secara langsung; tingkatan akurat mempertahankan varian hanya ketika skor yang dikalibrasi meningkatkan OCR. Defaultnya aktif untuk yang Terbaik |
| `engine` | rangkaian | - | Alias ​​​​kompatibilitas yang tidak digunakan lagi. Memetakan `tesseract` ke `fast` dan nilai `paddleocr` lama ke `balanced`; itu tidak memuat PaddlePaddle |

Aturan larangan penurunan versi yang sama juga berlaku untuk PDF OCR. Halaman PDF diraster sebelum dikenali, dan satu permintaan dapat memilih maksimal 50 halaman.

## Blur Wajah / PII {#face-pii-blur}

**Rute alat:** `blur-faces`  
**Model:** deteksi wajah MediaPipe

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Radius blur Gaussian |
| `sensitivity` | number (0-1) | `0.5` | Ambang kepercayaan deteksi |

## Peningkatan Wajah {#face-enhancement}

**Rute alat:** `enhance-faces`  
**Model:** GFPGAN, CodeFormer

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Model peningkatan |
| `strength` | number (0-1) | `0.8` | Kekuatan peningkatan |
| `sensitivity` | number (0-1) | `0.5` | Ambang deteksi wajah |
| `onlyCenterFace` | boolean | `false` | Tingkatkan hanya wajah paling tengah |

## Pewarnaan AI {#ai-colorization}

**Rute alat:** `colorize`  
**Model:** DDColor (dengan fallback OpenCV DNN)

Mengubah foto hitam-putih atau grayscale menjadi berwarna penuh.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Kekuatan saturasi warna |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Varian model |

## Penghapusan Derau {#noise-removal}

**Rute alat:** `noise-removal`  
**Model:** SCUNet (pipeline denoising bertingkat)

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Tingkat pemrosesan |
| `strength` | number (0-100) | `50` | Kekuatan denoising |
| `detailPreservation` | number (0-100) | `50` | Seberapa banyak detail yang dipertahankan; makin tinggi makin banyak tekstur yang terjaga |
| `colorNoise` | number (0-100) | `30` | Kekuatan pengurangan derau warna |
| `format` | string | `"original"` | Format keluaran: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Kualitas enkoding keluaran |

## Penghapusan Mata Merah {#red-eye-removal}

**Rute alat:** `red-eye-removal`

Mendeteksi landmark wajah, menemukan wilayah mata, dan mengoreksi oversaturasi kanal merah.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Ambang deteksi piksel merah |
| `strength` | number (0-100) | `70` | Kekuatan koreksi |
| `format` | string | - | Override format keluaran (opsional) |
| `quality` | number (1-100) | `90` | Kualitas keluaran |

## Restorasi Foto {#photo-restoration}

**Rute alat:** `restore-photo`

Pipeline multi-langkah untuk foto lama atau rusak: deteksi dan perbaikan goresan/robekan, peningkatan wajah, denoising, dan pewarnaan opsional.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Deteksi dan perbaiki goresan, robekan |
| `faceEnhancement` | boolean | `true` | Terapkan tahap peningkatan wajah |
| `fidelity` | number (0-1) | `0.7` | Kekuatan peningkatan wajah (makin tinggi = makin konservatif) |
| `denoise` | boolean | `true` | Terapkan tahap denoising |
| `denoiseStrength` | number (0-100) | `25` | Kekuatan denoising |
| `colorize` | boolean | `false` | Warnai setelah restorasi |
| `colorizeStrength` | number (0-100) | `85` | Intensitas pewarnaan |

## Foto Paspor {#passport-photo}

**Rute alat:** `passport-photo`  
**Model:** landmark wajah MediaPipe + penghapusan latar belakang BiRefNet

Alur kerja dua fase: analisis (deteksi wajah + hapus latar belakang) lalu hasilkan (crop, ubah ukuran, tile). Mendukung 37+ negara di 6 kawasan.

### Fase 1: Analisis {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Menerima berkas gambar (multipart). Mengembalikan data landmark wajah, pratinjau base64, dan dimensi gambar.

### Fase 2: Hasilkan {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Menerima body JSON berisi hasil Fase 1 ditambah pengaturan pembuatan:

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `jobId` | string | (wajib) | Job ID dari Fase 1 |
| `filename` | string | (wajib) | Nama berkas asli dari Fase 1 |
| `countryCode` | string | (wajib) | Kode negara ISO (mis., `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Tipe dokumen |
| `bgColor` | string | `"#FFFFFF"` | Hex warna latar belakang |
| `printLayout` | string | `"none"` | Tata letak cetak: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Ukuran berkas maks dalam KB (0 = tanpa batas) |
| `dpi` | number (72-1200) | `300` | DPI keluaran |
| `customWidthMm` | number | - | Lebar kustom dalam mm (menimpa spesifikasi negara) |
| `customHeightMm` | number | - | Tinggi kustom dalam mm (menimpa spesifikasi negara) |
| `zoom` | number (0.5-3) | `1` | Faktor zoom |
| `adjustX` | number | `0` | Penyesuaian posisi horizontal |
| `adjustY` | number | `0` | Penyesuaian posisi vertikal |
| `landmarks` | object | (wajib) | Landmark dari Fase 1 |
| `imageWidth` | number | (wajib) | Lebar gambar dari Fase 1 |
| `imageHeight` | number | (wajib) | Tinggi gambar dari Fase 1 |

## Penghapusan Objek (Inpainting) {#object-erasing-inpainting}

**Rute alat:** `erase-object`  
**Model:** LaMa via ONNX Runtime

Mask dikirim sebagai **bagian berkas kedua** (fieldname `mask`), bukan sebagai base64. Piksel putih dalam mask menandai area yang akan dihapus. Pengaturan `format` dan `quality` dikirim sebagai field form tingkat atas.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `file` | file | (wajib) | Gambar sumber (multipart) |
| `mask` | file | (wajib) | Gambar mask (multipart, fieldname `mask`, putih = hapus) |
| `format` | string | `"auto"` | Format keluaran: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Kualitas keluaran |

Dipercepat dengan CUDA saat GPU NVIDIA tersedia.

## AI Canvas Expand {#ai-canvas-expand}

**Rute alat:** `ai-canvas-expand`  
**Model:** outpainting berbasis LaMa

Memperluas kanvas gambar ke segala arah dan mengisi area baru dengan konten yang dihasilkan AI yang cocok dengan gambar yang ada.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Piksel untuk diperluas di atas |
| `extendRight` | integer | `0` | Piksel untuk diperluas di kanan |
| `extendBottom` | integer | `0` | Piksel untuk diperluas di bawah |
| `extendLeft` | integer | `0` | Piksel untuk diperluas di kiri |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Tingkat kualitas |
| `format` | string | `"auto"` | Format keluaran: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Kualitas keluaran |

Setidaknya satu arah perluasan harus lebih besar dari 0.

## Smart Crop {#smart-crop}

**Rute alat:** `smart-crop`  
**Model:** deteksi wajah MediaPipe (hanya mode wajah)

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Strategi crop: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategi untuk mode subjek |
| `width` | integer | - | Lebar keluaran |
| `height` | integer | - | Tinggi keluaran |
| `padding` | integer (0-50) | `0` | Persentase padding di sekitar subjek |
| `facePreset` | string | `"head-shoulders"` | Pembingkaian preset saat `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Ambang deteksi wajah |
| `threshold` | integer (0-255) | `30` | Ambang deteksi latar belakang (mode trim) |
| `padToSquare` | boolean | `false` | Isi hasil yang di-trim menjadi persegi |
| `padColor` | string | `"#ffffff"` | Warna latar belakang untuk padding persegi |
| `targetSize` | integer | - | Ukuran target untuk keluaran ber-padding (piksel) |
| `quality` | integer (1-100) | - | Kualitas keluaran |

Nilai `mode` lawas `attention` dan `content` diterima dan dipetakan masing-masing ke `subject` dan `trim`.

**Preset wajah:**

| Preset | Terbaik untuk |
|--------|---------|
| `closeup` | Headshot |
| `head-shoulders` | Foto profil |
| `upper-body` | LinkedIn / formal |
| `half-body` | Seluruh tubuh bagian atas |

## Transkripsi Audio {#transcribe-audio}

**Rute alat:** `transcribe-audio`  
**Model:** faster-whisper

Mengubah ucapan menjadi teks. Mendukung format keluaran teks polos, SRT, dan VTT.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Format keluaran |

## Subtitle Otomatis {#auto-subtitles}

**Rute alat:** `auto-subtitles`  
**Model:** faster-whisper (mengekstrak audio dari video, lalu mentranskripsi)

Menghasilkan berkas subtitle dari trek audio sebuah video.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Format subtitle keluaran |

## Perbaikan Transparansi PNG {#png-transparency-fixer}

**Rute alat:** `transparency-fixer`  
**Model:** BiRefNet HR-matting (resolusi 2048x2048)

Memperbaiki PNG "transparan palsu" di mana latar belakang telah dihapus tetapi meninggalkan fringing, halo, atau artefak semi-transparan. Menggunakan model matting resolusi tinggi BiRefNet untuk menghasilkan kanal alpha yang bersih, lalu menerapkan pemrosesan defringe yang dapat dikonfigurasi untuk menghilangkan kontaminasi warna di sepanjang tepi.

**Rantai fallback OOM:** Jika BiRefNet HR-matting melampaui memori yang tersedia, alat secara otomatis beralih ke `birefnet-general`, lalu ke `u2net`.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Kekuatan defringe tepi untuk menghilangkan kontaminasi warna |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Format gambar keluaran |
| `removeWatermark` | boolean | `false` | Terapkan pra-pemrosesan penghapusan watermark (filter median) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Alat dengan Kemampuan AI Opsional {#tools-with-optional-ai-capabilities}

Alat berikut bukan alat sidecar Python tetapi memakai fitur AI saat opsi tertentu diaktifkan.

### Peningkatan Gambar {#image-enhancement}

**Rute alat:** `image-enhancement`  
**Mesin:** Berbasis analisis (histogram dan statistik Sharp)

Menganalisis gambar dan menerapkan koreksi otomatis untuk eksposur, kontras, white balance, saturasi, ketajaman, dan derau. Mendukung mode spesifik-adegan.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Mode adegan untuk menyetel koreksi |
| `intensity` | number (0-100) | `50` | Kekuatan koreksi keseluruhan |
| `corrections.exposure` | boolean | `true` | Terapkan koreksi eksposur |
| `corrections.contrast` | boolean | `true` | Terapkan koreksi kontras |
| `corrections.whiteBalance` | boolean | `true` | Terapkan koreksi white balance |
| `corrections.saturation` | boolean | `true` | Terapkan koreksi saturasi |
| `corrections.sharpness` | boolean | `true` | Terapkan koreksi ketajaman |
| `corrections.denoise` | boolean | `true` | Terapkan denoising |
| `deepEnhance` | boolean | `false` | Aktifkan penghapusan derau AI via SCUNet (memerlukan bundel `upscale-enhance`) |

Endpoint analisis tambahan tersedia di `POST /api/v1/tools/image/image-enhancement/analyze` yang mengembalikan koreksi yang terdeteksi tanpa menerapkannya.

### Ubah Ukuran Sadar-Konten (Seam Carving) {#content-aware-resize-seam-carving}

**Rute alat:** `content-aware-resize`  
**Mesin:** biner Go `caire` (bukan Python - tidak ada manfaat GPU)

Mengubah ukuran gambar secara cerdas dengan menghapus seam berenergi rendah, mempertahankan konten penting.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `width` | number | - | Lebar target |
| `height` | number | - | Tinggi target |
| `protectFaces` | boolean | `false` | Lindungi wilayah wajah yang terdeteksi (memerlukan bundel `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Pra-blur untuk perhitungan energi |
| `sobelThreshold` | number (1-20) | `2` | Ambang sensitivitas tepi |
| `square` | boolean | `false` | Paksa keluaran persegi |
