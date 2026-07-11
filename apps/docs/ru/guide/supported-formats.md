---
description: "Поддерживаемые форматы файлов по всем модальностям: 55+ входных форматов изображений, видео, аудио, PDF и файловые форматы."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: b2adfd5302a5
---

# Поддерживаемые форматы {#supported-formats}

SnapOtter обрабатывает файлы в пяти модальностях: изображения, видео, аудио, PDF и файлы. На этой странице перечислены все поддерживаемые форматы.

## Форматы изображений {#image-formats}

SnapOtter поддерживает 55+ форматов изображений на входе и 13 форматов на выходе.

## Входные форматы {#input-formats}

### Веб-стандарты (9) {#web-standards-9}

| Формат | Расширения | Декодер | Примечания |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (нативный) | |
| PNG | .png | Sharp (нативный) | Извлекается первый кадр APNG |
| WebP | .webp | Sharp (нативный) | |
| GIF | .gif | Sharp (нативный) | Поддерживается анимация |
| AVIF | .avif | Sharp (нативный) | |
| SVG | .svg | Sharp (librsvg) | Санитизация от XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Защита от gzip-бомб |
| APNG | .apng | Sharp (нативный) | Только первый кадр |
| JPEG XL | .jxl | djxl / ImageMagick | Двухуровневый запасной путь |

### Профессиональные (7) {#professional-7}

| Формат | Расширения | Декодер | Примечания |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (нативный) | Поддерживается многостраничность |
| PSD | .psd | ImageMagick | Сведённая композиция |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Растеризация 300dpi, усиленная защита |
| OpenEXR | .exr | ImageMagick | Преобразование Linear-to-sRGB |
| Radiance HDR | .hdr | ImageMagick | Преобразование Linear-to-sRGB |
| DPX | .dpx | ImageMagick | Преобразование Log-to-sRGB |
| Cineon | .cin | ImageMagick | Формат Film/VFX |

### RAW-форматы камер (23) {#camera-raw-23}

| Формат | Расширения | Марка камеры | Декодер |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (универсальный) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (устаревший) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (компактный) | exiftool / ImageMagick + LibRaw |

### Современные форматы (3) {#modern-formats-3}

| Формат | Расширения | Декодер | Примечания |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Цифровое кино, медицинская визуализация |
| QOI | .qoi | Встроенный кодек TypeScript | Разработка игр, встраиваемые системы |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | Фотографии iPhone |

### Устаревшие/системные (4) {#legacy-system-4}

| Формат | Расширения | Декодер | Примечания |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Извлекается самый большой слой |
| CUR | .cur | ImageMagick | Курсор Windows (вариант ICO) |
| TGA | .tga | ImageMagick | Определение только по расширению |

### Научные и игровые (2) {#scientific-and-gaming-2}

| Формат | Расширения | Декодер | Примечания |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Астрономия (стандарт NASA) |
| DDS | .dds | ImageMagick | Игровые текстуры (DirectX) |

### Обменные (6) {#interchange-6}

| Формат | Расширения | Декодер | Примечания |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (нативный) | Цветной pixmap |
| PGM | .pgm | Sharp (нативный) | Оттенки серого |
| PBM | .pbm | Sharp (нативный) | 1-битный bitmap |
| PNM | .pnm | Sharp (нативный) | Обобщающий формат |
| PAM | .pam | Sharp (нативный) | Произвольная карта |
| PFM | .pfm | Sharp (нативный) | Карта с плавающей точкой |

## Выходные форматы (13) {#output-formats-13}

| Формат | Кодировщик | Управление качеством | Доступно в |
|--------|---------|----------------|-------------|
| JPEG | Sharp нативный | 1-100 | Все инструменты |
| PNG | Sharp нативный | Сжатие 0-9 | Все инструменты |
| WebP | Sharp нативный | 1-100 | Все инструменты |
| AVIF | Sharp нативный | 1-100 | Все инструменты |
| TIFF | Sharp нативный | 1-100 | Инструменты полной конвертации |
| GIF | Sharp нативный | 1-100 | Инструменты полной конвертации |
| JXL | Sharp нативный | 1-100 | Все инструменты |
| HEIC | heif-enc CLI | 1-100 | Инструменты полной конвертации |
| HEIF | heif-enc CLI | 1-100 | Инструменты полной конвертации |
| BMP | ImageMagick CLI | Без потерь | Инструмент Convert |
| ICO | ImageMagick CLI | Без потерь | Инструмент Convert |
| JP2 | opj_compress CLI | Коэффициент сжатия | Инструмент Convert |
| QOI | Встроенный кодек | Без потерь | Инструмент Convert |

## Форматы видео {#video-formats}

Декодирование и кодирование видео выполняется FFmpeg (статическая сборка), поэтому на входе поддерживается любой распространённый контейнер и кодек.

### Входные контейнеры (15) {#input-containers-15}

| Формат | Расширения | Типичные кодеки | Примечания |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Наиболее широко используемый контейнер |
| QuickTime | .mov | H.264, ProRes | Съёмка/монтаж Apple |
| WebM | .webm | VP8, VP9, AV1 | Веб-формат без роялти |
| Matroska | .mkv | Любой | Гибкий открытый контейнер |
| AVI | .avi | Различные | Устаревший контейнер Microsoft |
| M4V | .m4v | H.264 | Вариант MP4 от Apple |
| AVCHD | .mts | H.264 | Записи видеокамер |
| BDAV | .m2ts | H.264 | Транспортный поток Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | Мобильная съёмка |
| Flash Video | .flv | H.264, VP6 | Устаревший стриминг |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Видео эпохи DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | Транспортный поток вещания |
| Ogg | .ogv | Theora | Открытое видео Ogg |

### Выходные форматы {#output-formats}

| Формат | Расширение | Видеокодек | Создаётся инструментом |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Convert, compress и большинство видеоинструментов |
| QuickTime | .mov | H.264 | Convert Video |
| WebM | .webm | VP9 | Convert Video |
| GIF | .gif | - | Video to GIF |
| WebP | .webp | - | Video to WebP (анимированный) |

### Субтитры {#subtitles}

| Формат | Расширение | Операции |
|--------|-----------|-----------|
| SubRip | .srt | Встраивание, наложение, извлечение, автогенерация |
| WebVTT | .vtt | Встраивание, наложение, извлечение, автогенерация |
| ASS / SSA | .ass | Встраивание, наложение (поддержка стилей) |

## Форматы аудио {#audio-formats}

Аудио также обрабатывается FFmpeg.

### Входные форматы (11) {#input-formats-11}

| Формат | Расширения | Сжатие | Примечания |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | С потерями | Универсальная совместимость |
| WAV | .wav | Без сжатия (PCM) | Студия / монтаж |
| FLAC | .flac | Без потерь | Открытый кодек без потерь |
| AAC | .aac | С потерями | Необработанный поток AAC |
| M4A | .m4a | С потерями (AAC) / Без потерь (ALAC) | Аудио MPEG-4 |
| Ogg Vorbis | .ogg | С потерями | Открытый формат |
| Opus | .opus | С потерями | Современный, с низкой задержкой |
| WMA | .wma | С потерями | Windows Media Audio |
| AIFF | .aiff | Без сжатия (PCM) | Несжатый формат Apple |
| AMR | .amr | С потерями | Речь / мобильные устройства |
| AC-3 | .ac3 | С потерями | Dolby Digital |

### Выходные форматы {#output-formats-1}

| Формат | Расширение | Кодек | Создаётся инструментом |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convert Audio, Extract Audio |
| WAV | .wav | PCM | Convert Audio, Extract Audio |
| FLAC | .flac | FLAC (без потерь) | Convert Audio |
| Ogg | .ogg | Vorbis | Convert Audio |
| M4A | .m4a | AAC | Convert Audio, Extract Audio |

## Форматы документов {#document-formats}

Обработка документов использует qpdf, LibreOffice, Ghostscript, Pandoc и WeasyPrint.

### Входные форматы (15) {#input-formats-15}

| Формат | Расширения | Движок | Примечания |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Основной формат документов |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Текст, таблица, презентация |
| Rich Text | .rtf | LibreOffice | Кроссплатформенный форматированный текст |
| Обычный текст | .txt | LibreOffice, Pandoc | Текст UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Рендеринг в PDF |
| EPUB | .epub | Pandoc, LibreOffice | Формат электронных книг |

### Выходные форматы {#output-formats-2}

| Формат | Расширения | Создаётся инструментом |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint to PDF, Markdown to PDF, HTML to PDF |
| PDF/A | .pdf | PDF/A Convert (архивный) |
| Word | .docx, .odt, .rtf, .txt | Convert Document, PDF to Word, Markdown to Word |
| Presentation | .pptx, .odp | Convert Presentation |
| Spreadsheet | .xlsx, .ods, .csv | Convert Spreadsheet |
| HTML | .html | Markdown to HTML |
| EPUB | .epub | Convert to EPUB |
| Изображения | .png, .jpg | PDF to Image |

## Файловые форматы {#file-formats}

Инструменты для работы с данными и архивами конвертируют между структурированными форматами и упаковывают файлы.

| Формат | Расширения | Конвертации |
|--------|-----------|-------------|
| CSV | .csv | В/из JSON и Excel; разделение и объединение; из XML |
| JSON | .json | В/из CSV, XML и YAML |
| XML | .xml | В/из JSON; в CSV |
| YAML | .yaml, .yml | В/из JSON |
| Excel | .xlsx | В/из CSV |
| ZIP | .zip | Создание архивов, извлечение содержимого |
