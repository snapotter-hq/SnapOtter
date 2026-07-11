---
description: "Ondersteunde bestandsformaten over alle modaliteiten - 55+ afbeeldingsinvoerformaten, video, audio, PDF en bestandsformaten."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 791254c201df
---

# Ondersteunde formaten {#supported-formats}

SnapOtter verwerkt bestanden over vijf modaliteiten: afbeelding, video, audio, PDF en bestanden. Deze pagina somt alle ondersteunde formaten op.

## Afbeeldingsformaten {#image-formats}

SnapOtter ondersteunt 55+ afbeeldingsformaten voor invoer en 13 formaten voor uitvoer.

## Invoerformaten {#input-formats}

### Webstandaarden (9) {#web-standards-9}

| Formaat | Extensies | Decoder | Opmerkingen |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (native) | |
| PNG | .png | Sharp (native) | Eerste frame van APNG geëxtraheerd |
| WebP | .webp | Sharp (native) | |
| GIF | .gif | Sharp (native) | Geanimeerd ondersteund |
| AVIF | .avif | Sharp (native) | |
| SVG | .svg | Sharp (librsvg) | Gesaneerd tegen XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Bescherming tegen gzip-bombs |
| APNG | .apng | Sharp (native) | Alleen eerste frame |
| JPEG XL | .jxl | djxl / ImageMagick | Fallback in twee niveaus |

### Professioneel (7) {#professional-7}

| Formaat | Extensies | Decoder | Opmerkingen |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | Meerdere pagina's ondersteund |
| PSD | .psd | ImageMagick | Afgeplatte composiet |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Rasterisatie op 300 dpi, beveiligingsgehard |
| OpenEXR | .exr | ImageMagick | Lineair-naar-sRGB-conversie |
| Radiance HDR | .hdr | ImageMagick | Lineair-naar-sRGB-conversie |
| DPX | .dpx | ImageMagick | Log-naar-sRGB-conversie |
| Cineon | .cin | ImageMagick | Film/VFX-formaat |

### Camera-RAW (23) {#camera-raw-23}

| Formaat | Extensies | Cameramerk | Decoder |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (universeel) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (vóór 2018) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (legacy) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (compact) | exiftool / ImageMagick + LibRaw |

### Moderne formaten (3) {#modern-formats-3}

| Formaat | Extensies | Decoder | Opmerkingen |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Digital cinema, medische beeldvorming |
| QOI | .qoi | Inline TypeScript-codec | Game-ontwikkeling, embedded systemen |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhone-foto's |

### Legacy/systeem (4) {#legacy-system-4}

| Formaat | Extensies | Decoder | Opmerkingen |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Grootste laag geëxtraheerd |
| CUR | .cur | ImageMagick | Windows-cursor (ICO-variant) |
| TGA | .tga | ImageMagick | Detectie alleen op extensie |

### Wetenschappelijk en gaming (2) {#scientific-and-gaming-2}

| Formaat | Extensies | Decoder | Opmerkingen |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomie (NASA-standaard) |
| DDS | .dds | ImageMagick | Game-textures (DirectX) |

### Interchange (6) {#interchange-6}

| Formaat | Extensies | Decoder | Opmerkingen |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | Kleuren-pixmap |
| PGM | .pgm | Sharp (native) | Grijswaarden |
| PBM | .pbm | Sharp (native) | 1-bits bitmap |
| PNM | .pnm | Sharp (native) | Overkoepelend formaat |
| PAM | .pam | Sharp (native) | Willekeurige map |
| PFM | .pfm | Sharp (native) | Float-map |

## Uitvoerformaten (13) {#output-formats-13}

| Formaat | Encoder | Kwaliteitsregeling | Beschikbaar in |
|--------|---------|----------------|-------------|
| JPEG | Sharp native | 1-100 | Alle tools |
| PNG | Sharp native | Compressie 0-9 | Alle tools |
| WebP | Sharp native | 1-100 | Alle tools |
| AVIF | Sharp native | 1-100 | Alle tools |
| TIFF | Sharp native | 1-100 | Volledige conversietools |
| GIF | Sharp native | 1-100 | Volledige conversietools |
| JXL | Sharp native | 1-100 | Alle tools |
| HEIC | heif-enc CLI | 1-100 | Volledige conversietools |
| HEIF | heif-enc CLI | 1-100 | Volledige conversietools |
| BMP | ImageMagick CLI | Lossless | Convert-tool |
| ICO | ImageMagick CLI | Lossless | Convert-tool |
| JP2 | opj_compress CLI | Compressieverhouding | Convert-tool |
| QOI | Inline codec | Lossless | Convert-tool |

## Videoformaten {#video-formats}

Videodecodering en -codering worden afgehandeld door FFmpeg (statische build), dus elke gangbare container en codec wordt bij de invoer ondersteund.

### Invoercontainers (15) {#input-containers-15}

| Formaat | Extensies | Typische codecs | Opmerkingen |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Meest gebruikte container |
| QuickTime | .mov | H.264, ProRes | Apple opname/bewerking |
| WebM | .webm | VP8, VP9, AV1 | Royaltyvrij webformaat |
| Matroska | .mkv | Elke | Flexibele open container |
| AVI | .avi | Diverse | Legacy Microsoft-container |
| M4V | .m4v | H.264 | Apple MP4-variant |
| AVCHD | .mts | H.264 | Camcorder-opnamen |
| BDAV | .m2ts | H.264 | Blu-ray / AVCHD-transportstroom |
| 3GP | .3gp | H.264, MPEG-4 | Mobiele opname |
| Flash Video | .flv | H.264, VP6 | Legacy streaming |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Video uit het dvd-tijdperk |
| MPEG-TS | .ts | MPEG-2, H.264 | Broadcast-transportstroom |
| Ogg | .ogv | Theora | Open Ogg-video |

### Uitvoerformaten {#output-formats}

| Formaat | Extensie | Videocodec | Geproduceerd door |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Convert, compress en de meeste videotools |
| QuickTime | .mov | H.264 | Convert Video |
| WebM | .webm | VP9 | Convert Video |
| GIF | .gif | - | Video naar GIF |
| WebP | .webp | - | Video naar WebP (geanimeerd) |

### Ondertitels {#subtitles}

| Formaat | Extensie | Bewerkingen |
|--------|-----------|-----------|
| SubRip | .srt | Embedden, inbranden, extraheren, automatisch genereren |
| WebVTT | .vtt | Embedden, inbranden, extraheren, automatisch genereren |
| ASS / SSA | .ass | Embedden, inbranden (ondersteunt styling) |

## Audioformaten {#audio-formats}

Audio wordt eveneens verwerkt door FFmpeg.

### Invoerformaten (11) {#input-formats-11}

| Formaat | Extensies | Compressie | Opmerkingen |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Lossy | Universele compatibiliteit |
| WAV | .wav | Ongecomprimeerd (PCM) | Studio / bewerking |
| FLAC | .flac | Lossless | Open lossless-codec |
| AAC | .aac | Lossy | Ruwe AAC-stream |
| M4A | .m4a | Lossy (AAC) / Lossless (ALAC) | MPEG-4-audio |
| Ogg Vorbis | .ogg | Lossy | Open formaat |
| Opus | .opus | Lossy | Modern, lage latency |
| WMA | .wma | Lossy | Windows Media Audio |
| AIFF | .aiff | Ongecomprimeerd (PCM) | Apple ongecomprimeerd |
| AMR | .amr | Lossy | Spraak / mobiel |
| AC-3 | .ac3 | Lossy | Dolby Digital |

### Uitvoerformaten {#output-formats-1}

| Formaat | Extensie | Codec | Geproduceerd door |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convert Audio, Extract Audio |
| WAV | .wav | PCM | Convert Audio, Extract Audio |
| FLAC | .flac | FLAC (lossless) | Convert Audio |
| Ogg | .ogg | Vorbis | Convert Audio |
| M4A | .m4a | AAC | Convert Audio, Extract Audio |

## Documentformaten {#document-formats}

Documentverwerking gebruikt qpdf, LibreOffice, Ghostscript, Pandoc en WeasyPrint.

### Invoerformaten (15) {#input-formats-15}

| Formaat | Extensies | Engine | Opmerkingen |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Kern-documentformaat |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Tekst, spreadsheet, presentatie |
| Rich Text | .rtf | LibreOffice | Rich text tussen apps |
| Platte tekst | .txt | LibreOffice, Pandoc | UTF-8-tekst |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Naar PDF gerenderd |
| EPUB | .epub | Pandoc, LibreOffice | E-boekformaat |

### Uitvoerformaten {#output-formats-2}

| Formaat | Extensies | Geproduceerd door |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint naar PDF, Markdown naar PDF, HTML naar PDF |
| PDF/A | .pdf | PDF/A Convert (archivering) |
| Word | .docx, .odt, .rtf, .txt | Convert Document, PDF naar Word, Markdown naar Word |
| Presentatie | .pptx, .odp | Convert Presentation |
| Spreadsheet | .xlsx, .ods, .csv | Convert Spreadsheet |
| HTML | .html | Markdown naar HTML |
| EPUB | .epub | Convert to EPUB |
| Afbeeldingen | .png, .jpg | PDF naar Image |

## Bestandsformaten {#file-formats}

Data- en archieftools converteren tussen gestructureerde formaten en bundelen bestanden.

| Formaat | Extensies | Conversies |
|--------|-----------|-------------|
| CSV | .csv | Van/naar JSON en Excel; splitsen en samenvoegen; vanuit XML |
| JSON | .json | Van/naar CSV, XML en YAML |
| XML | .xml | Van/naar JSON; naar CSV |
| YAML | .yaml, .yml | Van/naar JSON |
| Excel | .xlsx | Van/naar CSV |
| ZIP | .zip | Archieven maken, inhoud extraheren |
