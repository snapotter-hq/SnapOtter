---
description: "Tüm modaliteler genelinde desteklenen dosya formatları - 55+ görüntü giriş formatı, video, ses, PDF ve dosya formatları."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 39fc493d18f5
---

# Desteklenen Formatlar {#supported-formats}

SnapOtter dosyaları beş modalitede işler: görüntü, video, ses, PDF ve dosyalar. Bu sayfa desteklenen tüm formatları listeler.

## Görüntü Formatları {#image-formats}

SnapOtter giriş için 55+ görüntü formatını, çıkış için 13 formatı destekler.

## Giriş Formatları {#input-formats}

### Web Standartları (9) {#web-standards-9}

| Format | Uzantılar | Çözücü | Notlar |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (yerel) | |
| PNG | .png | Sharp (yerel) | APNG ilk kare çıkarılır |
| WebP | .webp | Sharp (yerel) | |
| GIF | .gif | Sharp (yerel) | Animasyonlu desteklenir |
| AVIF | .avif | Sharp (yerel) | |
| SVG | .svg | Sharp (librsvg) | XXE/SSRF için temizlenir |
| SVGZ | .svgz | gunzip + Sharp | Gzip bomb koruması |
| APNG | .apng | Sharp (yerel) | Yalnızca ilk kare |
| JPEG XL | .jxl | djxl / ImageMagick | İki katmanlı geri dönüş |

### Profesyonel (7) {#professional-7}

| Format | Uzantılar | Çözücü | Notlar |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (yerel) | Çok sayfalı desteklenir |
| PSD | .psd | ImageMagick | Düzleştirilmiş kompozit |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | 300dpi rasterleştirme, güvenlik sağlamlaştırılmış |
| OpenEXR | .exr | ImageMagick | Doğrusaldan sRGB'ye dönüşüm |
| Radiance HDR | .hdr | ImageMagick | Doğrusaldan sRGB'ye dönüşüm |
| DPX | .dpx | ImageMagick | Log'dan sRGB'ye dönüşüm |
| Cineon | .cin | ImageMagick | Film/VFX formatı |

### Kamera RAW (23) {#camera-raw-23}

| Format | Uzantılar | Kamera Markası | Çözücü |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (evrensel) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (2018 öncesi) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (eski) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (kompakt) | exiftool / ImageMagick + LibRaw |

### Modern Formatlar (3) {#modern-formats-3}

| Format | Uzantılar | Çözücü | Notlar |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Dijital sinema, tıbbi görüntüleme |
| QOI | .qoi | Satır içi TypeScript codec | Oyun geliştirme, gömülü sistemler |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhone fotoğrafları |

### Eski/Sistem (4) {#legacy-system-4}

| Format | Uzantılar | Çözücü | Notlar |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | En büyük katman çıkarılır |
| CUR | .cur | ImageMagick | Windows imleci (ICO varyantı) |
| TGA | .tga | ImageMagick | Yalnızca uzantı algılama |

### Bilimsel ve Oyun (2) {#scientific-and-gaming-2}

| Format | Uzantılar | Çözücü | Notlar |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomi (NASA standardı) |
| DDS | .dds | ImageMagick | Oyun dokuları (DirectX) |

### Değiş Tokuş (6) {#interchange-6}

| Format | Uzantılar | Çözücü | Notlar |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (yerel) | Renkli pixmap |
| PGM | .pgm | Sharp (yerel) | Gri tonlamalı |
| PBM | .pbm | Sharp (yerel) | 1-bit bitmap |
| PNM | .pnm | Sharp (yerel) | Şemsiye format |
| PAM | .pam | Sharp (yerel) | Keyfi map |
| PFM | .pfm | Sharp (yerel) | Float map |

## Çıkış Formatları (13) {#output-formats-13}

| Format | Kodlayıcı | Kalite Kontrolü | Kullanılabildiği Yer |
|--------|---------|----------------|-------------|
| JPEG | Sharp yerel | 1-100 | Tüm araçlar |
| PNG | Sharp yerel | Sıkıştırma 0-9 | Tüm araçlar |
| WebP | Sharp yerel | 1-100 | Tüm araçlar |
| AVIF | Sharp yerel | 1-100 | Tüm araçlar |
| TIFF | Sharp yerel | 1-100 | Tam dönüştürme araçları |
| GIF | Sharp yerel | 1-100 | Tam dönüştürme araçları |
| JXL | Sharp yerel | 1-100 | Tüm araçlar |
| HEIC | heif-enc CLI | 1-100 | Tam dönüştürme araçları |
| HEIF | heif-enc CLI | 1-100 | Tam dönüştürme araçları |
| BMP | ImageMagick CLI | Kayıpsız | Dönüştürme aracı |
| ICO | ImageMagick CLI | Kayıpsız | Dönüştürme aracı |
| JP2 | opj_compress CLI | Sıkıştırma oranı | Dönüştürme aracı |
| QOI | Satır içi codec | Kayıpsız | Dönüştürme aracı |

## Video Formatları {#video-formats}

Video çözme ve kodlama FFmpeg (statik derleme) tarafından yapılır, bu yüzden yaygın her container ve codec girişte desteklenir.

### Giriş Container'ları (15) {#input-containers-15}

| Format | Uzantılar | Tipik codec'ler | Notlar |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | En yaygın kullanılan container |
| QuickTime | .mov | H.264, ProRes | Apple yakalama/düzenleme |
| WebM | .webm | VP8, VP9, AV1 | Telifsiz web formatı |
| Matroska | .mkv | Herhangi | Esnek açık container |
| AVI | .avi | Çeşitli | Eski Microsoft container |
| M4V | .m4v | H.264 | Apple MP4 varyantı |
| AVCHD | .mts | H.264 | Kamera kayıtları |
| BDAV | .m2ts | H.264 | Blu-ray / AVCHD taşıma akışı |
| 3GP | .3gp | H.264, MPEG-4 | Mobil yakalama |
| Flash Video | .flv | H.264, VP6 | Eski akış |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | DVD dönemi video |
| MPEG-TS | .ts | MPEG-2, H.264 | Yayın taşıma akışı |
| Ogg | .ogv | Theora | Açık Ogg video |

### Çıkış Formatları {#output-formats}

| Format | Uzantı | Video codec | Üreten |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Dönüştürme, sıkıştırma ve çoğu video aracı |
| QuickTime | .mov | H.264 | Video Dönüştür |
| WebM | .webm | VP9 | Video Dönüştür |
| GIF | .gif | - | Video'dan GIF'e |
| WebP | .webp | - | Video'dan WebP'ye (animasyonlu) |

### Altyazılar {#subtitles}

| Format | Uzantı | İşlemler |
|--------|-----------|-----------|
| SubRip | .srt | Gömme, yakma, çıkarma, otomatik oluşturma |
| WebVTT | .vtt | Gömme, yakma, çıkarma, otomatik oluşturma |
| ASS / SSA | .ass | Gömme, yakma (stil desteği) |

## Ses Formatları {#audio-formats}

Ses de FFmpeg tarafından işlenir.

### Giriş Formatları (11) {#input-formats-11}

| Format | Uzantılar | Sıkıştırma | Notlar |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Kayıplı | Evrensel uyumluluk |
| WAV | .wav | Sıkıştırılmamış (PCM) | Stüdyo / düzenleme |
| FLAC | .flac | Kayıpsız | Açık kayıpsız codec |
| AAC | .aac | Kayıplı | Ham AAC akışı |
| M4A | .m4a | Kayıplı (AAC) / Kayıpsız (ALAC) | MPEG-4 ses |
| Ogg Vorbis | .ogg | Kayıplı | Açık format |
| Opus | .opus | Kayıplı | Modern, düşük gecikmeli |
| WMA | .wma | Kayıplı | Windows Media Audio |
| AIFF | .aiff | Sıkıştırılmamış (PCM) | Apple sıkıştırılmamış |
| AMR | .amr | Kayıplı | Konuşma / mobil |
| AC-3 | .ac3 | Kayıplı | Dolby Digital |

### Çıkış Formatları {#output-formats-1}

| Format | Uzantı | Codec | Üreten |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Ses Dönüştür, Ses Çıkar |
| WAV | .wav | PCM | Ses Dönüştür, Ses Çıkar |
| FLAC | .flac | FLAC (kayıpsız) | Ses Dönüştür |
| Ogg | .ogg | Vorbis | Ses Dönüştür |
| M4A | .m4a | AAC | Ses Dönüştür, Ses Çıkar |

## Belge Formatları {#document-formats}

Belge işleme qpdf, LibreOffice, Ghostscript, Pandoc ve WeasyPrint kullanır.

### Giriş Formatları (15) {#input-formats-15}

| Format | Uzantılar | Motor | Notlar |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Temel belge formatı |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Metin, sayfa, sunum |
| Rich Text | .rtf | LibreOffice | Uygulamalar arası zengin metin |
| Düz Metin | .txt | LibreOffice, Pandoc | UTF-8 metin |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | PDF'ye render edilir |
| EPUB | .epub | Pandoc, LibreOffice | E-kitap formatı |

### Çıkış Formatları {#output-formats-2}

| Format | Uzantılar | Üreten |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint'ten PDF'e, Markdown'dan PDF'e, HTML'den PDF'e |
| PDF/A | .pdf | PDF/A Dönüştür (arşivleme) |
| Word | .docx, .odt, .rtf, .txt | Belge Dönüştür, PDF'den Word'e, Markdown'dan Word'e |
| Sunum | .pptx, .odp | Sunum Dönüştür |
| Elektronik tablo | .xlsx, .ods, .csv | Elektronik Tablo Dönüştür |
| HTML | .html | Markdown'dan HTML'ye |
| EPUB | .epub | EPUB'a Dönüştür |
| Görüntüler | .png, .jpg | PDF'den Görüntüye |

## Dosya Formatları {#file-formats}

Veri ve arşiv araçları, yapılandırılmış formatlar arasında dönüştürme yapar ve dosyaları paketler.

| Format | Uzantılar | Dönüşümler |
|--------|-----------|-------------|
| CSV | .csv | JSON ve Excel'e/'den; böl ve birleştir; XML'den |
| JSON | .json | CSV, XML ve YAML'a/'dan |
| XML | .xml | JSON'a/'dan; CSV'ye |
| YAML | .yaml, .yml | JSON'a/'dan |
| Excel | .xlsx | CSV'ye/'den |
| ZIP | .zip | Arşiv oluştur, içerik çıkar |
