---
description: "Obsługiwane formaty plików we wszystkich modalnościach - ponad 55 formatów wejściowych obrazów, wideo, audio, PDF oraz formaty plików."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: e9cd04f02d83
---

# Obsługiwane formaty {#supported-formats}

SnapOtter przetwarza pliki w pięciu modalnościach: obraz, wideo, audio, PDF oraz pliki. Ta strona wymienia wszystkie obsługiwane formaty.

## Formaty obrazów {#image-formats}

SnapOtter obsługuje ponad 55 formatów obrazów na wejściu i 13 formatów na wyjściu.

## Formaty wejściowe {#input-formats}

### Standardy webowe (9) {#web-standards-9}

| Format | Rozszerzenia | Dekoder | Uwagi |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (natywny) | |
| PNG | .png | Sharp (natywny) | Wyodrębniana pierwsza klatka APNG |
| WebP | .webp | Sharp (natywny) | |
| GIF | .gif | Sharp (natywny) | Obsługa animacji |
| AVIF | .avif | Sharp (natywny) | |
| SVG | .svg | Sharp (librsvg) | Sanityzacja pod kątem XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Ochrona przed gzip bomb |
| APNG | .apng | Sharp (natywny) | Tylko pierwsza klatka |
| JPEG XL | .jxl | djxl / ImageMagick | Dwupoziomowy fallback |

### Profesjonalne (7) {#professional-7}

| Format | Rozszerzenia | Dekoder | Uwagi |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (natywny) | Obsługa wielu stron |
| PSD | .psd | ImageMagick | Spłaszczony kompozyt |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Rasteryzacja 300dpi, utwardzone bezpieczeństwo |
| OpenEXR | .exr | ImageMagick | Konwersja linear-to-sRGB |
| Radiance HDR | .hdr | ImageMagick | Konwersja linear-to-sRGB |
| DPX | .dpx | ImageMagick | Konwersja log-to-sRGB |
| Cineon | .cin | ImageMagick | Format film/VFX |

### Camera RAW (23) {#camera-raw-23}

| Format | Rozszerzenia | Marka aparatu | Dekoder |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (uniwersalny) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (przed 2018) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (starsze) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (kompakt) | exiftool / ImageMagick + LibRaw |

### Nowoczesne formaty (3) {#modern-formats-3}

| Format | Rozszerzenia | Dekoder | Uwagi |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Kino cyfrowe, obrazowanie medyczne |
| QOI | .qoi | Wbudowany kodek TypeScript | Tworzenie gier, systemy wbudowane |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | Zdjęcia z iPhone'a |

### Starsze/systemowe (4) {#legacy-system-4}

| Format | Rozszerzenia | Dekoder | Uwagi |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Wyodrębniana największa warstwa |
| CUR | .cur | ImageMagick | Kursor Windows (wariant ICO) |
| TGA | .tga | ImageMagick | Wykrywanie tylko po rozszerzeniu |

### Naukowe i gamingowe (2) {#scientific-and-gaming-2}

| Format | Rozszerzenia | Dekoder | Uwagi |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomia (standard NASA) |
| DDS | .dds | ImageMagick | Tekstury gier (DirectX) |

### Wymiany danych (6) {#interchange-6}

| Format | Rozszerzenia | Dekoder | Uwagi |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (natywny) | Kolorowa mapa pikseli |
| PGM | .pgm | Sharp (natywny) | Skala szarości |
| PBM | .pbm | Sharp (natywny) | Bitmapa 1-bitowa |
| PNM | .pnm | Sharp (natywny) | Format zbiorczy |
| PAM | .pam | Sharp (natywny) | Dowolna mapa |
| PFM | .pfm | Sharp (natywny) | Mapa zmiennoprzecinkowa |

## Formaty wyjściowe (13) {#output-formats-13}

| Format | Enkoder | Kontrola jakości | Dostępny w |
|--------|---------|----------------|-------------|
| JPEG | Sharp natywny | 1-100 | Wszystkie narzędzia |
| PNG | Sharp natywny | Kompresja 0-9 | Wszystkie narzędzia |
| WebP | Sharp natywny | 1-100 | Wszystkie narzędzia |
| AVIF | Sharp natywny | 1-100 | Wszystkie narzędzia |
| TIFF | Sharp natywny | 1-100 | Pełne narzędzia konwersji |
| GIF | Sharp natywny | 1-100 | Pełne narzędzia konwersji |
| JXL | Sharp natywny | 1-100 | Wszystkie narzędzia |
| HEIC | heif-enc CLI | 1-100 | Pełne narzędzia konwersji |
| HEIF | heif-enc CLI | 1-100 | Pełne narzędzia konwersji |
| BMP | ImageMagick CLI | Bezstratny | Narzędzie konwersji |
| ICO | ImageMagick CLI | Bezstratny | Narzędzie konwersji |
| JP2 | opj_compress CLI | Współczynnik kompresji | Narzędzie konwersji |
| QOI | Wbudowany kodek | Bezstratny | Narzędzie konwersji |

## Formaty wideo {#video-formats}

Dekodowanie i kodowanie wideo obsługuje FFmpeg (kompilacja statyczna), więc każdy popularny kontener i kodek jest obsługiwany na wejściu.

### Kontenery wejściowe (15) {#input-containers-15}

| Format | Rozszerzenia | Typowe kodeki | Uwagi |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Najczęściej używany kontener |
| QuickTime | .mov | H.264, ProRes | Nagrywanie/edycja Apple |
| WebM | .webm | VP8, VP9, AV1 | Wolny od opłat format webowy |
| Matroska | .mkv | Dowolne | Elastyczny otwarty kontener |
| AVI | .avi | Różne | Starszy kontener Microsoftu |
| M4V | .m4v | H.264 | Wariant MP4 firmy Apple |
| AVCHD | .mts | H.264 | Nagrania z kamer |
| BDAV | .m2ts | H.264 | Strumień transportowy Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | Nagrania mobilne |
| Flash Video | .flv | H.264, VP6 | Starszy streaming |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Wideo z ery DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | Nadawczy strumień transportowy |
| Ogg | .ogv | Theora | Otwarte wideo Ogg |

### Formaty wyjściowe {#output-formats}

| Format | Rozszerzenie | Kodek wideo | Tworzone przez |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Konwersję, kompresję i większość narzędzi wideo |
| QuickTime | .mov | H.264 | Konwersję wideo |
| WebM | .webm | VP9 | Konwersję wideo |
| GIF | .gif | - | Wideo do GIF |
| WebP | .webp | - | Wideo do WebP (animowany) |

### Napisy {#subtitles}

| Format | Rozszerzenie | Operacje |
|--------|-----------|-----------|
| SubRip | .srt | Osadzanie, wypalanie, wyodrębnianie, automatyczne generowanie |
| WebVTT | .vtt | Osadzanie, wypalanie, wyodrębnianie, automatyczne generowanie |
| ASS / SSA | .ass | Osadzanie, wypalanie (obsługa stylizacji) |

## Formaty audio {#audio-formats}

Audio również jest przetwarzane przez FFmpeg.

### Formaty wejściowe (11) {#input-formats-11}

| Format | Rozszerzenia | Kompresja | Uwagi |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Stratna | Uniwersalna zgodność |
| WAV | .wav | Nieskompresowany (PCM) | Studio / edycja |
| FLAC | .flac | Bezstratna | Otwarty kodek bezstratny |
| AAC | .aac | Stratna | Surowy strumień AAC |
| M4A | .m4a | Stratna (AAC) / Bezstratna (ALAC) | Audio MPEG-4 |
| Ogg Vorbis | .ogg | Stratna | Otwarty format |
| Opus | .opus | Stratna | Nowoczesny, niskie opóźnienie |
| WMA | .wma | Stratna | Windows Media Audio |
| AIFF | .aiff | Nieskompresowany (PCM) | Nieskompresowany Apple |
| AMR | .amr | Stratna | Mowa / mobilne |
| AC-3 | .ac3 | Stratna | Dolby Digital |

### Formaty wyjściowe {#output-formats-1}

| Format | Rozszerzenie | Kodek | Tworzone przez |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Konwersję audio, wyodrębnianie audio |
| WAV | .wav | PCM | Konwersję audio, wyodrębnianie audio |
| FLAC | .flac | FLAC (bezstratny) | Konwersję audio |
| Ogg | .ogg | Vorbis | Konwersję audio |
| M4A | .m4a | AAC | Konwersję audio, wyodrębnianie audio |

## Formaty dokumentów {#document-formats}

Przetwarzanie dokumentów wykorzystuje qpdf, LibreOffice, Ghostscript, Pandoc oraz WeasyPrint.

### Formaty wejściowe (15) {#input-formats-15}

| Format | Rozszerzenia | Silnik | Uwagi |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Podstawowy format dokumentów |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Tekst, arkusz, prezentacja |
| Rich Text | .rtf | LibreOffice | Tekst sformatowany między aplikacjami |
| Plain Text | .txt | LibreOffice, Pandoc | Tekst UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Renderowane do PDF |
| EPUB | .epub | Pandoc, LibreOffice | Format e-booków |

### Formaty wyjściowe {#output-formats-2}

| Format | Rozszerzenia | Tworzone przez |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint do PDF, Markdown do PDF, HTML do PDF |
| PDF/A | .pdf | Konwersję PDF/A (archiwizacja) |
| Word | .docx, .odt, .rtf, .txt | Konwersję dokumentu, PDF do Word, Markdown do Word |
| Prezentacja | .pptx, .odp | Konwersję prezentacji |
| Arkusz kalkulacyjny | .xlsx, .ods, .csv | Konwersję arkusza |
| HTML | .html | Markdown do HTML |
| EPUB | .epub | Konwersję do EPUB |
| Obrazy | .png, .jpg | PDF do obrazu |

## Formaty plików {#file-formats}

Narzędzia do danych i archiwów konwertują między formatami strukturalnymi i pakują pliki.

| Format | Rozszerzenia | Konwersje |
|--------|-----------|-------------|
| CSV | .csv | Do/z JSON i Excela; dzielenie i scalanie; z XML |
| JSON | .json | Do/z CSV, XML i YAML |
| XML | .xml | Do/z JSON; do CSV |
| YAML | .yaml, .yml | Do/z JSON |
| Excel | .xlsx | Do/z CSV |
| ZIP | .zip | Tworzenie archiwów, wyodrębnianie zawartości |
