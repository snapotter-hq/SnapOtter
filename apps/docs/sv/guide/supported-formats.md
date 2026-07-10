---
description: "Stödda filformat över alla modaliteter - 55+ inmatningsformat för bild, video, ljud, PDF och filformat."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 1d1f58d734df
---

# Stödda format {#supported-formats}

SnapOtter bearbetar filer över fem modaliteter: bild, video, ljud, PDF och filer. Denna sida listar alla stödda format.

## Bildformat {#image-formats}

SnapOtter stöder 55+ bildformat för inmatning och 13 format för utmatning.

## Inmatningsformat {#input-formats}

### Webbstandarder (9) {#web-standards-9}

| Format | Filändelser | Avkodare | Anmärkningar |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (native) | |
| PNG | .png | Sharp (native) | Första bildrutan extraheras från APNG |
| WebP | .webp | Sharp (native) | |
| GIF | .gif | Sharp (native) | Animerad stöds |
| AVIF | .avif | Sharp (native) | |
| SVG | .svg | Sharp (librsvg) | Sanerad för XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Skydd mot gzip-bomb |
| APNG | .apng | Sharp (native) | Endast första bildrutan |
| JPEG XL | .jxl | djxl / ImageMagick | Reservlösning i två nivåer |

### Professionella (7) {#professional-7}

| Format | Filändelser | Avkodare | Anmärkningar |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | Flersidig stöds |
| PSD | .psd | ImageMagick | Tillplattad komposit |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | 300dpi-rasterisering, säkerhetshärdad |
| OpenEXR | .exr | ImageMagick | Linjär-till-sRGB-konvertering |
| Radiance HDR | .hdr | ImageMagick | Linjär-till-sRGB-konvertering |
| DPX | .dpx | ImageMagick | Log-till-sRGB-konvertering |
| Cineon | .cin | ImageMagick | Film/VFX-format |

### Kamera-RAW (23) {#camera-raw-23}

| Format | Filändelser | Kameramärke | Avkodare |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (universellt) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (före 2018) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (äldre) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (kompakt) | exiftool / ImageMagick + LibRaw |

### Moderna format (3) {#modern-formats-3}

| Format | Filändelser | Avkodare | Anmärkningar |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Digital biograf, medicinsk avbildning |
| QOI | .qoi | Inbyggd TypeScript-codec | Spelutveckling, inbäddade system |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhone-foton |

### Äldre/System (4) {#legacy-system-4}

| Format | Filändelser | Avkodare | Anmärkningar |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Största lagret extraheras |
| CUR | .cur | ImageMagick | Windows-markör (ICO-variant) |
| TGA | .tga | ImageMagick | Endast filändelsedetektering |

### Vetenskapliga och spel (2) {#scientific-and-gaming-2}

| Format | Filändelser | Avkodare | Anmärkningar |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomi (NASA-standard) |
| DDS | .dds | ImageMagick | Speltexturer (DirectX) |

### Utbyte (6) {#interchange-6}

| Format | Filändelser | Avkodare | Anmärkningar |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | Färgpixmap |
| PGM | .pgm | Sharp (native) | Gråskala |
| PBM | .pbm | Sharp (native) | 1-bitars bitmap |
| PNM | .pnm | Sharp (native) | Paraplyformat |
| PAM | .pam | Sharp (native) | Godtycklig karta |
| PFM | .pfm | Sharp (native) | Float-karta |

## Utmatningsformat (13) {#output-formats-13}

| Format | Kodare | Kvalitetskontroll | Tillgängligt i |
|--------|---------|----------------|-------------|
| JPEG | Sharp native | 1-100 | Alla verktyg |
| PNG | Sharp native | Komprimering 0-9 | Alla verktyg |
| WebP | Sharp native | 1-100 | Alla verktyg |
| AVIF | Sharp native | 1-100 | Alla verktyg |
| TIFF | Sharp native | 1-100 | Fullständiga konverteringsverktyg |
| GIF | Sharp native | 1-100 | Fullständiga konverteringsverktyg |
| JXL | Sharp native | 1-100 | Alla verktyg |
| HEIC | heif-enc CLI | 1-100 | Fullständiga konverteringsverktyg |
| HEIF | heif-enc CLI | 1-100 | Fullständiga konverteringsverktyg |
| BMP | ImageMagick CLI | Förlustfri | Konverteringsverktyg |
| ICO | ImageMagick CLI | Förlustfri | Konverteringsverktyg |
| JP2 | opj_compress CLI | Komprimeringsförhållande | Konverteringsverktyg |
| QOI | Inbyggd codec | Förlustfri | Konverteringsverktyg |

## Videoformat {#video-formats}

Videoavkodning och kodning hanteras av FFmpeg (statisk build), så varje vanlig container och codec stöds vid inmatning.

### Inmatningscontainrar (15) {#input-containers-15}

| Format | Filändelser | Typiska codecs | Anmärkningar |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Mest använda containern |
| QuickTime | .mov | H.264, ProRes | Apple-inspelning/redigering |
| WebM | .webm | VP8, VP9, AV1 | Royaltyfritt webbformat |
| Matroska | .mkv | Vilken som helst | Flexibel öppen container |
| AVI | .avi | Diverse | Äldre Microsoft-container |
| M4V | .m4v | H.264 | Apple MP4-variant |
| AVCHD | .mts | H.264 | Videokamerainspelningar |
| BDAV | .m2ts | H.264 | Blu-ray / AVCHD-transportström |
| 3GP | .3gp | H.264, MPEG-4 | Mobil inspelning |
| Flash Video | .flv | H.264, VP6 | Äldre strömning |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | DVD-erans video |
| MPEG-TS | .ts | MPEG-2, H.264 | Sändningstransportström |
| Ogg | .ogv | Theora | Öppen Ogg-video |

### Utmatningsformat {#output-formats}

| Format | Filändelse | Videocodec | Produceras av |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Konvertering, komprimering och de flesta videoverktyg |
| QuickTime | .mov | H.264 | Konvertera video |
| WebM | .webm | VP9 | Konvertera video |
| GIF | .gif | - | Video till GIF |
| WebP | .webp | - | Video till WebP (animerad) |

### Undertexter {#subtitles}

| Format | Filändelse | Operationer |
|--------|-----------|-----------|
| SubRip | .srt | Bädda in, bränn in, extrahera, generera automatiskt |
| WebVTT | .vtt | Bädda in, bränn in, extrahera, generera automatiskt |
| ASS / SSA | .ass | Bädda in, bränn in (stöder styling) |

## Ljudformat {#audio-formats}

Ljud bearbetas också av FFmpeg.

### Inmatningsformat (11) {#input-formats-11}

| Format | Filändelser | Komprimering | Anmärkningar |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Förlustbehäftad | Universell kompatibilitet |
| WAV | .wav | Okomprimerad (PCM) | Studio / redigering |
| FLAC | .flac | Förlustfri | Öppen förlustfri codec |
| AAC | .aac | Förlustbehäftad | Rå AAC-ström |
| M4A | .m4a | Förlustbehäftad (AAC) / Förlustfri (ALAC) | MPEG-4-ljud |
| Ogg Vorbis | .ogg | Förlustbehäftad | Öppet format |
| Opus | .opus | Förlustbehäftad | Modern, låg latens |
| WMA | .wma | Förlustbehäftad | Windows Media Audio |
| AIFF | .aiff | Okomprimerad (PCM) | Apple okomprimerad |
| AMR | .amr | Förlustbehäftad | Tal / mobil |
| AC-3 | .ac3 | Förlustbehäftad | Dolby Digital |

### Utmatningsformat {#output-formats-1}

| Format | Filändelse | Codec | Produceras av |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Konvertera ljud, extrahera ljud |
| WAV | .wav | PCM | Konvertera ljud, extrahera ljud |
| FLAC | .flac | FLAC (förlustfri) | Konvertera ljud |
| Ogg | .ogg | Vorbis | Konvertera ljud |
| M4A | .m4a | AAC | Konvertera ljud, extrahera ljud |

## Dokumentformat {#document-formats}

Dokumentbearbetning använder qpdf, LibreOffice, Ghostscript, Pandoc och WeasyPrint.

### Inmatningsformat (15) {#input-formats-15}

| Format | Filändelser | Motor | Anmärkningar |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Centralt dokumentformat |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Text, kalkylblad, presentation |
| Rich Text | .rtf | LibreOffice | Rich text mellan applikationer |
| Vanlig text | .txt | LibreOffice, Pandoc | UTF-8-text |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Renderad till PDF |
| EPUB | .epub | Pandoc, LibreOffice | E-bokformat |

### Utmatningsformat {#output-formats-2}

| Format | Filändelser | Produceras av |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint till PDF, Markdown till PDF, HTML till PDF |
| PDF/A | .pdf | PDF/A-konvertering (arkivering) |
| Word | .docx, .odt, .rtf, .txt | Konvertera dokument, PDF till Word, Markdown till Word |
| Presentation | .pptx, .odp | Konvertera presentation |
| Kalkylblad | .xlsx, .ods, .csv | Konvertera kalkylblad |
| HTML | .html | Markdown till HTML |
| EPUB | .epub | Konvertera till EPUB |
| Bilder | .png, .jpg | PDF till bild |

## Filformat {#file-formats}

Data- och arkivverktyg konverterar mellan strukturerade format och paketerar filer.

| Format | Filändelser | Konverteringar |
|--------|-----------|-------------|
| CSV | .csv | Till/från JSON och Excel; dela och slå samman; från XML |
| JSON | .json | Till/från CSV, XML och YAML |
| XML | .xml | Till/från JSON; till CSV |
| YAML | .yaml, .yml | Till/från JSON |
| Excel | .xlsx | Till/från CSV |
| ZIP | .zip | Skapa arkiv, extrahera innehåll |
