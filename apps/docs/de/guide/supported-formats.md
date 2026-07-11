---
description: "Unterstützte Dateiformate über alle Modalitäten hinweg - 55+ Bild-Eingabeformate, Video, Audio, PDF und Dateiformate."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 3b6d27434067
---

# Unterstützte Formate {#supported-formats}

SnapOtter verarbeitet Dateien über fünf Modalitäten hinweg: Bild, Video, Audio, PDF und Dateien. Diese Seite listet alle unterstützten Formate auf.

## Bildformate {#image-formats}

SnapOtter unterstützt 55+ Bildformate für die Eingabe und 13 Formate für die Ausgabe.

## Eingabeformate {#input-formats}

### Web-Standards (9) {#web-standards-9}

| Format | Erweiterungen | Decoder | Hinweise |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (nativ) | |
| PNG | .png | Sharp (nativ) | APNG erstes Bild extrahiert |
| WebP | .webp | Sharp (nativ) | |
| GIF | .gif | Sharp (nativ) | Animiert unterstützt |
| AVIF | .avif | Sharp (nativ) | |
| SVG | .svg | Sharp (librsvg) | Bereinigt gegen XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Gzip-Bomben-Schutz |
| APNG | .apng | Sharp (nativ) | Nur erstes Bild |
| JPEG XL | .jxl | djxl / ImageMagick | Zweistufiger Fallback |

### Professionell (7) {#professional-7}

| Format | Erweiterungen | Decoder | Hinweise |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (nativ) | Mehrseitig unterstützt |
| PSD | .psd | ImageMagick | Zusammengeführtes Komposit |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Rasterung mit 300dpi, sicherheitsgehärtet |
| OpenEXR | .exr | ImageMagick | Linear-zu-sRGB-Konvertierung |
| Radiance HDR | .hdr | ImageMagick | Linear-zu-sRGB-Konvertierung |
| DPX | .dpx | ImageMagick | Log-zu-sRGB-Konvertierung |
| Cineon | .cin | ImageMagick | Film/VFX-Format |

### Kamera-RAW (23) {#camera-raw-23}

| Format | Erweiterungen | Kameramarke | Decoder |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (universell) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (vor 2018) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (Legacy) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (kompakt) | exiftool / ImageMagick + LibRaw |

### Moderne Formate (3) {#modern-formats-3}

| Format | Erweiterungen | Decoder | Hinweise |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Digital Cinema, medizinische Bildgebung |
| QOI | .qoi | Inline-TypeScript-Codec | Spieleentwicklung, eingebettete Systeme |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhone-Fotos |

### Legacy/System (4) {#legacy-system-4}

| Format | Erweiterungen | Decoder | Hinweise |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Größte Ebene extrahiert |
| CUR | .cur | ImageMagick | Windows-Cursor (ICO-Variante) |
| TGA | .tga | ImageMagick | Erkennung nur über Erweiterung |

### Wissenschaft und Gaming (2) {#scientific-and-gaming-2}

| Format | Erweiterungen | Decoder | Hinweise |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomie (NASA-Standard) |
| DDS | .dds | ImageMagick | Spieletexturen (DirectX) |

### Interchange (6) {#interchange-6}

| Format | Erweiterungen | Decoder | Hinweise |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (nativ) | Farb-Pixmap |
| PGM | .pgm | Sharp (nativ) | Graustufen |
| PBM | .pbm | Sharp (nativ) | 1-Bit-Bitmap |
| PNM | .pnm | Sharp (nativ) | Sammelformat |
| PAM | .pam | Sharp (nativ) | Beliebige Map |
| PFM | .pfm | Sharp (nativ) | Float-Map |

## Ausgabeformate (13) {#output-formats-13}

| Format | Encoder | Qualitätssteuerung | Verfügbar in |
|--------|---------|----------------|-------------|
| JPEG | Sharp nativ | 1-100 | Allen Werkzeugen |
| PNG | Sharp nativ | Kompression 0-9 | Allen Werkzeugen |
| WebP | Sharp nativ | 1-100 | Allen Werkzeugen |
| AVIF | Sharp nativ | 1-100 | Allen Werkzeugen |
| TIFF | Sharp nativ | 1-100 | Vollständige Konvertierungswerkzeuge |
| GIF | Sharp nativ | 1-100 | Vollständige Konvertierungswerkzeuge |
| JXL | Sharp nativ | 1-100 | Allen Werkzeugen |
| HEIC | heif-enc CLI | 1-100 | Vollständige Konvertierungswerkzeuge |
| HEIF | heif-enc CLI | 1-100 | Vollständige Konvertierungswerkzeuge |
| BMP | ImageMagick CLI | Verlustfrei | Konvertierungswerkzeug |
| ICO | ImageMagick CLI | Verlustfrei | Konvertierungswerkzeug |
| JP2 | opj_compress CLI | Kompressionsverhältnis | Konvertierungswerkzeug |
| QOI | Inline-Codec | Verlustfrei | Konvertierungswerkzeug |

## Videoformate {#video-formats}

Die Video-Dekodierung und -Kodierung werden von FFmpeg (statischer Build) übernommen, sodass jeder gängige Container und Codec bei der Eingabe unterstützt wird.

### Eingabe-Container (15) {#input-containers-15}

| Format | Erweiterungen | Typische Codecs | Hinweise |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Am weitesten verbreiteter Container |
| QuickTime | .mov | H.264, ProRes | Apple-Aufnahme/-Bearbeitung |
| WebM | .webm | VP8, VP9, AV1 | Lizenzfreies Web-Format |
| Matroska | .mkv | Beliebig | Flexibler offener Container |
| AVI | .avi | Verschiedene | Legacy-Microsoft-Container |
| M4V | .m4v | H.264 | Apple-MP4-Variante |
| AVCHD | .mts | H.264 | Camcorder-Aufnahmen |
| BDAV | .m2ts | H.264 | Blu-ray / AVCHD-Transportstream |
| 3GP | .3gp | H.264, MPEG-4 | Mobile Aufnahme |
| Flash Video | .flv | H.264, VP6 | Legacy-Streaming |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Video aus der DVD-Ära |
| MPEG-TS | .ts | MPEG-2, H.264 | Broadcast-Transportstream |
| Ogg | .ogv | Theora | Offenes Ogg-Video |

### Ausgabeformate {#output-formats}

| Format | Erweiterung | Video-Codec | Erzeugt von |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Konvertieren, Komprimieren und den meisten Video-Werkzeugen |
| QuickTime | .mov | H.264 | Video konvertieren |
| WebM | .webm | VP9 | Video konvertieren |
| GIF | .gif | - | Video zu GIF |
| WebP | .webp | - | Video zu WebP (animiert) |

### Untertitel {#subtitles}

| Format | Erweiterung | Operationen |
|--------|-----------|-----------|
| SubRip | .srt | Einbetten, Einbrennen, Extrahieren, Auto-Generieren |
| WebVTT | .vtt | Einbetten, Einbrennen, Extrahieren, Auto-Generieren |
| ASS / SSA | .ass | Einbetten, Einbrennen (unterstützt Styling) |

## Audioformate {#audio-formats}

Audio wird ebenfalls von FFmpeg verarbeitet.

### Eingabeformate (11) {#input-formats-11}

| Format | Erweiterungen | Kompression | Hinweise |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Verlustbehaftet | Universelle Kompatibilität |
| WAV | .wav | Unkomprimiert (PCM) | Studio / Bearbeitung |
| FLAC | .flac | Verlustfrei | Offener verlustfreier Codec |
| AAC | .aac | Verlustbehaftet | Roher AAC-Stream |
| M4A | .m4a | Verlustbehaftet (AAC) / Verlustfrei (ALAC) | MPEG-4-Audio |
| Ogg Vorbis | .ogg | Verlustbehaftet | Offenes Format |
| Opus | .opus | Verlustbehaftet | Modern, geringe Latenz |
| WMA | .wma | Verlustbehaftet | Windows Media Audio |
| AIFF | .aiff | Unkomprimiert (PCM) | Apple unkomprimiert |
| AMR | .amr | Verlustbehaftet | Sprache / Mobil |
| AC-3 | .ac3 | Verlustbehaftet | Dolby Digital |

### Ausgabeformate {#output-formats-1}

| Format | Erweiterung | Codec | Erzeugt von |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Audio konvertieren, Audio extrahieren |
| WAV | .wav | PCM | Audio konvertieren, Audio extrahieren |
| FLAC | .flac | FLAC (verlustfrei) | Audio konvertieren |
| Ogg | .ogg | Vorbis | Audio konvertieren |
| M4A | .m4a | AAC | Audio konvertieren, Audio extrahieren |

## Dokumentformate {#document-formats}

Die Dokumentverarbeitung verwendet qpdf, LibreOffice, Ghostscript, Pandoc und WeasyPrint.

### Eingabeformate (15) {#input-formats-15}

| Format | Erweiterungen | Engine | Hinweise |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Kern-Dokumentformat |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Text, Tabelle, Präsentation |
| Rich Text | .rtf | LibreOffice | App-übergreifender Rich Text |
| Plain Text | .txt | LibreOffice, Pandoc | UTF-8-Text |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Als PDF gerendert |
| EPUB | .epub | Pandoc, LibreOffice | E-Book-Format |

### Ausgabeformate {#output-formats-2}

| Format | Erweiterungen | Erzeugt von |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint zu PDF, Markdown zu PDF, HTML zu PDF |
| PDF/A | .pdf | PDF/A-Konvertierung (Archivierung) |
| Word | .docx, .odt, .rtf, .txt | Dokument konvertieren, PDF zu Word, Markdown zu Word |
| Präsentation | .pptx, .odp | Präsentation konvertieren |
| Tabelle | .xlsx, .ods, .csv | Tabelle konvertieren |
| HTML | .html | Markdown zu HTML |
| EPUB | .epub | Zu EPUB konvertieren |
| Bilder | .png, .jpg | PDF zu Bild |

## Dateiformate {#file-formats}

Daten- und Archivwerkzeuge konvertieren zwischen strukturierten Formaten und bündeln Dateien.

| Format | Erweiterungen | Konvertierungen |
|--------|-----------|-------------|
| CSV | .csv | Nach/von JSON und Excel; teilen und zusammenführen; aus XML |
| JSON | .json | Nach/von CSV, XML und YAML |
| XML | .xml | Nach/von JSON; nach CSV |
| YAML | .yaml, .yml | Nach/von JSON |
| Excel | .xlsx | Nach/von CSV |
| ZIP | .zip | Archive erstellen, Inhalte extrahieren |
