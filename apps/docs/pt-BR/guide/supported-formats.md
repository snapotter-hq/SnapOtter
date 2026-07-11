---
description: "Formatos de arquivo suportados em todas as modalidades - mais de 55 formatos de entrada de imagem, além de vídeo, áudio, PDF e formatos de arquivo."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: ef0623cfcfdc
---

# Formatos Suportados {#supported-formats}

O SnapOtter processa arquivos em cinco modalidades: imagem, vídeo, áudio, PDF e arquivos. Esta página lista todos os formatos suportados.

## Formatos de Imagem {#image-formats}

O SnapOtter suporta mais de 55 formatos de imagem para entrada e 13 formatos para saída.

## Formatos de Entrada {#input-formats}

### Padrões da Web (9) {#web-standards-9}

| Formato | Extensões | Decodificador | Observações |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (nativo) | |
| PNG | .png | Sharp (nativo) | Primeiro quadro do APNG extraído |
| WebP | .webp | Sharp (nativo) | |
| GIF | .gif | Sharp (nativo) | Animado suportado |
| AVIF | .avif | Sharp (nativo) | |
| SVG | .svg | Sharp (librsvg) | Higienizado contra XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Proteção contra bomba de Gzip |
| APNG | .apng | Sharp (nativo) | Apenas o primeiro quadro |
| JPEG XL | .jxl | djxl / ImageMagick | Fallback em duas camadas |

### Profissional (7) {#professional-7}

| Formato | Extensões | Decodificador | Observações |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (nativo) | Múltiplas páginas suportadas |
| PSD | .psd | ImageMagick | Composição achatada |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Rasterização a 300dpi, reforçado quanto à segurança |
| OpenEXR | .exr | ImageMagick | Conversão linear para sRGB |
| Radiance HDR | .hdr | ImageMagick | Conversão linear para sRGB |
| DPX | .dpx | ImageMagick | Conversão log para sRGB |
| Cineon | .cin | ImageMagick | Formato de cinema/VFX |

### Camera RAW (23) {#camera-raw-23}

| Formato | Extensões | Marca de Câmera | Decodificador |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (universal) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (anterior a 2018) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (legado) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (compacta) | exiftool / ImageMagick + LibRaw |

### Formatos Modernos (3) {#modern-formats-3}

| Formato | Extensões | Decodificador | Observações |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Cinema digital, imagem médica |
| QOI | .qoi | Codec TypeScript inline | Desenvolvimento de jogos, sistemas embarcados |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | Fotos de iPhone |

### Legado/Sistema (4) {#legacy-system-4}

| Formato | Extensões | Decodificador | Observações |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Maior camada extraída |
| CUR | .cur | ImageMagick | Cursor do Windows (variante do ICO) |
| TGA | .tga | ImageMagick | Detecção somente por extensão |

### Científico e Jogos (2) {#scientific-and-gaming-2}

| Formato | Extensões | Decodificador | Observações |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomia (padrão da NASA) |
| DDS | .dds | ImageMagick | Texturas de jogos (DirectX) |

### Intercâmbio (6) {#interchange-6}

| Formato | Extensões | Decodificador | Observações |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (nativo) | Pixmap colorido |
| PGM | .pgm | Sharp (nativo) | Escala de cinza |
| PBM | .pbm | Sharp (nativo) | Bitmap de 1 bit |
| PNM | .pnm | Sharp (nativo) | Formato guarda-chuva |
| PAM | .pam | Sharp (nativo) | Mapa arbitrário |
| PFM | .pfm | Sharp (nativo) | Mapa de ponto flutuante |

## Formatos de Saída (13) {#output-formats-13}

| Formato | Codificador | Controle de Qualidade | Disponível Em |
|--------|---------|----------------|-------------|
| JPEG | Sharp nativo | 1-100 | Todas as ferramentas |
| PNG | Sharp nativo | Compressão 0-9 | Todas as ferramentas |
| WebP | Sharp nativo | 1-100 | Todas as ferramentas |
| AVIF | Sharp nativo | 1-100 | Todas as ferramentas |
| TIFF | Sharp nativo | 1-100 | Ferramentas de conversão completa |
| GIF | Sharp nativo | 1-100 | Ferramentas de conversão completa |
| JXL | Sharp nativo | 1-100 | Todas as ferramentas |
| HEIC | CLI heif-enc | 1-100 | Ferramentas de conversão completa |
| HEIF | CLI heif-enc | 1-100 | Ferramentas de conversão completa |
| BMP | CLI ImageMagick | Sem perdas | Ferramenta de conversão |
| ICO | CLI ImageMagick | Sem perdas | Ferramenta de conversão |
| JP2 | CLI opj_compress | Taxa de compressão | Ferramenta de conversão |
| QOI | Codec inline | Sem perdas | Ferramenta de conversão |

## Formatos de Vídeo {#video-formats}

A decodificação e a codificação de vídeo são feitas pelo FFmpeg (build estático), então todo contêiner e codec comum é suportado na entrada.

### Contêineres de Entrada (15) {#input-containers-15}

| Formato | Extensões | Codecs típicos | Observações |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Contêiner mais utilizado |
| QuickTime | .mov | H.264, ProRes | Captura/edição Apple |
| WebM | .webm | VP8, VP9, AV1 | Formato web livre de royalties |
| Matroska | .mkv | Qualquer | Contêiner aberto e flexível |
| AVI | .avi | Vários | Contêiner legado da Microsoft |
| M4V | .m4v | H.264 | Variante MP4 da Apple |
| AVCHD | .mts | H.264 | Gravações de filmadora |
| BDAV | .m2ts | H.264 | Fluxo de transporte Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | Captura móvel |
| Flash Video | .flv | H.264, VP6 | Streaming legado |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Vídeo da era do DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | Fluxo de transporte de broadcast |
| Ogg | .ogv | Theora | Vídeo Ogg aberto |

### Formatos de Saída {#output-formats}

| Formato | Extensão | Codec de vídeo | Produzido por |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Converter, comprimir e a maioria das ferramentas de vídeo |
| QuickTime | .mov | H.264 | Converter Vídeo |
| WebM | .webm | VP9 | Converter Vídeo |
| GIF | .gif | - | Vídeo para GIF |
| WebP | .webp | - | Vídeo para WebP (animado) |

### Legendas {#subtitles}

| Formato | Extensão | Operações |
|--------|-----------|-----------|
| SubRip | .srt | Incorporar, gravar na imagem, extrair, gerar automaticamente |
| WebVTT | .vtt | Incorporar, gravar na imagem, extrair, gerar automaticamente |
| ASS / SSA | .ass | Incorporar, gravar na imagem (suporta estilização) |

## Formatos de Áudio {#audio-formats}

O áudio também é processado pelo FFmpeg.

### Formatos de Entrada (11) {#input-formats-11}

| Formato | Extensões | Compressão | Observações |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Com perdas | Compatibilidade universal |
| WAV | .wav | Sem compressão (PCM) | Estúdio / edição |
| FLAC | .flac | Sem perdas | Codec aberto sem perdas |
| AAC | .aac | Com perdas | Fluxo AAC bruto |
| M4A | .m4a | Com perdas (AAC) / Sem perdas (ALAC) | Áudio MPEG-4 |
| Ogg Vorbis | .ogg | Com perdas | Formato aberto |
| Opus | .opus | Com perdas | Moderno, baixa latência |
| WMA | .wma | Com perdas | Windows Media Audio |
| AIFF | .aiff | Sem compressão (PCM) | Sem compressão da Apple |
| AMR | .amr | Com perdas | Fala / dispositivos móveis |
| AC-3 | .ac3 | Com perdas | Dolby Digital |

### Formatos de Saída {#output-formats-1}

| Formato | Extensão | Codec | Produzido por |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Converter Áudio, Extrair Áudio |
| WAV | .wav | PCM | Converter Áudio, Extrair Áudio |
| FLAC | .flac | FLAC (sem perdas) | Converter Áudio |
| Ogg | .ogg | Vorbis | Converter Áudio |
| M4A | .m4a | AAC | Converter Áudio, Extrair Áudio |

## Formatos de Documento {#document-formats}

O processamento de documentos usa qpdf, LibreOffice, Ghostscript, Pandoc e WeasyPrint.

### Formatos de Entrada (15) {#input-formats-15}

| Formato | Extensões | Motor | Observações |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Formato de documento principal |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Texto, planilha, apresentação |
| Rich Text | .rtf | LibreOffice | Rich text multiaplicativo |
| Texto Simples | .txt | LibreOffice, Pandoc | Texto UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Renderizado para PDF |
| EPUB | .epub | Pandoc, LibreOffice | Formato de e-book |

### Formatos de Saída {#output-formats-2}

| Formato | Extensões | Produzido por |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint para PDF, Markdown para PDF, HTML para PDF |
| PDF/A | .pdf | Converter para PDF/A (arquivamento) |
| Word | .docx, .odt, .rtf, .txt | Converter Documento, PDF para Word, Markdown para Word |
| Apresentação | .pptx, .odp | Converter Apresentação |
| Planilha | .xlsx, .ods, .csv | Converter Planilha |
| HTML | .html | Markdown para HTML |
| EPUB | .epub | Converter para EPUB |
| Imagens | .png, .jpg | PDF para Imagem |

## Formatos de Arquivo {#file-formats}

As ferramentas de dados e arquivamento convertem entre formatos estruturados e empacotam arquivos.

| Formato | Extensões | Conversões |
|--------|-----------|-------------|
| CSV | .csv | Para/de JSON e Excel; dividir e mesclar; de XML |
| JSON | .json | Para/de CSV, XML e YAML |
| XML | .xml | Para/de JSON; para CSV |
| YAML | .yaml, .yml | Para/de JSON |
| Excel | .xlsx | Para/de CSV |
| ZIP | .zip | Criar arquivos compactados, extrair conteúdo |
