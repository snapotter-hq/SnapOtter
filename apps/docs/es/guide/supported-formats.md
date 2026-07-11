---
description: "Formatos de archivo admitidos en todas las modalidades: más de 55 formatos de entrada de imagen, vídeo, audio, PDF y archivos."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 05d34254d25e
---

# Formatos admitidos {#supported-formats}

SnapOtter procesa archivos en cinco modalidades: imagen, vídeo, audio, PDF y archivos. Esta página enumera todos los formatos admitidos.

## Formatos de imagen {#image-formats}

SnapOtter admite más de 55 formatos de imagen para entrada y 13 formatos para salida.

## Formatos de entrada {#input-formats}

### Estándares web (9) {#web-standards-9}

| Formato | Extensiones | Decodificador | Notas |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (nativo) | |
| PNG | .png | Sharp (nativo) | Se extrae el primer fotograma de APNG |
| WebP | .webp | Sharp (nativo) | |
| GIF | .gif | Sharp (nativo) | Animado admitido |
| AVIF | .avif | Sharp (nativo) | |
| SVG | .svg | Sharp (librsvg) | Saneado frente a XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Protección contra bomba gzip |
| APNG | .apng | Sharp (nativo) | Solo el primer fotograma |
| JPEG XL | .jxl | djxl / ImageMagick | Reserva en dos niveles |

### Profesionales (7) {#professional-7}

| Formato | Extensiones | Decodificador | Notas |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (nativo) | Multipágina admitido |
| PSD | .psd | ImageMagick | Composición aplanada |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Rasterización a 300 ppp, reforzado en seguridad |
| OpenEXR | .exr | ImageMagick | Conversión lineal a sRGB |
| Radiance HDR | .hdr | ImageMagick | Conversión lineal a sRGB |
| DPX | .dpx | ImageMagick | Conversión logarítmica a sRGB |
| Cineon | .cin | ImageMagick | Formato de cine/VFX |

### RAW de cámara (23) {#camera-raw-23}

| Formato | Extensiones | Marca de cámara | Decodificador |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (universal) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (antes de 2018) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (heredado) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (compacta) | exiftool / ImageMagick + LibRaw |

### Formatos modernos (3) {#modern-formats-3}

| Formato | Extensiones | Decodificador | Notas |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Cine digital, imagen médica |
| QOI | .qoi | Códec TypeScript en línea | Desarrollo de juegos, sistemas embebidos |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | Fotos de iPhone |

### Heredados/de sistema (4) {#legacy-system-4}

| Formato | Extensiones | Decodificador | Notas |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Se extrae la capa más grande |
| CUR | .cur | ImageMagick | Cursor de Windows (variante de ICO) |
| TGA | .tga | ImageMagick | Detección solo por extensión |

### Científicos y de videojuegos (2) {#scientific-and-gaming-2}

| Formato | Extensiones | Decodificador | Notas |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomía (estándar de la NASA) |
| DDS | .dds | ImageMagick | Texturas de juegos (DirectX) |

### Intercambio (6) {#interchange-6}

| Formato | Extensiones | Decodificador | Notas |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (nativo) | Pixmap de color |
| PGM | .pgm | Sharp (nativo) | Escala de grises |
| PBM | .pbm | Sharp (nativo) | Mapa de bits de 1 bit |
| PNM | .pnm | Sharp (nativo) | Formato paraguas |
| PAM | .pam | Sharp (nativo) | Mapa arbitrario |
| PFM | .pfm | Sharp (nativo) | Mapa de coma flotante |

## Formatos de salida (13) {#output-formats-13}

| Formato | Codificador | Control de calidad | Disponible en |
|--------|---------|----------------|-------------|
| JPEG | Sharp nativo | 1-100 | Todas las herramientas |
| PNG | Sharp nativo | Compresión 0-9 | Todas las herramientas |
| WebP | Sharp nativo | 1-100 | Todas las herramientas |
| AVIF | Sharp nativo | 1-100 | Todas las herramientas |
| TIFF | Sharp nativo | 1-100 | Herramientas de conversión completa |
| GIF | Sharp nativo | 1-100 | Herramientas de conversión completa |
| JXL | Sharp nativo | 1-100 | Todas las herramientas |
| HEIC | CLI heif-enc | 1-100 | Herramientas de conversión completa |
| HEIF | CLI heif-enc | 1-100 | Herramientas de conversión completa |
| BMP | CLI ImageMagick | Sin pérdidas | Herramienta de conversión |
| ICO | CLI ImageMagick | Sin pérdidas | Herramienta de conversión |
| JP2 | CLI opj_compress | Ratio de compresión | Herramienta de conversión |
| QOI | Códec en línea | Sin pérdidas | Herramienta de conversión |

## Formatos de vídeo {#video-formats}

La decodificación y codificación de vídeo las gestiona FFmpeg (compilación estática), así que se admite en la entrada cualquier contenedor y códec común.

### Contenedores de entrada (15) {#input-containers-15}

| Formato | Extensiones | Códecs típicos | Notas |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | El contenedor más usado |
| QuickTime | .mov | H.264, ProRes | Captura/edición de Apple |
| WebM | .webm | VP8, VP9, AV1 | Formato web libre de regalías |
| Matroska | .mkv | Cualquiera | Contenedor abierto y flexible |
| AVI | .avi | Varios | Contenedor heredado de Microsoft |
| M4V | .m4v | H.264 | Variante de MP4 de Apple |
| AVCHD | .mts | H.264 | Grabaciones de videocámara |
| BDAV | .m2ts | H.264 | Flujo de transporte de Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | Captura móvil |
| Flash Video | .flv | H.264, VP6 | Streaming heredado |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Vídeo de la era del DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | Flujo de transporte de difusión |
| Ogg | .ogv | Theora | Vídeo Ogg abierto |

### Formatos de salida {#output-formats}

| Formato | Extensión | Códec de vídeo | Producido por |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Convertir, comprimir y la mayoría de herramientas de vídeo |
| QuickTime | .mov | H.264 | Convertir vídeo |
| WebM | .webm | VP9 | Convertir vídeo |
| GIF | .gif | - | Vídeo a GIF |
| WebP | .webp | - | Vídeo a WebP (animado) |

### Subtítulos {#subtitles}

| Formato | Extensión | Operaciones |
|--------|-----------|-----------|
| SubRip | .srt | Incrustar, quemar, extraer, generar automáticamente |
| WebVTT | .vtt | Incrustar, quemar, extraer, generar automáticamente |
| ASS / SSA | .ass | Incrustar, quemar (admite estilos) |

## Formatos de audio {#audio-formats}

El audio también se procesa con FFmpeg.

### Formatos de entrada (11) {#input-formats-11}

| Formato | Extensiones | Compresión | Notas |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Con pérdidas | Compatibilidad universal |
| WAV | .wav | Sin comprimir (PCM) | Estudio / edición |
| FLAC | .flac | Sin pérdidas | Códec abierto sin pérdidas |
| AAC | .aac | Con pérdidas | Flujo AAC en bruto |
| M4A | .m4a | Con pérdidas (AAC) / Sin pérdidas (ALAC) | Audio MPEG-4 |
| Ogg Vorbis | .ogg | Con pérdidas | Formato abierto |
| Opus | .opus | Con pérdidas | Moderno, de baja latencia |
| WMA | .wma | Con pérdidas | Windows Media Audio |
| AIFF | .aiff | Sin comprimir (PCM) | Sin comprimir de Apple |
| AMR | .amr | Con pérdidas | Voz / móvil |
| AC-3 | .ac3 | Con pérdidas | Dolby Digital |

### Formatos de salida {#output-formats-1}

| Formato | Extensión | Códec | Producido por |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convertir audio, Extraer audio |
| WAV | .wav | PCM | Convertir audio, Extraer audio |
| FLAC | .flac | FLAC (sin pérdidas) | Convertir audio |
| Ogg | .ogg | Vorbis | Convertir audio |
| M4A | .m4a | AAC | Convertir audio, Extraer audio |

## Formatos de documento {#document-formats}

El procesamiento de documentos usa qpdf, LibreOffice, Ghostscript, Pandoc y WeasyPrint.

### Formatos de entrada (15) {#input-formats-15}

| Formato | Extensiones | Motor | Notas |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Formato de documento principal |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Texto, hoja, presentación |
| Rich Text | .rtf | LibreOffice | Texto enriquecido multiaplicación |
| Texto plano | .txt | LibreOffice, Pandoc | Texto UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Renderizado a PDF |
| EPUB | .epub | Pandoc, LibreOffice | Formato de libro electrónico |

### Formatos de salida {#output-formats-2}

| Formato | Extensiones | Producido por |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint a PDF, Markdown a PDF, HTML a PDF |
| PDF/A | .pdf | Conversión a PDF/A (archivo) |
| Word | .docx, .odt, .rtf, .txt | Convertir documento, PDF a Word, Markdown a Word |
| Presentación | .pptx, .odp | Convertir presentación |
| Hoja de cálculo | .xlsx, .ods, .csv | Convertir hoja de cálculo |
| HTML | .html | Markdown a HTML |
| EPUB | .epub | Convertir a EPUB |
| Imágenes | .png, .jpg | PDF a imagen |

## Formatos de archivo {#file-formats}

Las herramientas de datos y archivado convierten entre formatos estructurados y empaquetan archivos.

| Formato | Extensiones | Conversiones |
|--------|-----------|-------------|
| CSV | .csv | Hacia/desde JSON y Excel; dividir y combinar; desde XML |
| JSON | .json | Hacia/desde CSV, XML y YAML |
| XML | .xml | Hacia/desde JSON; a CSV |
| YAML | .yaml, .yml | Hacia/desde JSON |
| Excel | .xlsx | Hacia/desde CSV |
| ZIP | .zip | Crear archivos, extraer contenido |
