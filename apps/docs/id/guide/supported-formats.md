---
description: "Format file yang didukung di semua modalitas - 55+ format masukan gambar, video, audio, PDF, dan format file."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 4bbbac7f641d
---

# Format yang Didukung {#supported-formats}

SnapOtter memproses file di lima modalitas: image, video, audio, PDF, dan files. Halaman ini mencantumkan semua format yang didukung.

## Format Gambar {#image-formats}

SnapOtter mendukung 55+ format gambar untuk masukan dan 13 format untuk keluaran.

## Format Masukan {#input-formats}

### Standar Web (9) {#web-standards-9}

| Format | Ekstensi | Decoder | Catatan |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (native) | |
| PNG | .png | Sharp (native) | Frame pertama APNG diekstrak |
| WebP | .webp | Sharp (native) | |
| GIF | .gif | Sharp (native) | Animasi didukung |
| AVIF | .avif | Sharp (native) | |
| SVG | .svg | Sharp (librsvg) | Disanitasi untuk XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Proteksi gzip bomb |
| APNG | .apng | Sharp (native) | Hanya frame pertama |
| JPEG XL | .jxl | djxl / ImageMagick | Fallback dua tingkat |

### Profesional (7) {#professional-7}

| Format | Ekstensi | Decoder | Catatan |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | Multi-halaman didukung |
| PSD | .psd | ImageMagick | Komposit yang diratakan |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Rasterisasi 300dpi, diperkuat keamanannya |
| OpenEXR | .exr | ImageMagick | Konversi linear-ke-sRGB |
| Radiance HDR | .hdr | ImageMagick | Konversi linear-ke-sRGB |
| DPX | .dpx | ImageMagick | Konversi log-ke-sRGB |
| Cineon | .cin | ImageMagick | Format Film/VFX |

### Camera RAW (23) {#camera-raw-23}

| Format | Ekstensi | Merek Kamera | Decoder |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (universal) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (sebelum 2018) | exiftool / ImageMagick + LibRaw |
| CR3 | .cr3 | Canon (2018+) | exiftool / ImageMagick + LibRaw |
| NEF | .nef | Nikon | exiftool / ImageMagick + LibRaw |
| NRW | .nrw | Nikon (Coolpix) | exiftool / ImageMagick + LibRaw |
| ARW | .arw | Sony | exiftool / ImageMagick + LibRaw |
| ORF | .orf | Olympus | exiftool / ImageMagick + LibRaw |
| RW2 | .rw2 | Panasonic | exiftool / ImageMagick + LibRaw |
| RAF | .raf | Fujifilm | exiftool / ImageMagick + LibRaw |
| PEF | .pef | Pentax/Ricoh | exiftool / ImageMagick + LibRaw |
| 3FR | .3fr | Hasselblad | exiftool / ImageMagick + LibRaw |
| IIQ | .iiq | Phase One | exiftool / ImageMagick + LibRaw |
| SRW | .srw | Samsung | exiftool / ImageMagick + LibRaw |
| X3F | .x3f | Sigma | exiftool / ImageMagick + LibRaw |
| RWL | .rwl | Leica | exiftool / ImageMagick + LibRaw |
| GPR | .gpr | GoPro | exiftool / ImageMagick + LibRaw |
| FFF | .fff | Hasselblad (lawas) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (compact) | exiftool / ImageMagick + LibRaw |

### Format Modern (3) {#modern-formats-3}

| Format | Ekstensi | Decoder | Catatan |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Sinema digital, pencitraan medis |
| QOI | .qoi | Codec TypeScript inline | Pengembangan game, sistem tertanam |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | Foto iPhone |

### Lawas/Sistem (4) {#legacy-system-4}

| Format | Ekstensi | Decoder | Catatan |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Layer terbesar diekstrak |
| CUR | .cur | ImageMagick | Kursor Windows (varian ICO) |
| TGA | .tga | ImageMagick | Deteksi hanya lewat ekstensi |

### Ilmiah dan Gaming (2) {#scientific-and-gaming-2}

| Format | Ekstensi | Decoder | Catatan |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomi (standar NASA) |
| DDS | .dds | ImageMagick | Tekstur game (DirectX) |

### Interchange (6) {#interchange-6}

| Format | Ekstensi | Decoder | Catatan |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | Pixmap berwarna |
| PGM | .pgm | Sharp (native) | Grayscale |
| PBM | .pbm | Sharp (native) | Bitmap 1-bit |
| PNM | .pnm | Sharp (native) | Format payung |
| PAM | .pam | Sharp (native) | Peta arbitrer |
| PFM | .pfm | Sharp (native) | Peta float |

## Format Keluaran (13) {#output-formats-13}

| Format | Encoder | Kontrol Kualitas | Tersedia Di |
|--------|---------|----------------|-------------|
| JPEG | Sharp native | 1-100 | Semua alat |
| PNG | Sharp native | Kompresi 0-9 | Semua alat |
| WebP | Sharp native | 1-100 | Semua alat |
| AVIF | Sharp native | 1-100 | Semua alat |
| TIFF | Sharp native | 1-100 | Alat konversi penuh |
| GIF | Sharp native | 1-100 | Alat konversi penuh |
| JXL | Sharp native | 1-100 | Semua alat |
| HEIC | heif-enc CLI | 1-100 | Alat konversi penuh |
| HEIF | heif-enc CLI | 1-100 | Alat konversi penuh |
| BMP | ImageMagick CLI | Lossless | Alat convert |
| ICO | ImageMagick CLI | Lossless | Alat convert |
| JP2 | opj_compress CLI | Rasio kompresi | Alat convert |
| QOI | Codec inline | Lossless | Alat convert |

## Format Video {#video-formats}

Penguraian dan pengodean video ditangani oleh FFmpeg (build statis), sehingga setiap container dan codec umum didukung pada masukan.

### Container Masukan (15) {#input-containers-15}

| Format | Ekstensi | Codec umum | Catatan |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Container yang paling banyak digunakan |
| QuickTime | .mov | H.264, ProRes | Perekaman/penyuntingan Apple |
| WebM | .webm | VP8, VP9, AV1 | Format web bebas royalti |
| Matroska | .mkv | Apa pun | Container terbuka yang fleksibel |
| AVI | .avi | Beragam | Container lawas Microsoft |
| M4V | .m4v | H.264 | Varian MP4 Apple |
| AVCHD | .mts | H.264 | Rekaman camcorder |
| BDAV | .m2ts | H.264 | Transport stream Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | Perekaman seluler |
| Flash Video | .flv | H.264, VP6 | Streaming lawas |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Video era DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | Transport stream siaran |
| Ogg | .ogv | Theora | Video Ogg terbuka |

### Format Keluaran {#output-formats}

| Format | Ekstensi | Codec video | Dihasilkan oleh |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Convert, compress, dan sebagian besar alat video |
| QuickTime | .mov | H.264 | Convert Video |
| WebM | .webm | VP9 | Convert Video |
| GIF | .gif | - | Video to GIF |
| WebP | .webp | - | Video to WebP (animasi) |

### Subtitle {#subtitles}

| Format | Ekstensi | Operasi |
|--------|-----------|-----------|
| SubRip | .srt | Embed, burn-in, ekstrak, buat otomatis |
| WebVTT | .vtt | Embed, burn-in, ekstrak, buat otomatis |
| ASS / SSA | .ass | Embed, burn-in (mendukung styling) |

## Format Audio {#audio-formats}

Audio juga diproses oleh FFmpeg.

### Format Masukan (11) {#input-formats-11}

| Format | Ekstensi | Kompresi | Catatan |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Lossy | Kompatibilitas universal |
| WAV | .wav | Tanpa kompresi (PCM) | Studio / penyuntingan |
| FLAC | .flac | Lossless | Codec lossless terbuka |
| AAC | .aac | Lossy | Aliran AAC mentah |
| M4A | .m4a | Lossy (AAC) / Lossless (ALAC) | Audio MPEG-4 |
| Ogg Vorbis | .ogg | Lossy | Format terbuka |
| Opus | .opus | Lossy | Modern, latensi rendah |
| WMA | .wma | Lossy | Windows Media Audio |
| AIFF | .aiff | Tanpa kompresi (PCM) | Tanpa kompresi Apple |
| AMR | .amr | Lossy | Suara / seluler |
| AC-3 | .ac3 | Lossy | Dolby Digital |

### Format Keluaran {#output-formats-1}

| Format | Ekstensi | Codec | Dihasilkan oleh |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convert Audio, Extract Audio |
| WAV | .wav | PCM | Convert Audio, Extract Audio |
| FLAC | .flac | FLAC (lossless) | Convert Audio |
| Ogg | .ogg | Vorbis | Convert Audio |
| M4A | .m4a | AAC | Convert Audio, Extract Audio |

## Format Dokumen {#document-formats}

Pemrosesan dokumen menggunakan qpdf, LibreOffice, Ghostscript, Pandoc, dan WeasyPrint.

### Format Masukan (15) {#input-formats-15}

| Format | Ekstensi | Engine | Catatan |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Format dokumen inti |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Teks, lembar, presentasi |
| Rich Text | .rtf | LibreOffice | Rich text lintas aplikasi |
| Plain Text | .txt | LibreOffice, Pandoc | Teks UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Dirender ke PDF |
| EPUB | .epub | Pandoc, LibreOffice | Format e-book |

### Format Keluaran {#output-formats-2}

| Format | Ekstensi | Dihasilkan oleh |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint ke PDF, Markdown ke PDF, HTML ke PDF |
| PDF/A | .pdf | PDF/A Convert (arsip) |
| Word | .docx, .odt, .rtf, .txt | Convert Document, PDF ke Word, Markdown ke Word |
| Presentasi | .pptx, .odp | Convert Presentation |
| Spreadsheet | .xlsx, .ods, .csv | Convert Spreadsheet |
| HTML | .html | Markdown ke HTML |
| EPUB | .epub | Convert ke EPUB |
| Gambar | .png, .jpg | PDF ke Image |

## Format File {#file-formats}

Alat data dan arsip mengonversi antar format terstruktur dan mengemas file.

| Format | Ekstensi | Konversi |
|--------|-----------|-------------|
| CSV | .csv | Ke/dari JSON dan Excel; split dan merge; dari XML |
| JSON | .json | Ke/dari CSV, XML, dan YAML |
| XML | .xml | Ke/dari JSON; ke CSV |
| YAML | .yaml, .yml | Ke/dari JSON |
| Excel | .xlsx | Ke/dari CSV |
| ZIP | .zip | Buat arsip, ekstrak isi |
