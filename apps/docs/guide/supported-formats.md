---
description: Supported file formats across all modalities - 55+ image input formats, video, audio, PDF, and file formats.
---

# Supported Formats {#supported-formats}

SnapOtter processes files across five modalities: image, video, audio, PDF, and files. This page lists all supported formats.

## Image Formats {#image-formats}

SnapOtter supports 55+ image formats for input and 13 formats for output.

## Input Formats {#input-formats}

### Web Standards (9) {#web-standards-9}

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (native) | |
| PNG | .png | Sharp (native) | APNG first-frame extracted |
| WebP | .webp | Sharp (native) | |
| GIF | .gif | Sharp (native) | Animated supported |
| AVIF | .avif | Sharp (native) | |
| SVG | .svg | Sharp (librsvg) | Sanitized for XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Gzip bomb protection |
| APNG | .apng | Sharp (native) | First frame only |
| JPEG XL | .jxl | djxl / ImageMagick | Two-tier fallback |

### Professional (7) {#professional-7}

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | Multi-page supported |
| PSD | .psd | ImageMagick | Flattened composite |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | 300dpi rasterization, security hardened |
| OpenEXR | .exr | ImageMagick | Linear-to-sRGB conversion |
| Radiance HDR | .hdr | ImageMagick | Linear-to-sRGB conversion |
| DPX | .dpx | ImageMagick | Log-to-sRGB conversion |
| Cineon | .cin | ImageMagick | Film/VFX format |

### Camera RAW (23) {#camera-raw-23}

| Format | Extensions | Camera Brand | Decoder |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (universal) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (pre-2018) | exiftool / ImageMagick + LibRaw |
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

### Modern Formats (3) {#modern-formats-3}

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Digital cinema, medical imaging |
| QOI | .qoi | Inline TypeScript codec | Game dev, embedded systems |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhone photos |

### Legacy/System (4) {#legacy-system-4}

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Largest layer extracted |
| CUR | .cur | ImageMagick | Windows cursor (ICO variant) |
| TGA | .tga | ImageMagick | Extension-only detection |

### Scientific and Gaming (2) {#scientific-and-gaming-2}

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomy (NASA standard) |
| DDS | .dds | ImageMagick | Game textures (DirectX) |

### Interchange (6) {#interchange-6}

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | Color pixmap |
| PGM | .pgm | Sharp (native) | Grayscale |
| PBM | .pbm | Sharp (native) | 1-bit bitmap |
| PNM | .pnm | Sharp (native) | Umbrella format |
| PAM | .pam | Sharp (native) | Arbitrary map |
| PFM | .pfm | Sharp (native) | Float map |

## Output Formats (13) {#output-formats-13}

| Format | Encoder | Quality Control | Available In |
|--------|---------|----------------|-------------|
| JPEG | Sharp native | 1-100 | All tools |
| PNG | Sharp native | Compression 0-9 | All tools |
| WebP | Sharp native | 1-100 | All tools |
| AVIF | Sharp native | 1-100 | All tools |
| TIFF | Sharp native | 1-100 | Full conversion tools |
| GIF | Sharp native | 1-100 | Full conversion tools |
| JXL | Sharp native | 1-100 | All tools |
| HEIC | heif-enc CLI | 1-100 | Full conversion tools |
| HEIF | heif-enc CLI | 1-100 | Full conversion tools |
| BMP | ImageMagick CLI | Lossless | Convert tool |
| ICO | ImageMagick CLI | Lossless | Convert tool |
| JP2 | opj_compress CLI | Compression ratio | Convert tool |
| QOI | Inline codec | Lossless | Convert tool |

## Video Formats {#video-formats}

Video decoding and encoding are handled by FFmpeg (static build), so every common container and codec is supported on input.

### Input Containers (15) {#input-containers-15}

| Format | Extensions | Typical codecs | Notes |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Most widely used container |
| QuickTime | .mov | H.264, ProRes | Apple capture/editing |
| WebM | .webm | VP8, VP9, AV1 | Royalty-free web format |
| Matroska | .mkv | Any | Flexible open container |
| AVI | .avi | Various | Legacy Microsoft container |
| M4V | .m4v | H.264 | Apple MP4 variant |
| AVCHD | .mts | H.264 | Camcorder recordings |
| BDAV | .m2ts | H.264 | Blu-ray / AVCHD transport stream |
| 3GP | .3gp | H.264, MPEG-4 | Mobile capture |
| Flash Video | .flv | H.264, VP6 | Legacy streaming |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | DVD-era video |
| MPEG-TS | .ts | MPEG-2, H.264 | Broadcast transport stream |
| Ogg | .ogv | Theora | Open Ogg video |

### Output Formats {#output-formats}

| Format | Extension | Video codec | Produced by |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Convert, compress, and most video tools |
| QuickTime | .mov | H.264 | Convert Video |
| WebM | .webm | VP9 | Convert Video |
| GIF | .gif | - | Video to GIF |
| WebP | .webp | - | Video to WebP (animated) |

### Subtitles {#subtitles}

| Format | Extension | Operations |
|--------|-----------|-----------|
| SubRip | .srt | Embed, burn-in, extract, auto-generate |
| WebVTT | .vtt | Embed, burn-in, extract, auto-generate |
| ASS / SSA | .ass | Embed, burn-in (supports styling) |

## Audio Formats {#audio-formats}

Audio is also processed by FFmpeg.

### Input Formats (11) {#input-formats-11}

| Format | Extensions | Compression | Notes |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Lossy | Universal compatibility |
| WAV | .wav | Uncompressed (PCM) | Studio / editing |
| FLAC | .flac | Lossless | Open lossless codec |
| AAC | .aac | Lossy | Raw AAC stream |
| M4A | .m4a | Lossy (AAC) / Lossless (ALAC) | MPEG-4 audio |
| Ogg Vorbis | .ogg | Lossy | Open format |
| Opus | .opus | Lossy | Modern, low-latency |
| WMA | .wma | Lossy | Windows Media Audio |
| AIFF | .aiff | Uncompressed (PCM) | Apple uncompressed |
| AMR | .amr | Lossy | Speech / mobile |
| AC-3 | .ac3 | Lossy | Dolby Digital |

### Output Formats {#output-formats-1}

| Format | Extension | Codec | Produced by |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convert Audio, Extract Audio |
| WAV | .wav | PCM | Convert Audio, Extract Audio |
| FLAC | .flac | FLAC (lossless) | Convert Audio |
| Ogg | .ogg | Vorbis | Convert Audio |
| M4A | .m4a | AAC | Convert Audio, Extract Audio |

## Document Formats {#document-formats}

Document processing uses qpdf, LibreOffice, Ghostscript, Pandoc, and WeasyPrint.

### Input Formats (15) {#input-formats-15}

| Format | Extensions | Engine | Notes |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Core document format |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Text, sheet, presentation |
| Rich Text | .rtf | LibreOffice | Cross-app rich text |
| Plain Text | .txt | LibreOffice, Pandoc | UTF-8 text |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Rendered to PDF |
| EPUB | .epub | Pandoc, LibreOffice | E-book format |

### Output Formats {#output-formats-2}

| Format | Extensions | Produced by |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint to PDF, Markdown to PDF, HTML to PDF |
| PDF/A | .pdf | PDF/A Convert (archival) |
| Word | .docx, .odt, .rtf, .txt | Convert Document, PDF to Word, Markdown to Word |
| Presentation | .pptx, .odp | Convert Presentation |
| Spreadsheet | .xlsx, .ods, .csv | Convert Spreadsheet |
| HTML | .html | Markdown to HTML |
| EPUB | .epub | Convert to EPUB |
| Images | .png, .jpg | PDF to Image |

## File Formats {#file-formats}

Data and archive tools convert between structured formats and bundle files.

| Format | Extensions | Conversions |
|--------|-----------|-------------|
| CSV | .csv | To/from JSON and Excel; split and merge; from XML |
| JSON | .json | To/from CSV, XML, and YAML |
| XML | .xml | To/from JSON; to CSV |
| YAML | .yaml, .yml | To/from JSON |
| Excel | .xlsx | To/from CSV |
| ZIP | .zip | Create archives, extract contents |
