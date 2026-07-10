---
description: "Referensi mesin AI dengan semua alat ML lokal. Penghapusan latar belakang, upscaling, OCR, deteksi wajah, restorasi foto, dan lainnya."
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: 1ba91a56fef6
---

# Referensi Mesin AI {#ai-engine-reference}

Paket `@snapotter/ai` menjembatani Node.js ke **sidecar Python persisten** untuk semua operasi ML. Proses dispatcher tetap aktif di antara permintaan untuk performa warm-start yang cepat. NVIDIA CUDA terdeteksi otomatis saat startup dan digunakan bila tersedia; jika tidak, alat AI berjalan di CPU.

Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL saat ini tidak didukung untuk inferensi AI. Memetakan `/dev/dri` ke dalam kontainer tidak mengakselerasi alat sidecar Python ini kecuali GPU NVIDIA yang mendukung CUDA tersedia.

19 alat AI sidecar Python di empat modalitas (gambar, audio, video, dokumen), ditambah 2 alat dengan kemampuan AI opsional. Semua model berjalan secara lokal - tidak memerlukan internet setelah unduhan model awal.

## Arsitektur {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
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

Profil dispatcher "docs" terpisah menggantikan allowlist AI dengan skrip pemrosesan dokumen (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) dan melewati impor ML yang berat.

**Timeout:** default 300 s; OCR dan penghapusan latar belakang BiRefNet mendapat 600 s.

## Bundel Fitur {#feature-bundles}

Setiap alat AI memerlukan bundel model yang harus dipasang sebelum digunakan. Bundel dipasang sesuai kebutuhan melalui UI admin atau `install_feature.py`.

| Bundel | Ukuran | Alat |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio, auto-subtitles |

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
| `edgeRefine` | integer (0-3) | - | Tingkat penghalusan tepi |
| `decontaminate` | boolean | - | Hapus rembesan warna dari tepi |

## Ganti Latar Belakang {#background-replace}

**Rute alat:** `background-replace`  
**Model:** rembg / BiRefNet (dibagi dengan remove-background)

Menghapus latar belakang dan menggantinya dengan warna solid atau gradien.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Mode latar belakang |
| `color` | string | `"#ffffff"` | Warna hex latar belakang (ketika `backgroundType` adalah `color`) |
| `gradientColor1` | string | - | Warna hex gradien pertama |
| `gradientColor2` | string | - | Warna hex gradien kedua |
| `gradientAngle` | integer (0-360) | `180` | Sudut gradien dalam derajat |
| `feather` | integer (0-20) | `0` | Radius feathering tepi |
| `format` | `"png"` \| `"webp"` | `"png"` | Format keluaran |

## Blur Latar Belakang {#blur-background}

**Rute alat:** `blur-background`  
**Model:** rembg / BiRefNet (dibagi dengan remove-background)

Memburamkan latar belakang sambil menjaga subjek tetap tajam.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Intensitas blur |
| `feather` | integer (0-20) | `0` | Radius feathering tepi |
| `format` | `"png"` \| `"webp"` | `"png"` | Format keluaran |

## Upscaling Gambar {#image-upscaling}

**Rute alat:** `upscale`  
**Model:** RealESRGAN (dengan fallback Lanczos bila tidak tersedia)

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
**Model:** Tesseract (cepat), PaddleOCR PP-OCRv5 (seimbang), PaddleOCR-VL 1.5 (terbaik)

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Tingkat pemrosesan |
| `language` | string | `"auto"` | Bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Pra-proses gambar untuk meningkatkan akurasi OCR |
| `engine` | string | - | Usang. Memetakan `tesseract` ke `fast`, `paddleocr` ke `balanced` |

Mengembalikan hasil terstruktur dengan bounding box, skor keyakinan, dan blok teks yang diekstrak.

## OCR PDF {#pdf-ocr}

**Rute alat:** `ocr-pdf`  
**Model:** Sistem tingkat yang sama dengan OCR gambar

Mengekstrak teks dari dokumen PDF hasil pindai menggunakan OCR bertenaga AI, halaman demi halaman.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Tingkat pemrosesan |
| `language` | string | `"auto"` | Bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Pemilihan halaman: `"all"`, `"1-3"`, `"1,3,5"` |

## Blur Wajah / PII {#face-pii-blur}

**Rute alat:** `blur-faces`  
**Model:** Deteksi wajah MediaPipe

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Radius Gaussian blur |
| `sensitivity` | number (0-1) | `0.5` | Ambang batas keyakinan deteksi |

## Peningkatan Wajah {#face-enhancement}

**Rute alat:** `enhance-faces`  
**Model:** GFPGAN, CodeFormer

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Model peningkatan |
| `strength` | number (0-1) | `0.8` | Kekuatan peningkatan |
| `sensitivity` | number (0-1) | `0.5` | Ambang batas deteksi wajah |
| `onlyCenterFace` | boolean | `false` | Tingkatkan hanya wajah paling tengah |

## Pewarnaan AI {#ai-colorization}

**Rute alat:** `colorize`  
**Model:** DDColor (dengan fallback OpenCV DNN)

Mengonversi foto hitam-putih atau grayscale menjadi berwarna penuh.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Kekuatan saturasi warna |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Varian model |

## Penghapusan Noise {#noise-removal}

**Rute alat:** `noise-removal`  
**Model:** SCUNet (pipeline denoising bertingkat)

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Tingkat pemrosesan |
| `strength` | number (0-100) | `50` | Kekuatan denoising |
| `detailPreservation` | number (0-100) | `50` | Seberapa banyak detail yang dipertahankan; makin tinggi makin banyak tekstur |
| `colorNoise` | number (0-100) | `30` | Kekuatan pengurangan noise warna |
| `format` | string | `"original"` | Format keluaran: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Kualitas encoding keluaran |

## Penghapusan Mata Merah {#red-eye-removal}

**Rute alat:** `red-eye-removal`

Mendeteksi landmark wajah, menemukan area mata, dan mengoreksi oversaturasi kanal merah.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Ambang batas deteksi piksel merah |
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
**Model:** Landmark wajah MediaPipe + penghapusan latar belakang BiRefNet

Alur kerja dua fase: analisis (deteksi wajah + hapus latar belakang) lalu hasilkan (crop, resize, tile). Mendukung 37+ negara di 6 wilayah.

### Fase 1: Analisis {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Menerima berkas gambar (multipart). Mengembalikan data landmark wajah, pratinjau base64, dan dimensi gambar.

### Fase 2: Hasilkan {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Menerima body JSON dengan hasil Fase 1 ditambah pengaturan pembuatan:

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `jobId` | string | (wajib) | ID Job dari Fase 1 |
| `filename` | string | (wajib) | Nama berkas asli dari Fase 1 |
| `countryCode` | string | (wajib) | Kode negara ISO (mis. `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Tipe dokumen |
| `bgColor` | string | `"#FFFFFF"` | Warna hex latar belakang |
| `printLayout` | string | `"none"` | Tata letak cetak: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Ukuran berkas maks dalam KB (0 = tanpa batas) |
| `dpi` | number (72-1200) | `300` | DPI keluaran |
| `customWidthMm` | number | - | Lebar kustom dalam mm (menggantikan spesifikasi negara) |
| `customHeightMm` | number | - | Tinggi kustom dalam mm (menggantikan spesifikasi negara) |
| `zoom` | number (0.5-3) | `1` | Faktor zoom |
| `adjustX` | number | `0` | Penyesuaian posisi horizontal |
| `adjustY` | number | `0` | Penyesuaian posisi vertikal |
| `landmarks` | object | (wajib) | Landmark dari Fase 1 |
| `imageWidth` | number | (wajib) | Lebar gambar dari Fase 1 |
| `imageHeight` | number | (wajib) | Tinggi gambar dari Fase 1 |

## Penghapusan Objek (Inpainting) {#object-erasing-inpainting}

**Rute alat:** `erase-object`  
**Model:** LaMa via ONNX Runtime

Mask dikirim sebagai **bagian berkas kedua** (fieldname `mask`), bukan sebagai base64. Piksel putih pada mask menandai area yang akan dihapus. Pengaturan `format` dan `quality` dikirim sebagai field form tingkat atas.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `file` | file | (wajib) | Gambar sumber (multipart) |
| `mask` | file | (wajib) | Gambar mask (multipart, fieldname `mask`, putih = hapus) |
| `format` | string | `"auto"` | Format keluaran: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Kualitas keluaran |

Dipercepat CUDA saat GPU NVIDIA tersedia.

## Perluasan Kanvas AI {#ai-canvas-expand}

**Rute alat:** `ai-canvas-expand`  
**Model:** Outpainting berbasis LaMa

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
**Model:** Deteksi wajah MediaPipe (hanya mode wajah)

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Strategi crop: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategi untuk mode subjek |
| `width` | integer | - | Lebar keluaran |
| `height` | integer | - | Tinggi keluaran |
| `padding` | integer (0-50) | `0` | Persentase padding di sekitar subjek |
| `facePreset` | string | `"head-shoulders"` | Framing preset ketika `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Ambang batas deteksi wajah |
| `threshold` | integer (0-255) | `30` | Ambang batas deteksi latar belakang (mode trim) |
| `padToSquare` | boolean | `false` | Padding hasil trim menjadi persegi |
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
| `half-body` | Tubuh bagian atas penuh |

## Transkripsi Audio {#transcribe-audio}

**Rute alat:** `transcribe-audio`  
**Model:** faster-whisper

Mengonversi ucapan menjadi teks. Mendukung format keluaran teks biasa, SRT, dan VTT.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Format keluaran |

## Subtitle Otomatis {#auto-subtitles}

**Rute alat:** `auto-subtitles`  
**Model:** faster-whisper (mengekstrak audio dari video, lalu mentranskripsi)

Menghasilkan berkas subtitle dari trek audio video.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Format subtitle keluaran |

## Perbaikan Transparansi PNG {#png-transparency-fixer}

**Rute alat:** `transparency-fixer`  
**Model:** BiRefNet HR-matting (resolusi 2048x2048)

Memperbaiki PNG "transparan palsu" yang latar belakangnya dihapus tetapi menyisakan fringing, halo, atau artefak semi-transparan. Menggunakan model matting resolusi tinggi BiRefNet untuk menghasilkan kanal alpha yang bersih, lalu menerapkan pemrosesan defringe yang dapat dikonfigurasi untuk menghapus kontaminasi warna di sepanjang tepi.

**Rantai fallback OOM:** Jika BiRefNet HR-matting melampaui memori yang tersedia, alat secara otomatis kembali ke `birefnet-general`, lalu ke `u2net`.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Kekuatan defringe tepi untuk menghapus kontaminasi warna |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Format gambar keluaran |
| `removeWatermark` | boolean | `false` | Terapkan pra-pemrosesan penghapusan watermark (median filter) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Alat dengan Kemampuan AI Opsional {#tools-with-optional-ai-capabilities}

Alat berikut bukan alat sidecar Python tetapi menggunakan fitur AI ketika opsi tertentu diaktifkan.

### Peningkatan Gambar {#image-enhancement}

**Rute alat:** `image-enhancement`  
**Mesin:** Berbasis analisis (histogram dan statistik Sharp)

Menganalisis gambar dan menerapkan koreksi otomatis untuk eksposur, kontras, white balance, saturasi, ketajaman, dan noise. Mendukung mode khusus adegan.

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
| `deepEnhance` | boolean | `false` | Aktifkan penghapusan noise AI via SCUNet (memerlukan bundel `upscale-enhance`) |

Endpoint analisis tambahan tersedia di `POST /api/v1/tools/image/image-enhancement/analyze` yang mengembalikan koreksi terdeteksi tanpa menerapkannya.

### Resize Sadar-Konten (Seam Carving) {#content-aware-resize-seam-carving}

**Rute alat:** `content-aware-resize`  
**Mesin:** Biner Go `caire` (bukan Python - tidak ada manfaat GPU)

Me-resize gambar secara cerdas dengan menghapus seam berenergi rendah, mempertahankan konten penting.

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `width` | number | - | Lebar target |
| `height` | number | - | Tinggi target |
| `protectFaces` | boolean | `false` | Lindungi area wajah yang terdeteksi (memerlukan bundel `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Pra-blur untuk perhitungan energi |
| `sobelThreshold` | number (1-20) | `2` | Ambang batas sensitivitas tepi |
| `square` | boolean | `false` | Paksa keluaran persegi |
