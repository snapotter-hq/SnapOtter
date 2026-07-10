---
description: "Formats de fichiers pris en charge dans toutes les modalités - plus de 55 formats d'image en entrée, vidéo, audio, PDF et formats de fichiers."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 36025f0773ef
---

# Formats pris en charge {#supported-formats}

SnapOtter traite les fichiers selon cinq modalités : image, vidéo, audio, PDF et fichiers. Cette page liste tous les formats pris en charge.

## Formats d'image {#image-formats}

SnapOtter prend en charge plus de 55 formats d'image en entrée et 13 formats en sortie.

## Formats d'entrée {#input-formats}

### Standards du web (9) {#web-standards-9}

| Format | Extensions | Décodeur | Notes |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (natif) | |
| PNG | .png | Sharp (natif) | Première image APNG extraite |
| WebP | .webp | Sharp (natif) | |
| GIF | .gif | Sharp (natif) | Animé pris en charge |
| AVIF | .avif | Sharp (natif) | |
| SVG | .svg | Sharp (librsvg) | Nettoyé contre XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Protection contre les bombes gzip |
| APNG | .apng | Sharp (natif) | Première image uniquement |
| JPEG XL | .jxl | djxl / ImageMagick | Repli à deux niveaux |

### Professionnels (7) {#professional-7}

| Format | Extensions | Décodeur | Notes |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (natif) | Multi-pages pris en charge |
| PSD | .psd | ImageMagick | Composite aplati |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Rastérisation à 300 ppp, sécurité durcie |
| OpenEXR | .exr | ImageMagick | Conversion linéaire vers sRGB |
| Radiance HDR | .hdr | ImageMagick | Conversion linéaire vers sRGB |
| DPX | .dpx | ImageMagick | Conversion logarithmique vers sRGB |
| Cineon | .cin | ImageMagick | Format film/VFX |

### RAW appareil photo (23) {#camera-raw-23}

| Format | Extensions | Marque d'appareil | Décodeur |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (universel) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (avant 2018) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (ancien) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (compact) | exiftool / ImageMagick + LibRaw |

### Formats modernes (3) {#modern-formats-3}

| Format | Extensions | Décodeur | Notes |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Cinéma numérique, imagerie médicale |
| QOI | .qoi | Codec TypeScript intégré | Développement de jeux, systèmes embarqués |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | Photos iPhone |

### Ancien/Système (4) {#legacy-system-4}

| Format | Extensions | Décodeur | Notes |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Plus grand calque extrait |
| CUR | .cur | ImageMagick | Curseur Windows (variante ICO) |
| TGA | .tga | ImageMagick | Détection par extension uniquement |

### Scientifiques et jeux vidéo (2) {#scientific-and-gaming-2}

| Format | Extensions | Décodeur | Notes |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Astronomie (standard NASA) |
| DDS | .dds | ImageMagick | Textures de jeu (DirectX) |

### Échange (6) {#interchange-6}

| Format | Extensions | Décodeur | Notes |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (natif) | Pixmap couleur |
| PGM | .pgm | Sharp (natif) | Niveaux de gris |
| PBM | .pbm | Sharp (natif) | Bitmap 1 bit |
| PNM | .pnm | Sharp (natif) | Format générique |
| PAM | .pam | Sharp (natif) | Carte arbitraire |
| PFM | .pfm | Sharp (natif) | Carte flottante |

## Formats de sortie (13) {#output-formats-13}

| Format | Encodeur | Contrôle de la qualité | Disponible dans |
|--------|---------|----------------|-------------|
| JPEG | Sharp natif | 1-100 | Tous les outils |
| PNG | Sharp natif | Compression 0-9 | Tous les outils |
| WebP | Sharp natif | 1-100 | Tous les outils |
| AVIF | Sharp natif | 1-100 | Tous les outils |
| TIFF | Sharp natif | 1-100 | Outils de conversion complète |
| GIF | Sharp natif | 1-100 | Outils de conversion complète |
| JXL | Sharp natif | 1-100 | Tous les outils |
| HEIC | CLI heif-enc | 1-100 | Outils de conversion complète |
| HEIF | CLI heif-enc | 1-100 | Outils de conversion complète |
| BMP | CLI ImageMagick | Sans perte | Outil de conversion |
| ICO | CLI ImageMagick | Sans perte | Outil de conversion |
| JP2 | CLI opj_compress | Taux de compression | Outil de conversion |
| QOI | Codec intégré | Sans perte | Outil de conversion |

## Formats vidéo {#video-formats}

Le décodage et l'encodage vidéo sont gérés par FFmpeg (build statique), de sorte que tous les conteneurs et codecs courants sont pris en charge en entrée.

### Conteneurs d'entrée (15) {#input-containers-15}

| Format | Extensions | Codecs typiques | Notes |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Conteneur le plus utilisé |
| QuickTime | .mov | H.264, ProRes | Capture/montage Apple |
| WebM | .webm | VP8, VP9, AV1 | Format web libre de redevances |
| Matroska | .mkv | Tous | Conteneur ouvert flexible |
| AVI | .avi | Divers | Ancien conteneur Microsoft |
| M4V | .m4v | H.264 | Variante MP4 d'Apple |
| AVCHD | .mts | H.264 | Enregistrements de caméscope |
| BDAV | .m2ts | H.264 | Flux de transport Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | Capture mobile |
| Flash Video | .flv | H.264, VP6 | Streaming ancien |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Vidéo de l'ère DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | Flux de transport de diffusion |
| Ogg | .ogv | Theora | Vidéo Ogg ouverte |

### Formats de sortie {#output-formats}

| Format | Extension | Codec vidéo | Produit par |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Convertir, compresser et la plupart des outils vidéo |
| QuickTime | .mov | H.264 | Convertir la vidéo |
| WebM | .webm | VP9 | Convertir la vidéo |
| GIF | .gif | - | Vidéo vers GIF |
| WebP | .webp | - | Vidéo vers WebP (animé) |

### Sous-titres {#subtitles}

| Format | Extension | Opérations |
|--------|-----------|-----------|
| SubRip | .srt | Intégrer, incruster, extraire, générer automatiquement |
| WebVTT | .vtt | Intégrer, incruster, extraire, générer automatiquement |
| ASS / SSA | .ass | Intégrer, incruster (prend en charge le style) |

## Formats audio {#audio-formats}

L'audio est également traité par FFmpeg.

### Formats d'entrée (11) {#input-formats-11}

| Format | Extensions | Compression | Notes |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Avec perte | Compatibilité universelle |
| WAV | .wav | Non compressé (PCM) | Studio / montage |
| FLAC | .flac | Sans perte | Codec ouvert sans perte |
| AAC | .aac | Avec perte | Flux AAC brut |
| M4A | .m4a | Avec perte (AAC) / Sans perte (ALAC) | Audio MPEG-4 |
| Ogg Vorbis | .ogg | Avec perte | Format ouvert |
| Opus | .opus | Avec perte | Moderne, faible latence |
| WMA | .wma | Avec perte | Windows Media Audio |
| AIFF | .aiff | Non compressé (PCM) | Non compressé Apple |
| AMR | .amr | Avec perte | Parole / mobile |
| AC-3 | .ac3 | Avec perte | Dolby Digital |

### Formats de sortie {#output-formats-1}

| Format | Extension | Codec | Produit par |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convertir l'audio, Extraire l'audio |
| WAV | .wav | PCM | Convertir l'audio, Extraire l'audio |
| FLAC | .flac | FLAC (sans perte) | Convertir l'audio |
| Ogg | .ogg | Vorbis | Convertir l'audio |
| M4A | .m4a | AAC | Convertir l'audio, Extraire l'audio |

## Formats de document {#document-formats}

Le traitement des documents utilise qpdf, LibreOffice, Ghostscript, Pandoc et WeasyPrint.

### Formats d'entrée (15) {#input-formats-15}

| Format | Extensions | Moteur | Notes |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Format de document principal |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Texte, feuille, présentation |
| Rich Text | .rtf | LibreOffice | Texte enrichi multiplateforme |
| Texte brut | .txt | LibreOffice, Pandoc | Texte UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Rendu en PDF |
| EPUB | .epub | Pandoc, LibreOffice | Format de livre électronique |

### Formats de sortie {#output-formats-2}

| Format | Extensions | Produit par |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint vers PDF, Markdown vers PDF, HTML vers PDF |
| PDF/A | .pdf | Conversion PDF/A (archivage) |
| Word | .docx, .odt, .rtf, .txt | Convertir un document, PDF vers Word, Markdown vers Word |
| Présentation | .pptx, .odp | Convertir une présentation |
| Feuille de calcul | .xlsx, .ods, .csv | Convertir une feuille de calcul |
| HTML | .html | Markdown vers HTML |
| EPUB | .epub | Convertir en EPUB |
| Images | .png, .jpg | PDF vers image |

## Formats de fichiers {#file-formats}

Les outils de données et d'archives convertissent entre des formats structurés et regroupent des fichiers.

| Format | Extensions | Conversions |
|--------|-----------|-------------|
| CSV | .csv | Vers/depuis JSON et Excel ; scinder et fusionner ; depuis XML |
| JSON | .json | Vers/depuis CSV, XML et YAML |
| XML | .xml | Vers/depuis JSON ; vers CSV |
| YAML | .yaml, .yml | Vers/depuis JSON |
| Excel | .xlsx | Vers/depuis CSV |
| ZIP | .zip | Créer des archives, extraire le contenu |
