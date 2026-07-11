---
description: "Formati di file supportati in tutte le modalità: oltre 55 formati di input immagine, video, audio, PDF e file."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: c6576f5d623c
---

# Formati supportati {#supported-formats}

SnapOtter elabora file in cinque modalità: immagine, video, audio, PDF e file. Questa pagina elenca tutti i formati supportati.

## Formati immagine {#image-formats}

SnapOtter supporta oltre 55 formati immagine in input e 13 formati in output.

## Formati di input {#input-formats}

### Standard web (9) {#web-standards-9}

| Formato | Estensioni | Decoder | Note |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (nativo) | |
| PNG | .png | Sharp (nativo) | Primo frame APNG estratto |
| WebP | .webp | Sharp (nativo) | |
| GIF | .gif | Sharp (nativo) | Animazioni supportate |
| AVIF | .avif | Sharp (nativo) | |
| SVG | .svg | Sharp (librsvg) | Sanitizzato contro XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Protezione contro gzip bomb |
| APNG | .apng | Sharp (nativo) | Solo primo frame |
| JPEG XL | .jxl | djxl / ImageMagick | Fallback a due livelli |

### Professionali (7) {#professional-7}

| Formato | Estensioni | Decoder | Note |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (nativo) | Multipagina supportato |
| PSD | .psd | ImageMagick | Composito appiattito |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Rasterizzazione a 300dpi, con sicurezza rafforzata |
| OpenEXR | .exr | ImageMagick | Conversione da lineare a sRGB |
| Radiance HDR | .hdr | ImageMagick | Conversione da lineare a sRGB |
| DPX | .dpx | ImageMagick | Conversione da logaritmico a sRGB |
| Cineon | .cin | ImageMagick | Formato Film/VFX |

### Camera RAW (23) {#camera-raw-23}

| Formato | Estensioni | Marca fotocamera | Decoder |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (universale) | exiftool / ImageMagick + LibRaw |
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
| PTX | .ptx | Pentax (compatta) | exiftool / ImageMagick + LibRaw |

### Formati moderni (3) {#modern-formats-3}

| Formato | Estensioni | Decoder | Note |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Cinema digitale, imaging medico |
| QOI | .qoi | Codec TypeScript inline | Sviluppo giochi, sistemi embedded |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | Foto iPhone |

### Legacy/di sistema (4) {#legacy-system-4}

| Formato | Estensioni | Decoder | Note |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Estratto il layer più grande |
| CUR | .cur | ImageMagick | Cursore Windows (variante ICO) |
| TGA | .tga | ImageMagick | Rilevamento solo per estensione |

### Scientifici e gaming (2) {#scientific-and-gaming-2}

| Formato | Estensioni | Decoder | Note |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomia (standard NASA) |
| DDS | .dds | ImageMagick | Texture di gioco (DirectX) |

### Interscambio (6) {#interchange-6}

| Formato | Estensioni | Decoder | Note |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (nativo) | Pixmap a colori |
| PGM | .pgm | Sharp (nativo) | Scala di grigi |
| PBM | .pbm | Sharp (nativo) | Bitmap a 1 bit |
| PNM | .pnm | Sharp (nativo) | Formato ombrello |
| PAM | .pam | Sharp (nativo) | Mappa arbitraria |
| PFM | .pfm | Sharp (nativo) | Mappa float |

## Formati di output (13) {#output-formats-13}

| Formato | Encoder | Controllo qualità | Disponibile in |
|--------|---------|----------------|-------------|
| JPEG | Sharp nativo | 1-100 | Tutti gli strumenti |
| PNG | Sharp nativo | Compressione 0-9 | Tutti gli strumenti |
| WebP | Sharp nativo | 1-100 | Tutti gli strumenti |
| AVIF | Sharp nativo | 1-100 | Tutti gli strumenti |
| TIFF | Sharp nativo | 1-100 | Strumenti di conversione completa |
| GIF | Sharp nativo | 1-100 | Strumenti di conversione completa |
| JXL | Sharp nativo | 1-100 | Tutti gli strumenti |
| HEIC | heif-enc CLI | 1-100 | Strumenti di conversione completa |
| HEIF | heif-enc CLI | 1-100 | Strumenti di conversione completa |
| BMP | ImageMagick CLI | Senza perdita | Strumento di conversione |
| ICO | ImageMagick CLI | Senza perdita | Strumento di conversione |
| JP2 | opj_compress CLI | Rapporto di compressione | Strumento di conversione |
| QOI | Codec inline | Senza perdita | Strumento di conversione |

## Formati video {#video-formats}

La decodifica e la codifica video sono gestite da FFmpeg (build statica), quindi ogni container e codec comune è supportato in input.

### Container di input (15) {#input-containers-15}

| Formato | Estensioni | Codec tipici | Note |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Il container più usato |
| QuickTime | .mov | H.264, ProRes | Cattura/editing Apple |
| WebM | .webm | VP8, VP9, AV1 | Formato web royalty-free |
| Matroska | .mkv | Qualsiasi | Container aperto e flessibile |
| AVI | .avi | Vari | Container Microsoft legacy |
| M4V | .m4v | H.264 | Variante MP4 di Apple |
| AVCHD | .mts | H.264 | Registrazioni da videocamera |
| BDAV | .m2ts | H.264 | Transport stream Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | Cattura da mobile |
| Flash Video | .flv | H.264, VP6 | Streaming legacy |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Video dell'era DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | Transport stream broadcast |
| Ogg | .ogv | Theora | Video Ogg aperto |

### Formati di output {#output-formats}

| Formato | Estensione | Codec video | Prodotto da |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Converti, comprimi e la maggior parte degli strumenti video |
| QuickTime | .mov | H.264 | Converti video |
| WebM | .webm | VP9 | Converti video |
| GIF | .gif | - | Da video a GIF |
| WebP | .webp | - | Da video a WebP (animato) |

### Sottotitoli {#subtitles}

| Formato | Estensione | Operazioni |
|--------|-----------|-----------|
| SubRip | .srt | Incorpora, applica in sovrimpressione, estrai, genera automaticamente |
| WebVTT | .vtt | Incorpora, applica in sovrimpressione, estrai, genera automaticamente |
| ASS / SSA | .ass | Incorpora, applica in sovrimpressione (supporta lo stile) |

## Formati audio {#audio-formats}

Anche l'audio è elaborato da FFmpeg.

### Formati di input (11) {#input-formats-11}

| Formato | Estensioni | Compressione | Note |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Con perdita | Compatibilità universale |
| WAV | .wav | Non compresso (PCM) | Studio / editing |
| FLAC | .flac | Senza perdita | Codec lossless aperto |
| AAC | .aac | Con perdita | Stream AAC grezzo |
| M4A | .m4a | Con perdita (AAC) / Senza perdita (ALAC) | Audio MPEG-4 |
| Ogg Vorbis | .ogg | Con perdita | Formato aperto |
| Opus | .opus | Con perdita | Moderno, a bassa latenza |
| WMA | .wma | Con perdita | Windows Media Audio |
| AIFF | .aiff | Non compresso (PCM) | Non compresso Apple |
| AMR | .amr | Con perdita | Voce / mobile |
| AC-3 | .ac3 | Con perdita | Dolby Digital |

### Formati di output {#output-formats-1}

| Formato | Estensione | Codec | Prodotto da |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Converti audio, Estrai audio |
| WAV | .wav | PCM | Converti audio, Estrai audio |
| FLAC | .flac | FLAC (senza perdita) | Converti audio |
| Ogg | .ogg | Vorbis | Converti audio |
| M4A | .m4a | AAC | Converti audio, Estrai audio |

## Formati documento {#document-formats}

L'elaborazione dei documenti usa qpdf, LibreOffice, Ghostscript, Pandoc e WeasyPrint.

### Formati di input (15) {#input-formats-15}

| Formato | Estensioni | Motore | Note |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Formato documento principale |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Testo, foglio, presentazione |
| Rich Text | .rtf | LibreOffice | Rich text multi-app |
| Testo semplice | .txt | LibreOffice, Pandoc | Testo UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Renderizzato in PDF |
| EPUB | .epub | Pandoc, LibreOffice | Formato e-book |

### Formati di output {#output-formats-2}

| Formato | Estensioni | Prodotto da |
|--------|-----------|-------------|
| PDF | .pdf | Da Word/Excel/PowerPoint a PDF, da Markdown a PDF, da HTML a PDF |
| PDF/A | .pdf | Converti in PDF/A (archiviazione) |
| Word | .docx, .odt, .rtf, .txt | Converti documento, da PDF a Word, da Markdown a Word |
| Presentazione | .pptx, .odp | Converti presentazione |
| Foglio di calcolo | .xlsx, .ods, .csv | Converti foglio di calcolo |
| HTML | .html | Da Markdown a HTML |
| EPUB | .epub | Converti in EPUB |
| Immagini | .png, .jpg | Da PDF a immagine |

## Formati file {#file-formats}

Gli strumenti per dati e archivi convertono tra formati strutturati e raggruppano file.

| Formato | Estensioni | Conversioni |
|--------|-----------|-------------|
| CSV | .csv | Da/verso JSON ed Excel; dividi e unisci; da XML |
| JSON | .json | Da/verso CSV, XML e YAML |
| XML | .xml | Da/verso JSON; verso CSV |
| YAML | .yaml, .yml | Da/verso JSON |
| Excel | .xlsx | Da/verso CSV |
| ZIP | .zip | Crea archivi, estrai contenuti |
