---
description: Supported file formats across all modalities - 55+ image input formats, video, audio, document, and data formats.
---

# Supported Formats

SnapOtter processes files across five modalities: image, video, audio, document, and data. This page lists all supported formats.

## Image Formats

SnapOtter supports 55+ image formats for input and 13 formats for output.

## Input Formats

### Web Standards (9)

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

### Professional (7)

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | Multi-page supported |
| PSD | .psd | ImageMagick | Flattened composite |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | 300dpi rasterization, security hardened |
| OpenEXR | .exr | ImageMagick | Linear-to-sRGB conversion |
| Radiance HDR | .hdr | ImageMagick | Linear-to-sRGB conversion |
| DPX | .dpx | ImageMagick | Log-to-sRGB conversion |
| Cineon | .cin | ImageMagick | Film/VFX format |

### Camera RAW (23)

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

### Modern Formats (3)

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Digital cinema, medical imaging |
| QOI | .qoi | Inline TypeScript codec | Game dev, embedded systems |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhone photos |

### Legacy/System (4)

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Largest layer extracted |
| CUR | .cur | ImageMagick | Windows cursor (ICO variant) |
| TGA | .tga | ImageMagick | Extension-only detection |

### Scientific and Gaming (2)

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomy (NASA standard) |
| DDS | .dds | ImageMagick | Game textures (DirectX) |

### Interchange (6)

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | Color pixmap |
| PGM | .pgm | Sharp (native) | Grayscale |
| PBM | .pbm | Sharp (native) | 1-bit bitmap |
| PNM | .pnm | Sharp (native) | Umbrella format |
| PAM | .pam | Sharp (native) | Arbitrary map |
| PFM | .pfm | Sharp (native) | Float map |

## Output Formats (13)

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

## Video Formats

Video processing is handled by FFmpeg (static build). All common containers and codecs are supported.

| Type | Formats |
|------|---------|
| **Input** | MP4, MOV, WebM, MKV, AVI, M4V, MTS, M2TS, 3GP, FLV, WMV, MPG, MPEG, TS, OGV |
| **Output** | MP4 (H.264/H.265), WebM (VP9), MKV, AVI, MOV, GIF, WebP |

Subtitle formats supported for embedding and burning: SRT, VTT, ASS.

## Audio Formats

Audio processing is also handled by FFmpeg.

| Type | Formats |
|------|---------|
| **Input** | MP3, WAV, FLAC, AAC, M4A, OGG, OPUS, WMA, AIFF, AMR, AC3 |
| **Output** | MP3, WAV, FLAC, AAC, M4A, OGG, OPUS |

## Document Formats

Document processing uses qpdf, LibreOffice, Ghostscript, Pandoc, and WeasyPrint.

| Type | Formats |
|------|---------|
| **Input** | PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT, ODT, ODS, ODP, RTF, TXT, Markdown, HTML, EPUB |
| **Output** | PDF, PDF/A, DOCX, HTML, EPUB, images (via PDF to Image) |

## File Formats

| Type | Formats |
|------|---------|
| **Input/Output** | CSV, JSON, XML, YAML, ZIP, Excel (XLSX) |
