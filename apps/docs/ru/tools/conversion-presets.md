---
description: "Выделенные эндпоинты пресетов конвертации, сгенерированные из каталога инструментов SnapOtter."
i18n_source_hash: 0dcd6c6c61d5
i18n_provenance: human
i18n_output_hash: 92baf2a31dea
i18n_hash_version: 2
---

# Пресеты конвертации {#conversion-presets}

SnapOtter предоставляет 121 выделенный эндпоинт пресетов конвертации в дополнение к базовым инструментам-конвертерам. Каждый пресет фиксирует выходной формат и делегирует обработку своему базовому конвейеру, поэтому поведение, валидация и контракт вывода совпадают с базовым инструментом, указанным ниже.

## Шаблон эндпоинта API {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

Отправьте `multipart/form-data` с частью `file` и необязательной JSON-строкой `settings`. Пресеты следуют контракту ответа базового инструмента. Быстрые пресеты обычно возвращают `200` с `downloadUrl`, но могут вернуть `202`, если превышают окно синхронного ожидания. Видеопресеты и длительные пресеты файлов/документов возвращают `202` и потоки прогресса из `/api/v1/jobs/<jobId>/progress`. Пресеты PDF-в-изображение возвращают URL для скачивания страниц плюс URL ZIP-архива.

## Пресеты изображений {#image-presets}

| ID пресета | Конвертирует | Маршрут | Базовый инструмент | Принимаемые входы | Необязательные настройки |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG в PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG в JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG в WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG в WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP в JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP в PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG в AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG в AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP в AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC в JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif`, `.hif` | quality |
| `heic-to-png` | HEIC в PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif`, `.hif` | quality |
| `heic-to-avif` | HEIC в AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif`, `.hif` | quality |
| `jpg-to-gif` | JPG в GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG в GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF в JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF в PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP в GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG в TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG в TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF в JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF в PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD в JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD в PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG в EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG в EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS в PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS в JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG в SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | none |
| `jpg-to-svg` | JPG в SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | none |
| `tiff-to-svg` | TIFF в SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | none |
| `psd-to-svg` | PSD в SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | none |
| `eps-to-svg` | EPS в SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | none |
| `svg-to-png` | SVG в PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG в JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG в PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG в PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC в PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif`, `.hif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF в PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP в PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF в PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS в PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Видеопресеты {#video-presets}

| ID пресета | Конвертирует | Маршрут | Базовый инструмент | Принимаемые входы | Необязательные настройки |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV в MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM в MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV в MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI в MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 в MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 в WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM в MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV в MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI в MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 в AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV в AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV в AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI в MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 в GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV в GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV в GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI в GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF в MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | none |
| `gif-to-webm` | GIF в WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | none |
| `gif-to-mov` | GIF в MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | none |
| `mp4-to-mp3` | MP4 в MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | none |
| `mov-to-mp3` | MOV в MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | none |
| `mkv-to-mp3` | MKV в MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | none |
| `webm-to-mp3` | WEBM в MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | none |
| `avi-to-mp3` | AVI в MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | none |
| `mp4-to-wav` | MP4 в WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | none |
| `mov-to-wav` | MOV в WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | none |
| `mp4-to-ogg` | MP4 в OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | none |
| `srt-to-vtt` | SRT в VTT | `/api/v1/tools/video/srt-to-vtt` | `convert-subtitles` | `.srt` | none |
| `vtt-to-srt` | VTT в SRT | `/api/v1/tools/video/vtt-to-srt` | `convert-subtitles` | `.vtt` | none |
| `ass-to-srt` | ASS в SRT | `/api/v1/tools/video/ass-to-srt` | `convert-subtitles` | `.ass` | none |
| `srt-to-ass` | SRT в ASS | `/api/v1/tools/video/srt-to-ass` | `convert-subtitles` | `.srt` | none |

## Аудиопресеты {#audio-presets}

| ID пресета | Конвертирует | Маршрут | Базовый инструмент | Принимаемые входы | Необязательные настройки |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A в MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | none |
| `m4a-to-wav` | M4A в WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | none |
| `aac-to-mp3` | AAC в MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | none |
| `aac-to-wav` | AAC в WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | none |
| `aac-to-flac` | AAC в FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | none |
| `ogg-to-mp3` | OGG в MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | none |
| `ogg-to-wav` | OGG в WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | none |
| `wav-to-mp3` | WAV в MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | none |
| `mp3-to-wav` | MP3 в WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | none |
| `flac-to-mp3` | FLAC в MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | none |
| `mp3-to-flac` | MP3 в FLAC | `/api/v1/tools/audio/mp3-to-flac` | `convert-audio` | `.mp3` | none |
| `mp3-to-ogg` | MP3 в OGG | `/api/v1/tools/audio/mp3-to-ogg` | `convert-audio` | `.mp3` | none |
| `mp3-to-m4a` | MP3 в M4A | `/api/v1/tools/audio/mp3-to-m4a` | `convert-audio` | `.mp3` | none |
| `wav-to-flac` | WAV в FLAC | `/api/v1/tools/audio/wav-to-flac` | `convert-audio` | `.wav` | none |
| `wav-to-ogg` | WAV в OGG | `/api/v1/tools/audio/wav-to-ogg` | `convert-audio` | `.wav` | none |
| `wav-to-m4a` | WAV в M4A | `/api/v1/tools/audio/wav-to-m4a` | `convert-audio` | `.wav` | none |
| `flac-to-wav` | FLAC в WAV | `/api/v1/tools/audio/flac-to-wav` | `convert-audio` | `.flac` | none |
| `flac-to-ogg` | FLAC в OGG | `/api/v1/tools/audio/flac-to-ogg` | `convert-audio` | `.flac` | none |
| `flac-to-m4a` | FLAC в M4A | `/api/v1/tools/audio/flac-to-m4a` | `convert-audio` | `.flac` | none |
| `ogg-to-flac` | OGG в FLAC | `/api/v1/tools/audio/ogg-to-flac` | `convert-audio` | `.ogg` | none |
| `ogg-to-m4a` | OGG в M4A | `/api/v1/tools/audio/ogg-to-m4a` | `convert-audio` | `.ogg` | none |
| `m4a-to-flac` | M4A в FLAC | `/api/v1/tools/audio/m4a-to-flac` | `convert-audio` | `.m4a` | none |
| `m4a-to-ogg` | M4A в OGG | `/api/v1/tools/audio/m4a-to-ogg` | `convert-audio` | `.m4a` | none |
| `aac-to-ogg` | AAC в OGG | `/api/v1/tools/audio/aac-to-ogg` | `convert-audio` | `.aac` | none |
| `aac-to-m4a` | AAC в M4A | `/api/v1/tools/audio/aac-to-m4a` | `convert-audio` | `.aac` | none |
| `opus-to-mp3` | Opus в MP3 | `/api/v1/tools/audio/opus-to-mp3` | `convert-audio` | `.opus` | none |
| `opus-to-wav` | Opus в WAV | `/api/v1/tools/audio/opus-to-wav` | `convert-audio` | `.opus` | none |
| `opus-to-flac` | Opus в FLAC | `/api/v1/tools/audio/opus-to-flac` | `convert-audio` | `.opus` | none |
| `opus-to-ogg` | Opus в OGG | `/api/v1/tools/audio/opus-to-ogg` | `convert-audio` | `.opus` | none |
| `opus-to-m4a` | Opus в M4A | `/api/v1/tools/audio/opus-to-m4a` | `convert-audio` | `.opus` | none |
| `wma-to-mp3` | WMA в MP3 | `/api/v1/tools/audio/wma-to-mp3` | `convert-audio` | `.wma` | none |
| `wma-to-wav` | WMA в WAV | `/api/v1/tools/audio/wma-to-wav` | `convert-audio` | `.wma` | none |
| `wma-to-flac` | WMA в FLAC | `/api/v1/tools/audio/wma-to-flac` | `convert-audio` | `.wma` | none |
| `wma-to-ogg` | WMA в OGG | `/api/v1/tools/audio/wma-to-ogg` | `convert-audio` | `.wma` | none |
| `wma-to-m4a` | WMA в M4A | `/api/v1/tools/audio/wma-to-m4a` | `convert-audio` | `.wma` | none |
| `aiff-to-mp3` | AIFF в MP3 | `/api/v1/tools/audio/aiff-to-mp3` | `convert-audio` | `.aiff` | none |
| `aiff-to-wav` | AIFF в WAV | `/api/v1/tools/audio/aiff-to-wav` | `convert-audio` | `.aiff` | none |
| `aiff-to-flac` | AIFF в FLAC | `/api/v1/tools/audio/aiff-to-flac` | `convert-audio` | `.aiff` | none |
| `aiff-to-ogg` | AIFF в OGG | `/api/v1/tools/audio/aiff-to-ogg` | `convert-audio` | `.aiff` | none |
| `aiff-to-m4a` | AIFF в M4A | `/api/v1/tools/audio/aiff-to-m4a` | `convert-audio` | `.aiff` | none |

## Пресеты PDF {#pdf-presets}

| ID пресета | Конвертирует | Маршрут | Базовый инструмент | Принимаемые входы | Необязательные настройки |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF в JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF в PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF в TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Пресеты файлов {#files-presets}

| ID пресета | Конвертирует | Маршрут | Базовый инструмент | Принимаемые входы | Необязательные настройки |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel в CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | none |
| `otf-to-ttf` | OTF в TTF | `/api/v1/tools/files/otf-to-ttf` | `convert-font` | `.otf` | none |
| `woff-to-ttf` | WOFF в TTF | `/api/v1/tools/files/woff-to-ttf` | `convert-font` | `.woff` | none |
| `woff2-to-ttf` | WOFF2 в TTF | `/api/v1/tools/files/woff2-to-ttf` | `convert-font` | `.woff2` | none |
| `ttf-to-woff2` | TTF в WOFF2 | `/api/v1/tools/files/ttf-to-woff2` | `convert-font` | `.ttf`, `.otf` | none |

## Примечания {#notes}

- Пресеты являются полноценными эндпоинтами API и также допустимы в пакетных запросах, где их базовый маршрут поддерживает пакетную обработку.
- Пресеты, использующие видеоконвертацию, могут возвращать `202 Accepted`; перед скачиванием результата подключитесь к SSE-эндпоинту прогресса задачи.
- Для расширенных параметров, не предоставляемых пресетом, вызывайте базовый инструмент-конвертер напрямую и задавайте выходной формат в `settings`.
