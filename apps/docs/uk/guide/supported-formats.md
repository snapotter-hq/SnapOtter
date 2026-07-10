---
description: "Підтримувані формати файлів у всіх модальностях - понад 55 форматів зображень для введення, а також відео, аудіо, PDF та файлові формати."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 3ae6fd2c03f0
---

# Підтримувані формати {#supported-formats}

SnapOtter обробляє файли у п'яти модальностях: зображення, відео, аудіо, PDF та файли. На цій сторінці перелічено всі підтримувані формати.

## Формати зображень {#image-formats}

SnapOtter підтримує понад 55 форматів зображень для введення та 13 форматів для виведення.

## Формати введення {#input-formats}

### Веб-стандарти (9) {#web-standards-9}

| Формат | Розширення | Декодер | Примітки |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (native) | |
| PNG | .png | Sharp (native) | Витягується перший кадр APNG |
| WebP | .webp | Sharp (native) | |
| GIF | .gif | Sharp (native) | Підтримується анімований |
| AVIF | .avif | Sharp (native) | |
| SVG | .svg | Sharp (librsvg) | Санітизовано проти XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Захист від gzip-бомб |
| APNG | .apng | Sharp (native) | Лише перший кадр |
| JPEG XL | .jxl | djxl / ImageMagick | Дворівневий резервний варіант |

### Професійні (7) {#professional-7}

| Формат | Розширення | Декодер | Примітки |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | Підтримується багатосторінковий |
| PSD | .psd | ImageMagick | Зведений композит |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Растеризація 300dpi, посилений захист |
| OpenEXR | .exr | ImageMagick | Перетворення Linear-to-sRGB |
| Radiance HDR | .hdr | ImageMagick | Перетворення Linear-to-sRGB |
| DPX | .dpx | ImageMagick | Перетворення Log-to-sRGB |
| Cineon | .cin | ImageMagick | Формат для кіно/VFX |

### Camera RAW (23) {#camera-raw-23}

| Формат | Розширення | Марка камери | Декодер |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (універсальний) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (до 2018) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (застарілий) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (компактний) | exiftool / ImageMagick + LibRaw |

### Сучасні формати (3) {#modern-formats-3}

| Формат | Розширення | Декодер | Примітки |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Цифрове кіно, медична візуалізація |
| QOI | .qoi | Вбудований кодек TypeScript | Розробка ігор, вбудовані системи |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | Фото з iPhone |

### Застарілі/системні (4) {#legacy-system-4}

| Формат | Розширення | Декодер | Примітки |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Витягується найбільший шар |
| CUR | .cur | ImageMagick | Курсор Windows (варіант ICO) |
| TGA | .tga | ImageMagick | Виявлення лише за розширенням |

### Наукові та ігрові (2) {#scientific-and-gaming-2}

| Формат | Розширення | Декодер | Примітки |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Астрономія (стандарт NASA) |
| DDS | .dds | ImageMagick | Ігрові текстури (DirectX) |

### Обмінні (6) {#interchange-6}

| Формат | Розширення | Декодер | Примітки |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | Кольорова піксельна карта |
| PGM | .pgm | Sharp (native) | Відтінки сірого |
| PBM | .pbm | Sharp (native) | 1-бітна растрова карта |
| PNM | .pnm | Sharp (native) | Загальний формат |
| PAM | .pam | Sharp (native) | Довільна карта |
| PFM | .pfm | Sharp (native) | Карта з плаваючою комою |

## Формати виведення (13) {#output-formats-13}

| Формат | Кодувальник | Контроль якості | Доступний у |
|--------|---------|----------------|-------------|
| JPEG | Sharp native | 1-100 | Усі інструменти |
| PNG | Sharp native | Стиснення 0-9 | Усі інструменти |
| WebP | Sharp native | 1-100 | Усі інструменти |
| AVIF | Sharp native | 1-100 | Усі інструменти |
| TIFF | Sharp native | 1-100 | Повні інструменти перетворення |
| GIF | Sharp native | 1-100 | Повні інструменти перетворення |
| JXL | Sharp native | 1-100 | Усі інструменти |
| HEIC | heif-enc CLI | 1-100 | Повні інструменти перетворення |
| HEIF | heif-enc CLI | 1-100 | Повні інструменти перетворення |
| BMP | ImageMagick CLI | Без втрат | Інструмент Convert |
| ICO | ImageMagick CLI | Без втрат | Інструмент Convert |
| JP2 | opj_compress CLI | Коефіцієнт стиснення | Інструмент Convert |
| QOI | Вбудований кодек | Без втрат | Інструмент Convert |

## Формати відео {#video-formats}

Декодування та кодування відео обробляються FFmpeg (статична збірка), тож кожен поширений контейнер і кодек підтримується на введенні.

### Контейнери введення (15) {#input-containers-15}

| Формат | Розширення | Типові кодеки | Примітки |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Найпоширеніший контейнер |
| QuickTime | .mov | H.264, ProRes | Захоплення/редагування Apple |
| WebM | .webm | VP8, VP9, AV1 | Веб-формат без роялті |
| Matroska | .mkv | Будь-який | Гнучкий відкритий контейнер |
| AVI | .avi | Різні | Застарілий контейнер Microsoft |
| M4V | .m4v | H.264 | Варіант MP4 від Apple |
| AVCHD | .mts | H.264 | Записи з відеокамер |
| BDAV | .m2ts | H.264 | Транспортний потік Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | Мобільне захоплення |
| Flash Video | .flv | H.264, VP6 | Застаріле стримінгове |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Відео епохи DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | Транспортний потік мовлення |
| Ogg | .ogv | Theora | Відкрите відео Ogg |

### Формати виведення {#output-formats}

| Формат | Розширення | Відеокодек | Створюється |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Інструменти Convert, compress та більшість відеоінструментів |
| QuickTime | .mov | H.264 | Convert Video |
| WebM | .webm | VP9 | Convert Video |
| GIF | .gif | - | Video to GIF |
| WebP | .webp | - | Video to WebP (анімований) |

### Субтитри {#subtitles}

| Формат | Розширення | Операції |
|--------|-----------|-----------|
| SubRip | .srt | Вбудовування, впалювання, витягування, автоматичне створення |
| WebVTT | .vtt | Вбудовування, впалювання, витягування, автоматичне створення |
| ASS / SSA | .ass | Вбудовування, впалювання (підтримує стилізацію) |

## Формати аудіо {#audio-formats}

Аудіо також обробляється FFmpeg.

### Формати введення (11) {#input-formats-11}

| Формат | Розширення | Стиснення | Примітки |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | З втратами | Універсальна сумісність |
| WAV | .wav | Без стиснення (PCM) | Студія / редагування |
| FLAC | .flac | Без втрат | Відкритий кодек без втрат |
| AAC | .aac | З втратами | Сирий потік AAC |
| M4A | .m4a | З втратами (AAC) / Без втрат (ALAC) | Аудіо MPEG-4 |
| Ogg Vorbis | .ogg | З втратами | Відкритий формат |
| Opus | .opus | З втратами | Сучасний, з низькою затримкою |
| WMA | .wma | З втратами | Windows Media Audio |
| AIFF | .aiff | Без стиснення (PCM) | Без стиснення Apple |
| AMR | .amr | З втратами | Мовлення / мобільні |
| AC-3 | .ac3 | З втратами | Dolby Digital |

### Формати виведення {#output-formats-1}

| Формат | Розширення | Кодек | Створюється |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convert Audio, Extract Audio |
| WAV | .wav | PCM | Convert Audio, Extract Audio |
| FLAC | .flac | FLAC (без втрат) | Convert Audio |
| Ogg | .ogg | Vorbis | Convert Audio |
| M4A | .m4a | AAC | Convert Audio, Extract Audio |

## Формати документів {#document-formats}

Обробка документів використовує qpdf, LibreOffice, Ghostscript, Pandoc та WeasyPrint.

### Формати введення (15) {#input-formats-15}

| Формат | Розширення | Рушій | Примітки |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Основний формат документів |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Текст, таблиця, презентація |
| Rich Text | .rtf | LibreOffice | Форматований текст для різних застосунків |
| Plain Text | .txt | LibreOffice, Pandoc | Текст UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Рендериться у PDF |
| EPUB | .epub | Pandoc, LibreOffice | Формат електронних книг |

### Формати виведення {#output-formats-2}

| Формат | Розширення | Створюється |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint to PDF, Markdown to PDF, HTML to PDF |
| PDF/A | .pdf | PDF/A Convert (архівний) |
| Word | .docx, .odt, .rtf, .txt | Convert Document, PDF to Word, Markdown to Word |
| Presentation | .pptx, .odp | Convert Presentation |
| Spreadsheet | .xlsx, .ods, .csv | Convert Spreadsheet |
| HTML | .html | Markdown to HTML |
| EPUB | .epub | Convert to EPUB |
| Images | .png, .jpg | PDF to Image |

## Файлові формати {#file-formats}

Інструменти для даних та архівів перетворюють структуровані формати між собою та пакують файли.

| Формат | Розширення | Перетворення |
|--------|-----------|-------------|
| CSV | .csv | До/з JSON та Excel; розділення та злиття; з XML |
| JSON | .json | До/з CSV, XML та YAML |
| XML | .xml | До/з JSON; до CSV |
| YAML | .yaml, .yml | До/з JSON |
| Excel | .xlsx | До/з CSV |
| ZIP | .zip | Створення архівів, витягування вмісту |
